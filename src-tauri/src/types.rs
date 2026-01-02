use serde::{Deserialize, Serialize};

/// Visibility options for uploaded replays
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Visibility {
    #[default]
    Public,
    Unlisted,
}

impl std::fmt::Display for Visibility {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Visibility::Public => write!(f, "public"),
            Visibility::Unlisted => write!(f, "unlisted"),
        }
    }
}

/// Application configuration stored in config.json
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub replay_folder: String,
    pub default_visibility: Visibility,
    pub auto_start: bool,
    pub notifications_enabled: bool,
    pub setup_complete: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            replay_folder: String::new(),
            default_visibility: Visibility::Public,
            auto_start: false,
            notifications_enabled: true,
            setup_complete: false,
        }
    }
}

/// User information from BallCam API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: String,
    pub username: String,
    pub email: String,
    pub email_verified: bool,
    pub avatar_url: Option<String>,
}

/// Authentication session stored in session.json
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthSession {
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: String,
    pub access_token_expiry: String,
    #[serde(default)]
    pub refresh_token_expiry: String,
    pub user: User,
    /// Device ID for device flow authentication
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_id: Option<String>,
}

// ============================================================================
// Device Flow Types (use snake_case per RFC 8628)
// ============================================================================

/// Response from POST /api/auth/device/code
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    #[serde(alias = "verification_url", alias = "verification_uri")]
    pub verification_url: String,
    pub expires_in: u32,
    pub interval: u32,
}

/// Response from POST /api/auth/device/token on success
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceTokenResponse {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: u32,
    pub device_id: String,
    pub user: User,
}

/// Error response from device flow endpoints
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceFlowError {
    pub error: String,
    pub error_description: String,
}

/// Result of polling for device token
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum DevicePollResult {
    /// Still waiting for user authorization
    Pending,
    /// User authorized, here's the token
    Success(DeviceTokenResponse),
    /// Polling too fast
    SlowDown,
    /// Code expired
    Expired,
    /// User denied access
    Denied,
}

/// Upload status enum
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum UploadStatus {
    #[default]
    Pending,
    Uploading,
    Processing,
    Completed,
    Failed,
}

/// Record of a single upload attempt
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadRecord {
    pub id: String,
    pub filename: String,
    pub file_path: String,
    pub status: UploadStatus,
    pub replay_id: Option<String>,
    pub replay_url: Option<String>,
    pub error_message: Option<String>,
    pub attempts: u32,
    pub created_at: String,
    pub completed_at: Option<String>,
}

/// Upload history collection
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UploadHistory {
    pub records: Vec<UploadRecord>,
}

impl UploadHistory {
    pub const MAX_RECORDS: usize = 50;

    pub fn add_record(&mut self, record: UploadRecord) {
        self.records.insert(0, record);
        if self.records.len() > Self::MAX_RECORDS {
            self.records.truncate(Self::MAX_RECORDS);
        }
    }
}

/// Watcher runtime state (not persisted)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WatcherState {
    pub is_watching: bool,
    pub is_paused: bool,
    pub last_event_at: Option<String>,
    pub pending_files: Vec<String>,
}
