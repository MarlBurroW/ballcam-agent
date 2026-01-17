//! BroadcastManager handles Socket.IO connection to ballcam.tv for live streaming.
//!
//! Responsibilities:
//! - Connect to ballcam.tv with JWT authentication
//! - Start/stop broadcast sessions
//! - Stream game snapshots at 30 FPS
//! - Handle reconnection and errors

use crate::types::{BroadcastState, GameInfo, GameSnapshot, Visibility};
use bytes::Bytes;
use rust_socketio::asynchronous::{Client, ClientBuilder};
use rust_socketio::{Payload, TransportType};
use serde_json::json;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

use super::encoder::encode_snapshot;

/// Base URL for ballcam.tv Socket.IO server
/// Can be overridden with BALLCAM_SOCKET_URL env var for testing
fn get_socket_url() -> String {
    if let Ok(url) = std::env::var("BALLCAM_SOCKET_URL") {
        return url;
    }
    #[cfg(dev)]
    {
        "http://localhost:3000".to_string()
    }
    #[cfg(not(dev))]
    {
        "https://api.ballcam.tv".to_string()
    }
}

/// Socket.IO namespace for live streaming
const LIVE_NAMESPACE: &str = "/live";

/// Connection timeout in seconds
const CONNECT_TIMEOUT_SECS: u64 = 3;

/// Interval for emitting traffic stats (3 times per second)
const TRAFFIC_EMIT_INTERVAL_MS: u128 = 333;

/// Interval for periodic game info updates (15 seconds)
const GAME_INFO_PERIODIC_INTERVAL_SECS: u64 = 15;

/// Tracks the last sent game info state for change detection
#[derive(Default, Clone)]
struct LastGameInfoState {
    playlist_id: i32,
    score_blue: u32,
    score_orange: u32,
    is_overtime: bool,
}

/// Manages the broadcast connection to ballcam.tv
pub struct BroadcastManager {
    /// Current broadcast state
    state: Arc<Mutex<BroadcastState>>,
    /// Socket.IO client (when connected)
    socket: Arc<Mutex<Option<Client>>>,
    /// Tauri app handle for emitting events
    app_handle: Arc<Mutex<Option<AppHandle>>>,
    /// Total bytes sent since broadcast started
    bytes_sent: AtomicU64,
    /// Total snapshots sent since broadcast started
    snapshots_sent: AtomicU64,
    /// Last time traffic stats were emitted
    last_traffic_emit: Mutex<Instant>,
    /// Last sent game info state for change detection
    last_game_info: Mutex<Option<LastGameInfoState>>,
    /// Last time game info was emitted
    last_game_info_emit: Mutex<Instant>,
    /// Pending viewer count received before state is Broadcasting
    pending_viewer_count: Arc<Mutex<u32>>,
    /// Auth error received during connection (set by error handler)
    auth_error: Arc<Mutex<Option<String>>>,
}

