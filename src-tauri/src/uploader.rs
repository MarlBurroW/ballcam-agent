use std::path::Path;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::config;
use crate::types::{AuthSession, UploadRecord, UploadStatus, Visibility};

// Use localhost in dev mode, production URL otherwise
#[cfg(dev)]
const API_BASE_URL: &str = "http://localhost:3000/api";
#[cfg(not(dev))]
const API_BASE_URL: &str = "https://ballcam.tv/api";

#[cfg(dev)]
const FRONTEND_URL: &str = "http://localhost:5173";
#[cfg(not(dev))]
const FRONTEND_URL: &str = "https://ballcam.tv";

const MAX_RETRIES: u32 = 3;
const RETRY_DELAYS: [u64; 3] = [1, 2, 4]; // seconds

pub struct Uploader {
    client: reqwest::Client,
}

impl Uploader {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
        }
    }

    pub async fn upload_replay(
        &self,
        app: &AppHandle,
        file_path: &str,
        visibility: Option<Visibility>,
    ) -> Result<UploadRecord, String> {
        let path = Path::new(file_path);
        let filename = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown.replay")
            .to_string();

        // Create initial upload record
        let mut record = UploadRecord {
            id: uuid::Uuid::new_v4().to_string(),
            filename: filename.clone(),
            file_path: file_path.to_string(),
            status: UploadStatus::Pending,
            replay_id: None,
            replay_url: None,
            error_message: None,
            attempts: 0,
            created_at: chrono::Utc::now().to_rfc3339(),
            completed_at: None,
        };

        // Emit upload started event
        let _ = app.emit("upload_started", &record);

        // Get visibility from config if not specified
        let visibility = match visibility {
            Some(v) => v,
            None => {
                let config = config::load_config(app)?;
                config.default_visibility
            }
        };

        // Perform upload with retries
        let mut last_error = String::new();
        for attempt in 0..MAX_RETRIES {
            record.attempts = attempt + 1;
            record.status = UploadStatus::Uploading;
            let _ = app.emit("upload_progress", &record);

            match self.try_upload(app, file_path, &visibility).await {
                Ok((replay_id, replay_url)) => {
                    record.status = UploadStatus::Completed;
                    record.replay_id = Some(replay_id);
                    record.replay_url = Some(replay_url.clone());
                    record.completed_at = Some(chrono::Utc::now().to_rfc3339());

                    // Save to history
                    self.save_to_history(app, &record)?;

                    // Send notification
                    self.send_notification(app, &filename, &replay_url).await;

                    // Emit completion event
                    let _ = app.emit("upload_completed", &record);

                    tracing::info!("Upload completed: {} -> {}", filename, replay_url);

                    return Ok(record);
                }
                Err(e) => {
                    last_error = e;
                    tracing::warn!(
                        "Upload attempt {} failed for {}: {}",
                        attempt + 1,
                        filename,
                        last_error
                    );

                    // Wait before retry (except on last attempt)
                    if attempt < MAX_RETRIES - 1 {
                        tokio::time::sleep(Duration::from_secs(RETRY_DELAYS[attempt as usize]))
                            .await;
                    }
                }
            }
        }

        // All retries failed
        record.status = UploadStatus::Failed;
        record.error_message = Some(last_error.clone());

        // Save to history
        let _ = self.save_to_history(app, &record);

        // Emit failure event
        let _ = app.emit("upload_failed", &record);

        tracing::error!("Upload failed after {} attempts: {}", MAX_RETRIES, filename);

        Err(last_error)
    }

    async fn try_upload(
        &self,
        app: &AppHandle,
        file_path: &str,
        visibility: &Visibility,
    ) -> Result<(String, String), String> {
        // Ensure we have a valid session
        let session = self.ensure_valid_session(app).await?;

        // Read file
        let file_data = tokio::fs::read(file_path)
            .await
            .map_err(|e| format!("Failed to read file: {}", e))?;

        let filename = Path::new(file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("replay.replay");

        // Build multipart form
        let part = reqwest::multipart::Part::bytes(file_data)
            .file_name(filename.to_string())
            .mime_str("application/octet-stream")
            .map_err(|e| format!("Failed to create form part: {}", e))?;

        let form = reqwest::multipart::Form::new()
            .part("file", part)
            .text("visibility", visibility.to_string());

        // Send request
        let response = self
            .client
            .post(format!("{}/replays", API_BASE_URL))
            .header(
                "Cookie",
                format!("access_token={}", session.access_token),
            )
            .multipart(form)
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(match status.as_u16() {
                401 => "Authentication expired".to_string(),
                413 => "File too large".to_string(),
                _ => format!("Upload failed ({}): {}", status, error_text),
            });
        }

        // Parse response
        let body_text = response
            .text()
            .await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        tracing::debug!("Upload response: {}", body_text);

        let body: serde_json::Value = serde_json::from_str(&body_text)
            .map_err(|e| format!("Failed to parse response: {}. Body: {}", e, body_text))?;

        // Try different field names the backend might use
        let replay_id = body
            .get("id")
            .or_else(|| body.get("replayId"))
            .or_else(|| body.get("replay_id"))
            .or_else(|| body.get("replay").and_then(|r| r.get("id")))
            .and_then(|v| v.as_str().map(|s| s.to_string()).or_else(|| v.as_i64().map(|n| n.to_string())))
            .ok_or_else(|| format!("No replay ID in response. Response: {}", body_text))?;

        let replay_url = format!("{}/replays/{}", FRONTEND_URL, replay_id);

        Ok((replay_id, replay_url))
    }

    async fn ensure_valid_session(&self, app: &AppHandle) -> Result<AuthSession, String> {
        let session = config::load_session(app)?
            .ok_or("Not logged in")?;

        // Check if access token is expired or about to expire
        let expiry = chrono::DateTime::parse_from_rfc3339(&session.access_token_expiry)
            .map_err(|_| "Invalid expiry date")?;

        let now = chrono::Utc::now();
        let buffer = chrono::Duration::minutes(5);

        if expiry.with_timezone(&chrono::Utc) <= now + buffer {
            tracing::info!("Access token expired, refreshing...");
            return self.refresh_session(app, &session).await;
        }

        Ok(session)
    }

    async fn refresh_session(&self, app: &AppHandle, session: &AuthSession) -> Result<AuthSession, String> {
        let response = self
            .client
            .post(format!("{}/auth/refresh", API_BASE_URL))
            .header(
                "Cookie",
                format!("refresh_token={}", session.refresh_token),
            )
            .send()
            .await
            .map_err(|e| format!("Network error during refresh: {}", e))?;

        if !response.status().is_success() {
            return Err("Session expired, please login again".to_string());
        }

        // Extract new tokens from cookies
        let cookies: Vec<_> = response
            .headers()
            .get_all("set-cookie")
            .iter()
            .filter_map(|v| v.to_str().ok())
            .collect();

        let mut new_access_token = session.access_token.clone();
        let mut new_refresh_token = session.refresh_token.clone();

        for cookie in cookies {
            if cookie.starts_with("access_token=") {
                if let Some(token) = cookie.split(';').next() {
                    new_access_token = token.replace("access_token=", "");
                }
            } else if cookie.starts_with("refresh_token=") {
                if let Some(token) = cookie.split(';').next() {
                    new_refresh_token = token.replace("refresh_token=", "");
                }
            }
        }

        // Create new session with updated tokens
        let now = chrono::Utc::now();
        let new_session = AuthSession {
            access_token: new_access_token,
            refresh_token: new_refresh_token,
            access_token_expiry: (now + chrono::Duration::minutes(30)).to_rfc3339(),
            refresh_token_expiry: (now + chrono::Duration::days(7)).to_rfc3339(),
            user: session.user.clone(),
            device_id: session.device_id.clone(),
        };

        config::save_session(app, &new_session)?;
        tracing::info!("Session refreshed successfully");

        Ok(new_session)
    }

    fn save_to_history(&self, app: &AppHandle, record: &UploadRecord) -> Result<(), String> {
        let mut history = config::load_history(app)?;

        // Add new record at the beginning
        history.records.insert(0, record.clone());

        // Keep only last 100 records
        history.records.truncate(100);

        config::save_history(app, &history)
    }

    async fn send_notification(&self, _app: &AppHandle, filename: &str, replay_url: &str) {
        // Check if notifications are enabled
        if let Ok(config) = config::load_config(_app) {
            if !config.notifications_enabled {
                return;
            }
        }

        // Use native Windows toast notification
        #[cfg(windows)]
        {
            use tauri_winrt_notification::{Toast, Duration};

            // Use a known Windows AUMID for dev mode, or the app's own ID in production
            // Microsoft.Windows.Explorer works as a fallback
            let _ = Toast::new(Toast::POWERSHELL_APP_ID)
                .title("BallCam Agent")
                .text1("Replay Uploaded!")
                .text2(&format!("{} uploaded to BallCam", filename))
                .duration(Duration::Short)
                .show();
        }

        // Fallback for non-Windows platforms
        #[cfg(not(windows))]
        {
            use tauri_plugin_notification::NotificationExt;

            let _ = _app
                .notification()
                .builder()
                .title("Replay Uploaded!")
                .body(&format!("{} uploaded to BallCam", filename))
                .show();
        }

        tracing::info!("Notification sent for: {} -> {}", filename, replay_url);
    }
}

impl Default for Uploader {
    fn default() -> Self {
        Self::new()
    }
}
