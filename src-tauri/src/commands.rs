use crate::config;
use crate::types::{
    AppConfig, AuthSession, DeviceCodeResponse, DevicePollResult, DeviceTokenResponse,
    UploadRecord, User, Visibility, WatcherState,
};
use crate::uploader::Uploader;
use crate::AppState;
use std::path::PathBuf;
use tauri::{AppHandle, State};

// Use localhost in dev mode, production URL otherwise
#[cfg(dev)]
const API_BASE_URL: &str = "http://localhost:3000/api";
#[cfg(not(dev))]
const API_BASE_URL: &str = "https://ballcam.tv/api";

/// Get the current app configuration
#[tauri::command]
pub fn get_config(app: AppHandle) -> Result<AppConfig, String> {
    config::load_config(&app)
}

/// Save app configuration
#[tauri::command]
pub fn save_config(app: AppHandle, new_config: AppConfig) -> Result<(), String> {
    config::save_config(&app, &new_config)
}

/// Get the current auth session
#[tauri::command]
pub fn get_session(app: AppHandle) -> Result<Option<AuthSession>, String> {
    config::load_session(&app)
}

/// Login with email and password
#[tauri::command]
pub async fn login(
    app: AppHandle,
    email: String,
    password: String,
) -> Result<User, String> {
    use reqwest::header::HeaderValue;

    tracing::info!("Attempting login for: {}", email);

    // Build the request
    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/auth/login", API_BASE_URL))
        .header("Content-Type", "application/json")
        .body(serde_json::to_string(&serde_json::json!({
            "email": email,
            "password": password
        })).unwrap())
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    // Check response status
    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(match status.as_u16() {
            400 => "Invalid email or password format".to_string(),
            401 => "Invalid email or password".to_string(),
            _ => format!("Login failed: {}", error_text),
        });
    }

    // Extract cookies from response headers
    let cookies: Vec<String> = response
        .headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|v: &HeaderValue| v.to_str().ok().map(|s| s.to_string()))
        .collect();

    let mut access_token = String::new();
    let mut refresh_token = String::new();

    for cookie in &cookies {
        if cookie.starts_with("access_token=") {
            if let Some(token) = cookie.split(';').next() {
                access_token = token.replace("access_token=", "");
            }
        } else if cookie.starts_with("refresh_token=") {
            if let Some(token) = cookie.split(';').next() {
                refresh_token = token.replace("refresh_token=", "");
            }
        }
    }

    if access_token.is_empty() || refresh_token.is_empty() {
        return Err("Failed to extract tokens from response".to_string());
    }

    // Parse response body
    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let user_data = body
        .get("user")
        .ok_or("No user data in response")?;

    let user: User = serde_json::from_value(user_data.clone())
        .map_err(|e| format!("Failed to parse user: {}", e))?;

    // Calculate expiry times
    let now = chrono::Utc::now();
    let access_expiry = now + chrono::Duration::minutes(30);
    let refresh_expiry = now + chrono::Duration::days(7);

    // Create and save session
    let session = AuthSession {
        access_token,
        refresh_token,
        access_token_expiry: access_expiry.to_rfc3339(),
        refresh_token_expiry: refresh_expiry.to_rfc3339(),
        user: user.clone(),
        device_id: None,
    };

    config::save_session(&app, &session)?;

    tracing::info!("Login successful for: {}", user.username);

    Ok(user)
}

/// Logout and clear session
#[tauri::command]
pub async fn logout(app: AppHandle) -> Result<(), String> {
    // Try to call the logout endpoint (ignore errors)
    if let Ok(Some(session)) = config::load_session(&app) {
        let client = reqwest::Client::new();
        let _ = client
            .post(format!("{}/auth/logout", API_BASE_URL))
            .header("Cookie", format!("refresh_token={}", session.refresh_token))
            .send()
            .await;
    }

    // Clear local session
    config::clear_session(&app)?;

    tracing::info!("Logged out successfully");

    Ok(())
}

// ============================================================================
// Device Flow Commands
// ============================================================================

/// Get device name for the current system
fn get_device_name() -> String {
    let os = std::env::consts::OS;
    let os_name = match os {
        "windows" => "Windows",
        "macos" => "macOS",
        "linux" => "Linux",
        _ => os,
    };
    format!("BallCam Agent - {}", os_name)
}

/// Request a device code to start the device flow authentication
#[tauri::command]
pub async fn request_device_code() -> Result<DeviceCodeResponse, String> {
    tracing::info!("Requesting device code");

    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/auth/device/code", API_BASE_URL))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "client_id": "ballcam-agent",
            "device_name": get_device_name()
        }))
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Failed to request device code: {}", error_text));
    }

    // Get raw response body for debugging
    let body_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    tracing::debug!("Device code response body: {}", body_text);

    let device_code: DeviceCodeResponse = serde_json::from_str(&body_text)
        .map_err(|e| format!("Failed to parse response: {}. Body: {}", e, body_text))?;

    tracing::info!("Device code received: {}", device_code.user_code);

    Ok(device_code)
}

