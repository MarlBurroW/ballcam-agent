pub mod commands;
pub mod config;
pub mod health;
pub mod live;
pub mod types;
pub mod uploader;
pub mod watcher;

use std::sync::Mutex;
use tauri::Manager;
use health::HealthChecker;
use live::{BroadcastManager, LiveManager};
use watcher::FileWatcher;

// Global state for the application
pub struct AppState {
    pub watcher: Mutex<FileWatcher>,
    pub live_manager: Mutex<LiveManager>,
    pub broadcast_manager: tokio::sync::Mutex<BroadcastManager>,
    pub health_checker: HealthChecker,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive(tracing::Level::INFO.into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState {
            watcher: Mutex::new(FileWatcher::new()),
            live_manager: Mutex::new(LiveManager::new()),
            broadcast_manager: tokio::sync::Mutex::new(BroadcastManager::new()),
            health_checker: HealthChecker::new(),
        })
        .setup(|app| {
            tracing::info!("BallCam Agent starting...");

            // Set up tray icon
            #[cfg(desktop)]
            {
                use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
                use tauri::tray::TrayIconBuilder;
                use tauri::Emitter;

                let pause = MenuItem::with_id(app, "pause", "Pause Watching", true, None::<&str>)?;
                let sep1 = PredefinedMenuItem::separator(app)?;
                let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
                let history = MenuItem::with_id(app, "history", "Upload History", true, None::<&str>)?;
                let sep2 = PredefinedMenuItem::separator(app)?;
                let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&pause, &sep1, &settings, &history, &sep2, &quit])?;

                TrayIconBuilder::with_id("main")
                    .icon(app.default_window_icon().unwrap().clone())
                    .tooltip("BallCam Agent")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| {
                        match event.id.as_ref() {
                            "pause" => {
                                if let Some(state) = app.try_state::<AppState>() {
                                    let watcher = state.watcher.lock().unwrap();
                                    let is_paused = watcher.get_state().is_paused;
                                    if is_paused {
                                        let _ = watcher.resume();
                                        let _ = app.emit("watcher_resumed", ());
                                    } else {
                                        let _ = watcher.pause();
                                        let _ = app.emit("watcher_paused", ());
                                    }
                                }
                            }
                            "settings" => {
                                let _ = app.emit("open_settings", ());
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                            "history" => {
                                let _ = app.emit("open_history", ());
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                            "quit" => {
                                if let Some(state) = app.try_state::<AppState>() {
                                    let _ = state.watcher.lock().unwrap().stop();
                                    // Stop broadcast if active
                                    tauri::async_runtime::block_on(async {
                                        let broadcast_manager = state.broadcast_manager.lock().await;
                                        if broadcast_manager.is_broadcasting().await {
                                            tracing::info!("Stopping broadcast on app quit");
                                            let _ = broadcast_manager.stop().await;
                                        }
                                    });
                                }
                                app.exit(0);
                            }
                            _ => {}
                        }
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let tauri::tray::TrayIconEvent::DoubleClick { .. } = event {
                            if let Some(window) = tray.app_handle().get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    })
                    .build(app)?;
            }

            // Start watcher if setup is complete
            let app_handle = app.handle().clone();
            if let Ok(cfg) = config::load_config(&app_handle) {
                if cfg.setup_complete && !cfg.replay_folder.is_empty() {
                    let state = app.state::<AppState>();
                    let mut watcher = state.watcher.lock().unwrap();
                    if let Err(e) = watcher.start(app_handle.clone(), std::path::PathBuf::from(&cfg.replay_folder)) {
                        tracing::error!("Failed to start watcher: {}", e);
                    }
                }
            }

            // Run initial health check
            let app_handle_health = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Some(state) = app_handle_health.try_state::<AppState>() {
                    let is_available = state.health_checker.check_health(&app_handle_health).await;
                    if !is_available {
                        tracing::warn!("Service unavailable on startup, starting polling");
                        state.health_checker.start_polling(app_handle_health.clone()).await;
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config,
            commands::get_session,
            commands::login,
            commands::logout,
            // Device flow commands
            commands::request_device_code,
            commands::poll_device_token,
            commands::refresh_device_token,
            commands::fetch_me,
            // Window commands
            commands::minimize_to_tray,
            commands::show_window,
            // Watcher commands
            commands::start_watcher,
            commands::pause_watcher,
            commands::resume_watcher,
            commands::get_watcher_status,
            // Upload commands
            commands::upload_replay,
            commands::get_history,
            commands::retry_upload,
            // Folder detection
            commands::detect_replay_folder,
            commands::detect_all_replay_folders,
            // Folder info commands
            commands::get_folder_info,
            commands::open_folder,
            // Upload statistics
            commands::get_upload_stats,
            // Live viewer commands
            commands::get_live_state,
            commands::start_live,
            commands::stop_live,
            // Broadcast commands
            commands::start_broadcast,
            commands::stop_broadcast,
            commands::get_broadcast_state,
            commands::set_broadcast_title,
            // Environment commands
            commands::get_environments,
            commands::set_broadcast_environment,
            // Health check commands
            commands::get_service_status,
            commands::check_service_health,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Hide window instead of closing
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
