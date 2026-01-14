use crate::types::{GameInfo, GameSnapshot, LiveConnectionState, MatchState};
use crate::AppState;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

#[cfg(windows)]
use rl_memory::RocketLeague;

/// Manages the live connection to Rocket League
pub struct LiveManager {
    /// Shared state - updated by polling loop, read by get_state()
    state: Arc<tokio::sync::Mutex<LiveConnectionState>>,
    /// Flag to signal the background task to stop
    running: Arc<AtomicBool>,
    /// Whether the polling task is currently active
    is_active: bool,
    /// Persistent RocketLeague instance - survives across start/stop cycles
    #[cfg(windows)]
    rl_instance: Arc<tokio::sync::Mutex<Option<RocketLeague>>>,
}

impl LiveManager {
    pub fn new() -> Self {
        Self {
            state: Arc::new(tokio::sync::Mutex::new(LiveConnectionState::Disconnected)),
            running: Arc::new(AtomicBool::new(false)),
            is_active: false,
            #[cfg(windows)]
            rl_instance: Arc::new(tokio::sync::Mutex::new(None)),
        }
    }

    pub fn get_state(&self) -> LiveConnectionState {
        // Use try_lock to avoid blocking - return last known state or Disconnected
        match self.state.try_lock() {
            Ok(guard) => guard.clone(),
            Err(_) => LiveConnectionState::Disconnected,
        }
    }

    /// Start the live monitoring system
    #[cfg(windows)]
    pub fn start(&mut self, app: AppHandle) -> Result<(), String> {
        if self.is_active {
            return Ok(()); // Already running
        }

        self.is_active = true;
        self.running.store(true, Ordering::SeqCst);

        let running = self.running.clone();
        let rl_instance = self.rl_instance.clone();
        let shared_state = self.state.clone();

        // Spawn background task using Tauri's async runtime
        tauri::async_runtime::spawn(async move {
            Self::polling_loop(app, running, rl_instance, shared_state).await;
        });

        tracing::info!("Live monitoring started");
        Ok(())
    }

    #[cfg(not(windows))]
    pub fn start(&mut self, _app: AppHandle) -> Result<(), String> {
        Err("Live monitoring is only available on Windows".to_string())
    }

    /// Stop the live monitoring system
    pub fn stop(&mut self) -> Result<(), String> {
        if !self.is_active {
            return Ok(()); // Already stopped
        }

        self.running.store(false, Ordering::SeqCst);
        self.is_active = false;
        // Don't reset state here - keep the last known state
        // so get_state() returns accurate info when restarting

        tracing::info!("Live monitoring stopped");
        Ok(())
    }