impl BroadcastManager {
    /// Create a new BroadcastManager
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(BroadcastState::default())),
            socket: Arc::new(Mutex::new(None)),
            app_handle: Arc::new(Mutex::new(None)),
            bytes_sent: AtomicU64::new(0),
            snapshots_sent: AtomicU64::new(0),
            last_traffic_emit: Mutex::new(Instant::now()),
            last_game_info: Mutex::new(None),
            last_game_info_emit: Mutex::new(Instant::now()),
            pending_viewer_count: Arc::new(Mutex::new(0)),
            auth_error: Arc::new(Mutex::new(None)),
        }
    }

    /// Set the app handle for event emission
    pub async fn set_app_handle(&self, app: AppHandle) {
        let mut handle = self.app_handle.lock().await;
        *handle = Some(app);
    }

    /// Get the current broadcast state
    pub async fn get_state(&self) -> BroadcastState {
        self.state.lock().await.clone()
    }

    /// Start a broadcast session
    ///
    /// Connects to ballcam.tv and starts streaming.
    /// Returns (session_id, share_url, channel_url, username, title) on success.
    pub async fn start(
        &self,
        token: &str,
        visibility: Visibility,
        environment_id: Option<String>,
        title: Option<String>,
    ) -> Result<(String, String, String, String, String), String> {
        // Check if already broadcasting
        {
            let state = self.state.lock().await;
            if matches!(*state, BroadcastState::Broadcasting { .. }) {
                return Err("Already broadcasting".to_string());
            }
        }

        // Update state to Starting
        self.set_state(BroadcastState::Starting).await;

        // Reset traffic counters and game info tracking
        self.reset_traffic_stats();
        self.reset_game_info_tracking().await;

        // Run the actual start logic, resetting state on error
        match self.start_inner(token, visibility.clone(), environment_id, title).await {
            Ok(result) => Ok(result),
            Err(e) => {
                self.set_state(BroadcastState::Error {
                    message: e.clone(),
                    code: None,
                }).await;
                Err(e)
            }
        }
    }

    /// Internal start logic
    async fn start_inner(
        &self,
        token: &str,
        visibility: Visibility,
        environment_id: Option<String>,
        title: Option<String>,
    ) -> Result<(String, String, String, String, String), String> {
        tracing::info!("Starting broadcast with visibility: {}, environment: {:?}", visibility, environment_id);

        // Reset pending viewer count and auth error for new broadcast
        *self.pending_viewer_count.lock().await = 0;
        *self.auth_error.lock().await = None;

        // Build Socket.IO connection with auth
        let socket_url = get_socket_url();
        tracing::info!("Connecting to Socket.IO at: {} namespace: {}", socket_url, LIVE_NAMESPACE);

        // Clone Arcs for listeners
        let state_for_viewer = self.state.clone();
        let app_for_viewer = self.app_handle.clone();
        let pending_count_for_viewer = self.pending_viewer_count.clone();
        let auth_error_for_handler = self.auth_error.clone();

        let socket = ClientBuilder::new(&socket_url)
            .namespace(LIVE_NAMESPACE)
            // Force WebSocket transport to avoid sticky session issues with multiple backend replicas
            // (HTTP polling requires session affinity which rust_socketio doesn't support via cookies)
            .transport_type(TransportType::Websocket)
            .auth(json!({
                "token": token,
                "role": "broadcaster"
            }))
            .on("connect", |_, _| {
                Box::pin(async move {
                    tracing::info!("Socket.IO 'connect' event received");
                })
            })
            .on("error", move |payload, _| {
                let auth_error = auth_error_for_handler.clone();
                Box::pin(async move {
                    tracing::error!("Socket.IO 'error' event: {:?}", payload);

                    // Check if this is an auth error (ConnectError with token message)
                    if let Payload::Text(values) = &payload {
                        if let Some(first) = values.first() {
                            let text = first.as_str().unwrap_or("");
                            if text.contains("Invalid or expired token") {
                                tracing::warn!("Authentication failed: token invalid or expired");
                                *auth_error.lock().await = Some("Token invalide ou expiré. Veuillez vous reconnecter.".to_string());
                            } else if text.contains("ConnectError") {
                                tracing::warn!("Connection error: {}", text);
                                *auth_error.lock().await = Some(format!("Erreur de connexion: {}", text));
                            }
                        }
                    }
                })
            })
            .on("viewer-count", move |payload, _| {
                let state = state_for_viewer.clone();
                let app_handle = app_for_viewer.clone();
                let pending_count = pending_count_for_viewer.clone();
                Box::pin(async move {
                    // Parse viewer count from payload
                    if let Payload::Text(values) = payload {
                        if let Some(first) = values.first() {
                            if let Some(count) = first.get("count").and_then(|v| v.as_u64()) {
                                let viewer_count = count as u32;
                                tracing::info!("Viewer count update received: {}", viewer_count);

                                // Store pending count (quick lock)
                                *pending_count.lock().await = viewer_count;

                                // Update state if Broadcasting - release lock before emitting
                                let state_to_emit = {
                                    let mut current_state = state.lock().await;
                                    if let BroadcastState::Broadcasting { viewer_count: ref mut vc, .. } = *current_state {
                                        *vc = viewer_count;
                                        Some(current_state.clone())
                                    } else {
                                        None
                                    }
                                }; // state lock released here

                                // Emit to frontend (state lock already released)
                                if let Some(new_state) = state_to_emit {
                                    if let Some(app) = app_handle.lock().await.as_ref() {
                                        let _ = app.emit("broadcast_state_changed", &new_state);
                                    }
                                }
                            }
                        }
                    }
                })
            })
            .connect()
            .await
            .map_err(|e| {
                let msg = format!("Connection failed: {:?}", e);
                tracing::error!("{}", msg);
                msg
            })?;

        tracing::info!("Connected to ballcam.tv");

        // Wait for WebSocket connection to be fully established
        // Production environments may have higher latency
        tokio::time::sleep(Duration::from_millis(500)).await;

        // Check if an auth error occurred during connection handshake
        if let Some(error_msg) = self.auth_error.lock().await.take() {
            // Disconnect the socket since auth failed
            let _ = socket.disconnect().await;
            return Err(error_msg);
        }

        // Emit broadcast-start and wait for response
        let visibility_str = visibility.to_string();
        tracing::info!("Sending broadcast-start with visibility: {}, environment: {:?}", visibility_str, environment_id);

        let (tx, rx) = tokio::sync::oneshot::channel();
        let tx = Arc::new(Mutex::new(Some(tx)));

        // Build payload with optional environmentId and title
        let mut payload = json!({ "visibility": visibility_str });
        if let Some(ref env_id) = environment_id {
            payload["environmentId"] = json!(env_id);
        }
        if let Some(ref stream_title) = title {
            payload["title"] = json!(stream_title);
        }

        let tx_clone = tx.clone();
        socket
            .emit_with_ack(
                "broadcast-start",
                payload,
                Duration::from_secs(CONNECT_TIMEOUT_SECS),
                move |payload, _socket| {
                    let tx = tx_clone.clone();
                    Box::pin(async move {
                        tracing::info!("Received ack for broadcast-start: {:?}", payload);
                        if let Some(sender) = tx.lock().await.take() {
                            let _ = sender.send(payload);
                        }
                    })
                },
            )
            .await
            .map_err(|e| format!("broadcast-start emit failed: {}", e))?;

        tracing::info!("broadcast-start emitted, waiting for response...");

        // Wait for response with timeout
        let response = tokio::time::timeout(
            Duration::from_secs(CONNECT_TIMEOUT_SECS + 2),
            rx
        )
        .await
        .map_err(|_| "Timeout waiting for broadcast-start response (server didn't respond)".to_string())?
        .map_err(|_| "Channel closed while waiting for broadcast-start response".to_string())?;

        tracing::info!("Got broadcast-start response");

        // Parse response
        // Note: rust_socketio wraps ack responses as Text([Array [Object {...}]])
        // So we need to unwrap the array first to get the actual response object
        let (session_id, share_url, channel_url, username, stream_title) = match response {
            Payload::Text(values) => {
                // Get the first element (which is an Array containing the response)
                let first = values.first().ok_or("Empty response from server")?;

                // The response might be wrapped in an array, so unwrap it
                let value = if let Some(arr) = first.as_array() {
                    arr.first().ok_or("Empty array in response")?
                } else {
                    // If it's not an array, use it directly (fallback for different socketio versions)
                    first
                };

                let success = value.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
                if success {
                    let session_id = value
                        .get("sessionId")
                        .and_then(|v| v.as_str())
                        .ok_or("Missing sessionId")?
                        .to_string();
                    let channel_url = value
                        .get("channelUrl")
                        .and_then(|v| v.as_str())
                        .ok_or("Missing channelUrl")?
                        .to_string();
                    // shareUrl is deprecated, fall back to channelUrl if not present
                    let share_url = value
                        .get("shareUrl")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| channel_url.clone());
                    let username = value
                        .get("username")
                        .and_then(|v| v.as_str())
                        .ok_or("Missing username")?
                        .to_string();
                    let stream_title = value
                        .get("title")
                        .and_then(|v| v.as_str())
                        .ok_or("Missing title")?
                        .to_string();
                    (session_id, share_url, channel_url, username, stream_title)
                } else {
                    let error = value
                        .get("error")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Unknown error");
                    return Err(format!("Server error: {}", error));
                }
            }
            _ => return Err("Unexpected response format".to_string()),
        };

        tracing::info!(
            session_id = %session_id,
            share_url = %share_url,
            channel_url = %channel_url,
            username = %username,
            title = %stream_title,
            "Broadcast started"
        );

        // Store socket and update state
        {
            let mut sock = self.socket.lock().await;
            *sock = Some(socket);
        }

        let started_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        // Use pending viewer count if any was received during connection setup
        let initial_viewer_count = *self.pending_viewer_count.lock().await;

        self.set_state(BroadcastState::Broadcasting {
            session_id: session_id.clone(),
            share_url: share_url.clone(),
            channel_url: channel_url.clone(),
            username: username.clone(),
            title: stream_title.clone(),
            visibility,
            started_at,
            viewer_count: initial_viewer_count,
        })
        .await;

        Ok((session_id, share_url, channel_url, username, stream_title))
    }

    /// Stop the current broadcast
    pub async fn stop(&self) -> Result<(), String> {
        let socket = {
            let sock = self.socket.lock().await;
            sock.clone()
        };

        if let Some(socket) = socket {
            self.set_state(BroadcastState::Stopping).await;

            tracing::info!("Stopping broadcast");

            // Emit broadcast-stop
            let (tx, rx) = tokio::sync::oneshot::channel();
            let tx = Arc::new(Mutex::new(Some(tx)));
            let tx_clone = tx.clone();

            socket
                .emit_with_ack(
                    "broadcast-stop",
                    json!({}),
                    Duration::from_secs(CONNECT_TIMEOUT_SECS),
                    move |payload, _socket| {
                        let tx = tx_clone.clone();
                        Box::pin(async move {
                            if let Some(sender) = tx.lock().await.take() {
                                let _ = sender.send(payload);
                            }
                        })
                    },
                )
                .await
                .ok(); // Ignore errors on stop

            // Wait for response (with timeout)
            let _ = tokio::time::timeout(Duration::from_secs(2), rx).await;

            // Disconnect socket
            socket.disconnect().await.ok();

            // Clear socket reference
            {
                let mut sock = self.socket.lock().await;
                *sock = None;
            }

            tracing::info!("Broadcast stopped");
        }

        self.set_state(BroadcastState::NotBroadcasting).await;
        Ok(())
    }

    /// Send a game snapshot to the server
    pub async fn send_snapshot(&self, snapshot: &GameSnapshot) -> Result<(), String> {
        let socket = {
            let sock = self.socket.lock().await;
            sock.clone()
        };

        if let Some(socket) = socket {
            // Encode snapshot to binary
            let encoded = encode_snapshot(snapshot);
            let byte_count = encoded.len() as u64;
            let bytes = Bytes::from(encoded.to_vec());

            // Emit as binary (fire and forget for performance)
            socket
                .emit("broadcast-snapshot", Payload::Binary(bytes.to_vec().into()))
                .await
                .map_err(|e| format!("Failed to send snapshot: {}", e))?;

            // Track bytes and snapshots sent
            self.bytes_sent.fetch_add(byte_count, Ordering::Relaxed);
            self.snapshots_sent.fetch_add(1, Ordering::Relaxed);

            // Emit traffic stats periodically (3 times per second)
            self.maybe_emit_traffic_stats().await;

            // Send game info if changed or periodic
            if let Some(ref info) = snapshot.game_info {
                self.maybe_send_game_info(info).await;
            }

            Ok(())
        } else {
            Err("Not connected".to_string())
        }
    }

    /// Emit traffic stats if enough time has passed
    async fn maybe_emit_traffic_stats(&self) {
        let now = Instant::now();
        let should_emit = {
            let last_emit = self.last_traffic_emit.lock().await;
            now.duration_since(*last_emit).as_millis() >= TRAFFIC_EMIT_INTERVAL_MS
        };

        if should_emit {
            let mut last_emit = self.last_traffic_emit.lock().await;
            *last_emit = now;

            let total_bytes = self.bytes_sent.load(Ordering::Relaxed);
            let total_snapshots = self.snapshots_sent.load(Ordering::Relaxed);

            // Emit to frontend
            if let Some(app) = &*self.app_handle.lock().await {
                let _ = app.emit("live_traffic", json!({
                    "bytesSent": total_bytes,
                    "snapshotsSent": total_snapshots
                }));
            }
        }
    }

    /// Reset traffic counters (call when broadcast starts)
    pub fn reset_traffic_stats(&self) {
        self.bytes_sent.store(0, Ordering::Relaxed);
        self.snapshots_sent.store(0, Ordering::Relaxed);
    }

    /// Reset game info tracking (call when broadcast starts)
    pub async fn reset_game_info_tracking(&self) {
        let mut last_info = self.last_game_info.lock().await;
        *last_info = None;
        let mut last_emit = self.last_game_info_emit.lock().await;
        *last_emit = Instant::now();
    }

    /// Send game info update to the server
    /// Called when game state changes (score, overtime) or periodically
    pub async fn send_game_info(&self, info: &GameInfo) -> Result<(), String> {
        let socket = {
            let sock = self.socket.lock().await;
            sock.clone()
        };

        if let Some(socket) = socket {
            let payload = json!({
                "playlistId": info.playlist_id,
                "playlistName": info.playlist_name,
                "scoreBlue": info.score_blue,
                "scoreOrange": info.score_orange,
                "isOvertime": info.is_overtime
            });

            socket
                .emit("broadcast-game-info", payload)
                .await
                .map_err(|e| format!("Failed to send game info: {}", e))?;

            tracing::debug!(
                playlist_id = info.playlist_id,
                score = %format!("{}:{}", info.score_blue, info.score_orange),
                overtime = info.is_overtime,
                "Sent game info update"
            );

            // Update last sent state
            {
                let mut last = self.last_game_info.lock().await;
                *last = Some(LastGameInfoState {
                    playlist_id: info.playlist_id,
                    score_blue: info.score_blue,
                    score_orange: info.score_orange,
                    is_overtime: info.is_overtime,
                });
            }

            // Update last emit time
            {
                let mut last_emit = self.last_game_info_emit.lock().await;
                *last_emit = Instant::now();
            }

            Ok(())
        } else {
            Err("Not connected".to_string())
        }
    }

    /// Check if game info should be sent and send if needed
    /// Returns true if game info was sent
    pub async fn maybe_send_game_info(&self, info: &GameInfo) -> bool {
        let now = Instant::now();
        let last_state = self.last_game_info.lock().await.clone();
        let last_emit = *self.last_game_info_emit.lock().await;

        // Check if we should send (change detected or periodic)
        let should_send = match last_state {
            None => true, // First game info
            Some(ref last) => {
                // Check for changes
                let changed = last.playlist_id != info.playlist_id
                    || last.score_blue != info.score_blue
                    || last.score_orange != info.score_orange
                    || last.is_overtime != info.is_overtime;

                // Check periodic interval
                let periodic = now.duration_since(last_emit).as_secs() >= GAME_INFO_PERIODIC_INTERVAL_SECS;

                changed || periodic
            }
        };

        if should_send {
            if let Err(e) = self.send_game_info(info).await {
                tracing::warn!("Failed to send game info: {}", e);
                return false;
            }
            return true;
        }

        false
    }

    /// Send menu state to the server (player is not in a match)
    pub async fn send_menu_state(&self) -> Result<(), String> {
        let socket = {
            let sock = self.socket.lock().await;
            sock.clone()
        };

        if let Some(socket) = socket {
            // Emit menu state (fire and forget)
            socket
                .emit("broadcast-menu", json!({"inMenu": true}))
                .await
                .map_err(|e| format!("Failed to send menu state: {}", e))?;

            Ok(())
        } else {
            Err("Not connected".to_string())
        }
    }

    /// Check if currently broadcasting
    pub async fn is_broadcasting(&self) -> bool {
        let state = self.state.lock().await;
        matches!(*state, BroadcastState::Broadcasting { .. })
    }

    /// Set the environment during an active broadcast
    pub async fn set_environment(&self, environment_id: &str) -> Result<(), String> {
        let socket = {
            let sock = self.socket.lock().await;
            sock.clone()
        };

        if let Some(socket) = socket {
            tracing::info!("Setting environment to: {}", environment_id);

            let (tx, rx) = tokio::sync::oneshot::channel();
            let tx = Arc::new(Mutex::new(Some(tx)));
            let tx_clone = tx.clone();

            socket
                .emit_with_ack(
                    "set-environment",
                    json!({ "environmentId": environment_id }),
                    Duration::from_secs(5),
                    move |payload, _socket| {
                        let tx = tx_clone.clone();
                        Box::pin(async move {
                            if let Some(sender) = tx.lock().await.take() {
                                let _ = sender.send(payload);
                            }
                        })
                    },
                )
                .await
                .map_err(|e| format!("Failed to emit set-environment: {}", e))?;

            // Wait for response
            let response = tokio::time::timeout(Duration::from_secs(5), rx)
                .await
                .map_err(|_| "Timeout waiting for set-environment response")?
                .map_err(|_| "Channel closed")?;

            // Parse response
            match response {
                Payload::Text(values) => {
                    let first = values.first().ok_or("Empty response")?;
                    let value = if let Some(arr) = first.as_array() {
                        arr.first().ok_or("Empty array in response")?
                    } else {
                        first
                    };

                    let success = value.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
                    if success {
                        tracing::info!("Environment set successfully");
                        Ok(())
                    } else {
                        let error = value
                            .get("error")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Unknown error");
                        Err(format!("Server error: {}", error))
                    }
                }
                _ => Err("Unexpected response format".to_string()),
            }
        } else {
            Err("Not connected".to_string())
        }
    }

    /// Set the stream title during an active broadcast
    /// Rate limited to 1 change per 5 seconds by the server
    pub async fn set_title(&self, title: &str) -> Result<String, String> {
        // Validate title length
        if title.len() > 100 {
            return Err("Title must be 100 characters or less".to_string());
        }

        let socket = {
            let sock = self.socket.lock().await;
            sock.clone()
        };

        if let Some(socket) = socket {
            tracing::info!("Setting title to: {}", title);

            let (tx, rx) = tokio::sync::oneshot::channel();
            let tx = Arc::new(Mutex::new(Some(tx)));
            let tx_clone = tx.clone();

            socket
                .emit_with_ack(
                    "set-title",
                    json!({ "title": title }),
                    Duration::from_secs(5),
                    move |payload, _socket| {
                        let tx = tx_clone.clone();
                        Box::pin(async move {
                            if let Some(sender) = tx.lock().await.take() {
                                let _ = sender.send(payload);
                            }
                        })
                    },
                )
                .await
                .map_err(|e| format!("Failed to emit set-title: {}", e))?;

            // Wait for response
            let response = tokio::time::timeout(Duration::from_secs(5), rx)
                .await
                .map_err(|_| "Timeout waiting for set-title response")?
                .map_err(|_| "Channel closed")?;

            // Parse response
            match response {
                Payload::Text(values) => {
                    let first = values.first().ok_or("Empty response")?;
                    let value = if let Some(arr) = first.as_array() {
                        arr.first().ok_or("Empty array in response")?
                    } else {
                        first
                    };

                    let success = value.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
                    if success {
                        let new_title = value
                            .get("title")
                            .and_then(|v| v.as_str())
                            .unwrap_or(title)
                            .to_string();
                        tracing::info!("Title set successfully: {}", new_title);

                        // Update the title in broadcast state
                        {
                            let mut state = self.state.lock().await;
                            if let BroadcastState::Broadcasting { title: ref mut t, .. } = *state {
                                *t = new_title.clone();
                            }
                        }
                        // Emit state change to update UI
                        self.emit_current_state().await;

                        Ok(new_title)
                    } else {
                        let error = value
                            .get("error")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Unknown error");
                        Err(format!("Server error: {}", error))
                    }
                }
                _ => Err("Unexpected response format".to_string()),
            }
        } else {
            Err("Not connected".to_string())
        }
    }

    /// Emit current state to frontend
    async fn emit_current_state(&self) {
        let state = self.state.lock().await.clone();
        if let Some(app) = self.app_handle.lock().await.as_ref() {
            let _ = app.emit("broadcast_state_changed", &state);
        }
    }

    /// Update state and emit event
    async fn set_state(&self, new_state: BroadcastState) {
        {
            let mut state = self.state.lock().await;
            *state = new_state.clone();
        }

        // Emit state change event
        if let Some(app) = self.app_handle.lock().await.as_ref() {
            let _ = app.emit("broadcast_state_changed", &new_state);
        }
    }
}

impl Default for BroadcastManager {
    fn default() -> Self {
        Self::new()
    }
}
