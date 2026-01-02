pub mod commands;
pub mod config;
pub mod types;
pub mod uploader;
pub mod watcher;

use std::sync::Mutex;
use tauri::Manager;
use watcher::FileWatcher;

// Global state for the file watcher
pub struct AppState {
    pub watcher: Mutex<FileWatcher>,
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
        .manage(AppState {
            watcher: Mutex::new(FileWatcher::new()),
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
                    .tooltip("BallCam Agent - Watching")
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
            // Folder detection
            commands::detect_replay_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