    /// Main polling loop - runs in a background task
    #[cfg(windows)]
    async fn polling_loop(
        app: AppHandle,
        running: Arc<AtomicBool>,
        rl_instance: Arc<tokio::sync::Mutex<Option<RocketLeague>>>,
        shared_state: Arc<tokio::sync::Mutex<LiveConnectionState>>,
    ) {
        // Get initial state from shared state (preserves state across restarts)
        let mut current_state = {
            let state_guard = shared_state.lock().await;
            state_guard.clone()
        };

        // Check if we have a cached RocketLeague instance
        {
            let rl_guard = rl_instance.lock().await;
            if rl_guard.is_some() {
                // We have a cached instance - if disconnected, move to Connected (InMenu)
                if matches!(current_state, LiveConnectionState::Disconnected) {
                    current_state = LiveConnectionState::Connected { match_state: MatchState::InMenu };
                }
                tracing::info!("Resuming with cached RocketLeague instance");
            }
        }

        // Update shared state and emit
        {
            let mut state_guard = shared_state.lock().await;
            *state_guard = current_state.clone();
        }
        let _ = app.emit("live_state_changed", &current_state);

        // Helper to update both local and shared state
        macro_rules! set_state {
            ($new_state:expr) => {{
                current_state = $new_state;
                {
                    let mut state_guard = shared_state.lock().await;
                    *state_guard = current_state.clone();
                }
                let _ = app.emit("live_state_changed", &current_state);
            }};
        }

        while running.load(Ordering::SeqCst) {
            match &current_state {
                LiveConnectionState::Disconnected => {
                    // Try to find and attach to Rocket League
                    match RocketLeague::attach() {
                        Ok(game) => {
                            tracing::info!("Attached to Rocket League process");
                            {
                                let mut rl_guard = rl_instance.lock().await;
                                *rl_guard = Some(game);
                            }
                            set_state!(LiveConnectionState::Connected { match_state: MatchState::InMenu });
                        }
                        Err(_) => {
                            // Game not running, wait and retry
                            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                        }
                    }
                }

                LiveConnectionState::Connected { match_state } => {
                    // First check if the game process is still running
                    let process_alive = {
                        let rl_guard = rl_instance.lock().await;
                        rl_guard.as_ref().map_or(false, |game| game.is_connected())
                    };

                    if !process_alive {
                        tracing::info!("Rocket League process closed");
                        {
                            let mut rl_guard = rl_instance.lock().await;
                            *rl_guard = None;
                        }
                        set_state!(LiveConnectionState::Disconnected);

                        // Auto-stop broadcast when game closes
                        if let Some(state) = app.try_state::<AppState>() {
                            let broadcast_manager = state.broadcast_manager.lock().await;
                            if broadcast_manager.is_broadcasting().await {
                                tracing::info!("Auto-stopping broadcast due to game closure");
                                if let Err(e) = broadcast_manager.stop().await {
                                    tracing::warn!("Failed to stop broadcast: {}", e);
                                }
                            }
                        }
                        continue;
                    }

                    // Read snapshot result while holding lock briefly
                    let snapshot_result = {
                        let rl_guard = rl_instance.lock().await;
                        if let Some(ref game) = *rl_guard {
                            Some(game.get_game_snapshot_with_boost_pads())
                        } else {
                            None
                        }
                    };

                    match snapshot_result {
                        Some(Ok(Some(snapshot))) => {
                            // We have match data - update to InMatch if needed
                            if *match_state != MatchState::InMatch {
                                tracing::info!("In match - receiving game data");
                                set_state!(LiveConnectionState::Connected { match_state: MatchState::InMatch });
                            }

                            // Convert and emit snapshot
                            let mut game_snapshot = GameSnapshot::from(&snapshot);

                            // Get game info (time, scores, etc.)
                            {
                                let rl_guard = rl_instance.lock().await;
                                if let Some(ref game) = *rl_guard {
                                    if let Ok(Some(info)) = game.get_game_info() {
                                        game_snapshot.game_info = Some(GameInfo::from(&info));
                                    }
                                }
                            }

                            let _ = app.emit("live_snapshot", &game_snapshot);

                            // Send snapshot to broadcast if active
                            if let Some(state) = app.try_state::<AppState>() {
                                let broadcast_manager = state.broadcast_manager.lock().await;
                                if broadcast_manager.is_broadcasting().await {
                                    if let Err(e) = broadcast_manager.send_snapshot(&game_snapshot).await {
                                        tracing::warn!("Failed to send broadcast snapshot: {}", e);
                                    }
                                }
                            }

                            // 30 FPS = ~33ms
                            tokio::time::sleep(tokio::time::Duration::from_millis(33)).await;
                        }
                        Some(Ok(None)) => {
                            // No match data - update to InMenu if needed
                            if *match_state != MatchState::InMenu {
                                tracing::info!("In menu - no game data");
                                set_state!(LiveConnectionState::Connected { match_state: MatchState::InMenu });
                            }

                            // Send menu state to broadcast if active (so viewers see "in menu" message)
                            if let Some(state) = app.try_state::<AppState>() {
                                let broadcast_manager = state.broadcast_manager.lock().await;
                                if broadcast_manager.is_broadcasting().await {
                                    if let Err(e) = broadcast_manager.send_menu_state().await {
                                        tracing::warn!("Failed to send menu state to broadcast: {}", e);
                                    }
                                }
                            }

                            // Check less frequently when not in match
                            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                        }
                        Some(Err(e)) => {
                            // Read error - likely game closed
                            tracing::warn!("Failed to read snapshot: {}", e);
                            // Clear the cached instance
                            {
                                let mut rl_guard = rl_instance.lock().await;
                                *rl_guard = None;
                            }
                            set_state!(LiveConnectionState::Disconnected);

                            // Auto-stop broadcast when game closes
                            if let Some(state) = app.try_state::<AppState>() {
                                let broadcast_manager = state.broadcast_manager.lock().await;
                                if broadcast_manager.is_broadcasting().await {
                                    tracing::info!("Auto-stopping broadcast - game closed");
                                    let _ = broadcast_manager.stop().await;
                                }
                            }
                        }
                        None => {
                            // Lost reference to game - go back to disconnected
                            set_state!(LiveConnectionState::Disconnected);
                        }
                    }
                }

                LiveConnectionState::Connecting => {
                    // This state is transitional, handled in attach
                    set_state!(LiveConnectionState::Disconnected);
                }

                LiveConnectionState::Error { .. } => {
                    // Error state - wait then retry
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                    set_state!(LiveConnectionState::Disconnected);
                }
            }
        }

        // Cleanup on exit - emit Disconnected but don't update shared state
        // (the actual connection state is preserved for quick restart)
        let _ = app.emit("live_state_changed", LiveConnectionState::Disconnected);
        tracing::info!("Live polling loop stopped");
    }
}

impl Default for LiveManager {
    fn default() -> Self {
        Self::new()
    }
}