/// Poll for device token after user authorizes
#[tauri::command]
pub async fn poll_device_token(
    app: AppHandle,
    device_code: String,
) -> Result<DevicePollResult, String> {
    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/auth/device/token", API_BASE_URL))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "device_code": device_code,
            "client_id": "ballcam-agent"
        }))
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let status = response.status();

    // Handle error responses (400)
    if status.as_u16() == 400 {
        let error: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse error response: {}", e))?;

        let error_code = error
            .get("error")
            .and_then(|e| e.as_str())
            .unwrap_or("unknown");

        return Ok(match error_code {
            "authorization_pending" => DevicePollResult::Pending,
            "slow_down" => DevicePollResult::SlowDown,
            "expired_token" => DevicePollResult::Expired,
            "access_denied" => DevicePollResult::Denied,
            _ => return Err(format!("Unknown error: {}", error_code)),
        });
    }

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Failed to poll device token: {}", error_text));
    }

    // Success - parse the token response
    let token_response: DeviceTokenResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    // Calculate expiry time
    let now = chrono::Utc::now();
    let access_expiry = now + chrono::Duration::seconds(token_response.expires_in as i64);

    // Create and save session
    let session = AuthSession {
        access_token: token_response.access_token.clone(),
        refresh_token: String::new(), // Device flow doesn't use refresh tokens
        access_token_expiry: access_expiry.to_rfc3339(),
        refresh_token_expiry: String::new(),
        user: token_response.user.clone(),
        device_id: Some(token_response.device_id.clone()),
    };

    config::save_session(&app, &session)?;

    tracing::info!(
        "Device authorized successfully for user: {}",
        token_response.user.username
    );

    Ok(DevicePollResult::Success(token_response))
}

/// Refresh device token
#[tauri::command]
pub async fn refresh_device_token(app: AppHandle) -> Result<User, String> {
    let session = config::load_session(&app)?
        .ok_or("No session found")?;

    let device_id = session
        .device_id
        .clone()
        .ok_or("No device ID found in session")?;

    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/auth/device/refresh", API_BASE_URL))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "access_token": session.access_token,
            "device_id": device_id
        }))
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let status = response.status();

    if status.as_u16() == 401 {
        // Device revoked - clear session
        config::clear_session(&app)?;
        return Err("Device has been revoked. Please re-authorize.".to_string());
    }

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Failed to refresh token: {}", error_text));
    }

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct RefreshResponse {
        access_token: String,
        expires_in: u32,
    }

    let refresh_response: RefreshResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {}", e))?;

    // Update session with new token
    let now = chrono::Utc::now();
    let access_expiry = now + chrono::Duration::seconds(refresh_response.expires_in as i64);

    let updated_session = AuthSession {
        access_token: refresh_response.access_token,
        access_token_expiry: access_expiry.to_rfc3339(),
        ..session
    };

    config::save_session(&app, &updated_session)?;

    tracing::info!("Device token refreshed successfully");

    Ok(updated_session.user)
}

/// Minimize the main window to system tray
#[tauri::command]
pub fn minimize_to_tray(app: AppHandle) -> Result<(), String> {
    use tauri::Manager;

    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| format!("Failed to hide window: {}", e))?;
        tracing::info!("Window minimized to tray");
    }
    Ok(())
}

/// Show the main window
#[tauri::command]
pub fn show_window(app: AppHandle) -> Result<(), String> {
    use tauri::Manager;

    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| format!("Failed to show window: {}", e))?;
        window.set_focus().map_err(|e| format!("Failed to focus window: {}", e))?;
        tracing::info!("Window shown");
    }
    Ok(())
}

/// Start the file watcher
#[tauri::command]
pub fn start_watcher(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let config = config::load_config(&app)?;
    if config.replay_folder.is_empty() {
        return Err("No replay folder configured".to_string());
    }

    let mut watcher = state.watcher.lock().unwrap();
    watcher.start(app, PathBuf::from(&config.replay_folder))
}

/// Pause the file watcher
#[tauri::command]
pub fn pause_watcher(state: State<'_, AppState>) -> Result<(), String> {
    let watcher = state.watcher.lock().unwrap();
    watcher.pause()
}

/// Resume the file watcher
#[tauri::command]
pub fn resume_watcher(state: State<'_, AppState>) -> Result<(), String> {
    let watcher = state.watcher.lock().unwrap();
    watcher.resume()
}

/// Get watcher status
#[tauri::command]
pub fn get_watcher_status(state: State<'_, AppState>) -> Result<WatcherState, String> {
    let watcher = state.watcher.lock().unwrap();
    Ok(watcher.get_state())
}

/// Upload a replay file manually
#[tauri::command]
pub async fn upload_replay(
    app: AppHandle,
    file_path: String,
    visibility: Option<Visibility>,
) -> Result<UploadRecord, String> {
    let uploader = Uploader::new();
    uploader.upload_replay(&app, &file_path, visibility).await
}

/// Get upload history
#[tauri::command]
pub fn get_history(app: AppHandle) -> Result<Vec<UploadRecord>, String> {
    let history = config::load_history(&app)?;
    Ok(history.records)
}

/// Detect the Rocket League replay folder
#[tauri::command]
pub fn detect_replay_folder() -> Result<String, String> {
    config::detect_replay_folder()
}

/// Detect all available Rocket League replay folders
#[tauri::command]
pub fn detect_all_replay_folders() -> Vec<config::DetectedFolder> {
    config::detect_all_replay_folders()
}
