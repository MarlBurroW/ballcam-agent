use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::types::WatcherState;
use crate::uploader::Uploader;

const MAX_FILE_SIZE: u64 = 50 * 1024 * 1024; // 50MB

pub struct FileWatcher {
    watcher: Option<RecommendedWatcher>,
    watch_path: Option<PathBuf>,
    is_paused: Arc<Mutex<bool>>,
    pending_files: Arc<Mutex<Vec<String>>>,
    stop_tx: Option<mpsc::Sender<()>>,
}

impl FileWatcher {
    pub fn new() -> Self {
        Self {
            watcher: None,
            watch_path: None,
            is_paused: Arc::new(Mutex::new(false)),
            pending_files: Arc::new(Mutex::new(Vec::new())),
            stop_tx: None,
        }
    }

    pub fn start(&mut self, app: AppHandle, watch_path: PathBuf) -> Result<(), String> {
        if self.watcher.is_some() {
            return Err("Watcher already running".to_string());
        }

        let (stop_tx, stop_rx) = mpsc::channel();
        let (event_tx, event_rx) = mpsc::channel();
        let is_paused = self.is_paused.clone();
        let pending_files = self.pending_files.clone();

        // Create the watcher
        let watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    let _ = event_tx.send(event);
                }
            },
            Config::default().with_poll_interval(Duration::from_secs(2)),
        )
        .map_err(|e| format!("Failed to create watcher: {}", e))?;

        self.watcher = Some(watcher);
        self.watch_path = Some(watch_path.clone());
        self.stop_tx = Some(stop_tx);

        // Start watching
        if let Some(ref mut w) = self.watcher {
            w.watch(&watch_path, RecursiveMode::NonRecursive)
                .map_err(|e| format!("Failed to watch folder: {}", e))?;
        }

        tracing::info!("Started watching folder: {:?}", watch_path);

        // Spawn event processing thread
        let app_clone = app.clone();
        thread::spawn(move || {
            loop {
                // Check for stop signal
                if stop_rx.try_recv().is_ok() {
                    tracing::info!("Watcher thread stopping");
                    break;
                }

                // Check for file events
                if let Ok(event) = event_rx.recv_timeout(Duration::from_millis(100)) {
                    tracing::debug!("File event received: {:?}", event);

                    // Skip if paused
                    if *is_paused.lock().unwrap() {
                        continue;
                    }

                    // Process Create, Modify, and Rename events (different OS/apps use different events)
                    let should_process = matches!(
                        event.kind,
                        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Access(_)
                    );

                    if should_process {
                        for path in event.paths {
                            // Skip if already in pending (avoid duplicate processing)
                            let path_str = path.to_string_lossy().to_string();
                            {
                                let pending = pending_files.lock().unwrap();
                                if pending.contains(&path_str) {
                                    continue;
                                }
                            }

                            if let Some(file_path) = Self::validate_file(&path) {
                                tracing::info!("New replay file detected: {:?}", file_path);

                                // Add to pending files
                                pending_files.lock().unwrap().push(file_path.clone());

                                // Emit event to frontend
                                let _ = app_clone.emit("file_detected", &file_path);

                                // Trigger upload directly
                                let app_for_upload = app_clone.clone();
                                let file_path_clone = file_path.clone();
                                let pending_files_clone = pending_files.clone();

                                tauri::async_runtime::spawn(async move {
                                    let uploader = Uploader::new();
                                    match uploader.upload_replay(&app_for_upload, &file_path_clone, None).await {
                                        Ok(record) => {
                                            tracing::info!("Upload successful: {:?}", record.replay_url);
                                        }
                                        Err(e) => {
                                            tracing::error!("Upload failed: {}", e);
                                        }
                                    }
                                    // Remove from pending after upload completes
                                    pending_files_clone.lock().unwrap().retain(|f| f != &file_path_clone);
                                });
                            }
                        }
                    }
                }
            }
        });

        Ok(())
    }

    pub fn stop(&mut self) -> Result<(), String> {
        // Send stop signal
        if let Some(tx) = self.stop_tx.take() {
            let _ = tx.send(());
        }

        // Stop watching
        if let (Some(ref mut w), Some(ref path)) = (&mut self.watcher, &self.watch_path) {
            let _ = w.unwatch(path);
        }

        self.watcher = None;
        self.watch_path = None;

        tracing::info!("Watcher stopped");

        Ok(())
    }

    pub fn pause(&self) -> Result<(), String> {
        *self.is_paused.lock().unwrap() = true;
        tracing::info!("Watcher paused");
        Ok(())
    }

    pub fn resume(&self) -> Result<(), String> {
        *self.is_paused.lock().unwrap() = false;
        tracing::info!("Watcher resumed");
        Ok(())
    }

    pub fn get_state(&self) -> WatcherState {
        WatcherState {
            is_watching: self.watcher.is_some(),
            is_paused: *self.is_paused.lock().unwrap(),
            last_event_at: None,
            pending_files: self.pending_files.lock().unwrap().clone(),
        }
    }

    fn validate_file(path: &PathBuf) -> Option<String> {
        // Check extension
        let extension = path.extension()?.to_str()?;
        if extension.to_lowercase() != "replay" {
            return None;
        }

        // Check file exists and get metadata
        let metadata = std::fs::metadata(path).ok()?;

        // Check it's a file, not a directory
        if !metadata.is_file() {
            return None;
        }

        // Check file size
        if metadata.len() > MAX_FILE_SIZE {
            tracing::warn!("File too large (>50MB): {:?}", path);
            return None;
        }

        // Wait for file to finish writing (replays can be 1-2MB, give it time)
        // Also helps filter out temp files that get renamed quickly
        std::thread::sleep(Duration::from_secs(2));

        // Check file still exists after waiting (filters out temp files that got renamed)
        if !path.exists() {
            tracing::debug!("File no longer exists after wait (was temp file): {:?}", path);
            return None;
        }

        // Re-check size to ensure file is fully written
        let final_metadata = std::fs::metadata(path).ok()?;
        if final_metadata.len() == 0 {
            tracing::debug!("File is empty, skipping: {:?}", path);
            return None;
        }

        Some(path.to_string_lossy().to_string())
    }

    pub fn remove_from_pending(&self, file_path: &str) {
        let mut pending = self.pending_files.lock().unwrap();
        pending.retain(|f| f != file_path);
    }
}

impl Default for FileWatcher {
    fn default() -> Self {
        Self::new()
    }
}
