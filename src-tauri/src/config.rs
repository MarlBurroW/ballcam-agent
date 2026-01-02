use crate::types::{AppConfig, AuthSession, UploadHistory};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const CONFIG_FILE: &str = "config.json";
const SESSION_FILE: &str = "session.json";
const HISTORY_FILE: &str = "history.json";

/// Get the default Rocket League replay folder path
/// Checks both Steam (Demos) and Epic Games (DemosEpic) locations
pub fn get_default_replay_folder() -> Option<String> {
    if let Some(docs) = dirs::document_dir() {
        let base_path = docs
            .join("My Games")
            .join("Rocket League")
            .join("TAGame");

        // Check Epic Games location first (DemosEpic)
        let epic_path = base_path.join("DemosEpic");
        if epic_path.exists() {
            tracing::info!("Found Epic Games replay folder: {:?}", epic_path);
            return Some(epic_path.to_string_lossy().to_string());
        }

        // Check Steam location (Demos)
        let steam_path = base_path.join("Demos");
        if steam_path.exists() {
            tracing::info!("Found Steam replay folder: {:?}", steam_path);
            return Some(steam_path.to_string_lossy().to_string());
        }

        tracing::warn!("Rocket League folder not found. Checked: {:?} and {:?}", epic_path, steam_path);
    } else {
        tracing::warn!("Could not find Documents directory");
    }
    None
}

/// Detect the replay folder, returning the path if found
pub fn detect_replay_folder() -> Result<String, String> {
    get_default_replay_folder()
        .ok_or_else(|| "Rocket League replay folder not found".to_string())
}

/// Detected replay folder with platform info
#[derive(Debug, Clone, serde::Serialize)]
pub struct DetectedFolder {
    pub path: String,
    pub platform: String, // "steam" or "epic"
}

/// Detect all available replay folders
pub fn detect_all_replay_folders() -> Vec<DetectedFolder> {
    let mut folders = Vec::new();

    if let Some(docs) = dirs::document_dir() {
        let base_path = docs
            .join("My Games")
            .join("Rocket League")
            .join("TAGame");

        // Check Steam location (Demos)
        let steam_path = base_path.join("Demos");
        if steam_path.exists() {
            folders.push(DetectedFolder {
                path: steam_path.to_string_lossy().to_string(),
                platform: "steam".to_string(),
            });
        }

        // Check Epic Games location (DemosEpic)
        let epic_path = base_path.join("DemosEpic");
        if epic_path.exists() {
            folders.push(DetectedFolder {
                path: epic_path.to_string_lossy().to_string(),
                platform: "epic".to_string(),
            });
        }
    }

    folders
}

/// Load app configuration from store
pub fn load_config(app: &AppHandle) -> Result<AppConfig, String> {
    let store = app
        .store(CONFIG_FILE)
        .map_err(|e| format!("Failed to open config store: {}", e))?;

    if let Some(config) = store.get("config") {
        serde_json::from_value(config.clone())
            .map_err(|e| format!("Failed to parse config: {}", e))
    } else {
        // Return default config with detected replay folder
        let mut config = AppConfig::default();
        if let Some(folder) = get_default_replay_folder() {
            config.replay_folder = folder;
        }
        Ok(config)
    }
}

/// Save app configuration to store
pub fn save_config(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    let store = app
        .store(CONFIG_FILE)
        .map_err(|e| format!("Failed to open config store: {}", e))?;

    let value = serde_json::to_value(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    store
        .set("config", value);

    store
        .save()
        .map_err(|e| format!("Failed to save config: {}", e))?;

    Ok(())
}

/// Load auth session from store
pub fn load_session(app: &AppHandle) -> Result<Option<AuthSession>, String> {
    let store = app
        .store(SESSION_FILE)
        .map_err(|e| format!("Failed to open session store: {}", e))?;

    if let Some(session) = store.get("session") {
        let session: AuthSession = serde_json::from_value(session.clone())
            .map_err(|e| format!("Failed to parse session: {}", e))?;
        Ok(Some(session))
    } else {
        Ok(None)
    }
}

/// Save auth session to store
pub fn save_session(app: &AppHandle, session: &AuthSession) -> Result<(), String> {
    let store = app
        .store(SESSION_FILE)
        .map_err(|e| format!("Failed to open session store: {}", e))?;

    let value = serde_json::to_value(session)
        .map_err(|e| format!("Failed to serialize session: {}", e))?;

    store.set("session", value);

    store
        .save()
        .map_err(|e| format!("Failed to save session: {}", e))?;

    Ok(())
}

/// Clear auth session from store
pub fn clear_session(app: &AppHandle) -> Result<(), String> {
    let store = app
        .store(SESSION_FILE)
        .map_err(|e| format!("Failed to open session store: {}", e))?;

    store.delete("session");

    store
        .save()
        .map_err(|e| format!("Failed to save session store: {}", e))?;

    Ok(())
}

/// Load upload history from store
pub fn load_history(app: &AppHandle) -> Result<UploadHistory, String> {
    let store = app
        .store(HISTORY_FILE)
        .map_err(|e| format!("Failed to open history store: {}", e))?;

    if let Some(history) = store.get("history") {
        serde_json::from_value(history.clone())
            .map_err(|e| format!("Failed to parse history: {}", e))
    } else {
        Ok(UploadHistory::default())
    }
}

/// Save upload history to store
pub fn save_history(app: &AppHandle, history: &UploadHistory) -> Result<(), String> {
    let store = app
        .store(HISTORY_FILE)
        .map_err(|e| format!("Failed to open history store: {}", e))?;

    let value = serde_json::to_value(history)
        .map_err(|e| format!("Failed to serialize history: {}", e))?;

    store.set("history", value);

    store
        .save()
        .map_err(|e| format!("Failed to save history: {}", e))?;

    Ok(())
}
