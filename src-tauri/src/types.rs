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
#[serde(rename_all = "camelCase", default)]
pub struct AppConfig {
    pub replay_folder: String,
    pub default_visibility: Visibility,
    pub auto_start: bool,
    pub notifications_enabled: bool,
    pub setup_complete: bool,
    pub stream_title: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            replay_folder: String::new(),
            default_visibility: Visibility::Public,
            auto_start: false,
            notifications_enabled: true,
            setup_complete: false,
            stream_title: String::new(),
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
    /// File size in bytes (for statistics tracking)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_size: Option<u64>,
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

// ============================================================================
// Status Page Enhancement Types
// ============================================================================

/// Real-time upload progress information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadProgress {
    /// Upload record ID
    pub id: String,
    /// Name of file being uploaded
    pub filename: String,
    /// Bytes transferred so far
    pub bytes_uploaded: u64,
    /// Total file size in bytes
    pub total_bytes: u64,
    /// Progress percentage (0-100)
    pub percentage: u8,
    /// Current upload speed in bytes/second
    pub speed: u64,
    /// Estimated seconds remaining
    pub estimated_remaining: Option<u64>,
}

/// Aggregated upload statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadStats {
    /// Count of all completed uploads
    pub total_uploads: u32,
    /// Count of all failed uploads
    pub total_failed: u32,
    /// Percentage of successful uploads (0-100)
    pub success_rate: f32,
    /// Sum of all successfully uploaded file sizes in bytes
    pub total_bytes_uploaded: u64,
    /// Human-readable size (e.g., "1.2 GB")
    pub total_bytes_formatted: String,
}

/// Information about the watched folder for display
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderInfo {
    /// Full folder path
    pub path: String,
    /// Truncated path for display
    pub display_path: String,
    /// Detected game platform
    pub platform: String,
    /// Whether folder currently exists
    pub exists: bool,
}

// ============================================================================
// Live Viewer Types
// ============================================================================

/// 3D position or velocity vector
#[repr(C)]
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Vector3 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

/// Rotation quaternion (normalized)
#[repr(C)]
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Quaternion {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub w: f32,
}

/// Ball state at a point in time
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BallSnapshot {
    pub position: Vector3,
    pub velocity: Vector3,
    pub rotation: Quaternion,
    pub angular_velocity: Vector3,
    /// Last team that touched the ball (0 = Blue, 1 = Orange, None = no touch yet)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_touch_team: Option<u8>,
    /// Rigid body sleeping state (true = at rest, false = actively simulated)
    pub sleeping: bool,
    /// Actor is hidden (bHidden flag)
    pub is_hidden: bool,
}

impl BallSnapshot {
    /// Speed in km/h (2778 uu/s = 100 km/h)
    pub fn speed_kmh(&self) -> f32 {
        let speed_uus = (self.velocity.x.powi(2) + self.velocity.y.powi(2) + self.velocity.z.powi(2)).sqrt();
        speed_uus * 100.0 / 2778.0
    }
}

/// Car/player state at a point in time
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CarSnapshot {
    pub name: String,
    pub team: u8,
    /// Is this the local player's car?
    pub is_local: bool,
    /// Session-unique player ID for matching (works for bots too, -1 if unknown)
    pub player_id: i32,
    /// Platform name (Steam, Epic, PlayStation, Xbox, Switch, etc.)
    pub platform: String,
    /// Unique platform ID (Steam ID, Epic Account ID, etc.) - empty for bots
    pub unique_id: String,
    /// True if this player is a bot
    pub is_bot: bool,
    pub position: Vector3,
    pub velocity: Vector3,
    pub rotation: Quaternion,
    pub boost: u8,
    pub is_boosting: bool,
    pub is_on_ground: bool,
    pub is_supersonic: bool,
    /// Ball cam active (true = following ball, false = following car)
    pub ball_cam: bool,
    /// Car body ID (determines which car model to use, e.g., 23=Octane, 403=Fennec)
    pub body_id: u32,
    /// True when car is demolished (waiting to respawn)
    pub is_demolished: bool,
    /// Player ID of the player who demolished this car (only set when is_demolished=true)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub demolished_by: Option<i32>,
    /// Actor is hidden (bHidden flag) - true during demolition until respawn
    pub is_hidden: bool,
    /// Rigid body sleeping state (true = at rest, false = actively simulated)
    pub sleeping: bool,
    /// Steering input (-1.0 to 1.0: -1 = full left, 0 = straight, 1 = full right)
    pub steer: f32,
}

impl CarSnapshot {
    /// Speed in km/h
    pub fn speed_kmh(&self) -> f32 {
        let speed_uus = (self.velocity.x.powi(2) + self.velocity.y.powi(2) + self.velocity.z.powi(2)).sqrt();
        speed_uus * 100.0 / 2778.0
    }
}

/// Boost pad state at a point in time
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoostPadSnapshot {
    /// Boost pad ID (0-33, consistent ordering by position)
    pub id: u8,
    /// Position in world coordinates
    pub position: Vector3,
    /// Is this a big boost pad (100%) or small (12%)?
    pub is_big: bool,
    /// Is the boost pad currently available to pick up?
    pub is_available: bool,
    /// Current respawn timer countdown in seconds (0.0 if available)
    pub respawn_timer: f32,
}

/// Game info: time, scores, and match state
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameInfo {
    /// Event type name (e.g., "Soccar", "Hockey", "Hoops", etc.)
    pub event_type: String,
    /// Time remaining in seconds (300.0 = 5:00)
    pub time_remaining: f32,
    /// Blue team score
    pub score_blue: u32,
    /// Orange team score
    pub score_orange: u32,
    /// Is the match in overtime?
    pub is_overtime: bool,
    /// Has the match ended?
    pub is_match_ended: bool,
    /// Player ID of the last player who scored (session-unique, works for bots)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_scorer_id: Option<i32>,
    /// Playlist ID (e.g., 9=Training, 6=PrivateMatch, 13=RankedStandard)
    pub playlist_id: i32,
    /// Playlist name (e.g., "Training", "RankedStandard", "Doubles")
    pub playlist_name: String,
    /// Kickoff countdown (3, 2, 1, 0 = GO!)
    pub countdown_time: i32,
    /// Is the game currently paused?
    pub is_paused: bool,
    /// Is the game currently showing a goal replay?
    pub is_in_replay: bool,
    /// Time dilation factor (1.0 = normal, 0.5 = 50% slow-mo during replay)
    pub time_dilation: f32,
    /// Player ID currently focused during the goal replay (session-unique, works for bots)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub replay_focus_player_id: Option<i32>,
    /// Is the end-of-match podium currently displayed?
    pub is_on_podium: bool,
}

/// Complete game state snapshot
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameSnapshot {
    pub timestamp: u64,
    pub ball: BallSnapshot,
    pub cars: Vec<CarSnapshot>,
    /// Boost pads state (34 pads total: 6 big + 28 small)
    pub boost_pads: Vec<BoostPadSnapshot>,
    /// Match info (time, scores, etc.) - optional for compatibility
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game_info: Option<GameInfo>,
}

/// Match state sub-status when connected to Rocket League
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum MatchState {
    /// Player is in a match, receiving game data
    InMatch,
    /// Player is in menus, no game data
    InMenu,
}

/// Connection state enum for UI feedback
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum LiveConnectionState {
    /// Not connected to Rocket League (game not running)
    Disconnected,
    /// Attempting to connect to Rocket League
    Connecting,
    /// Connected to Rocket League process
    #[serde(rename_all = "camelCase")]
    Connected { match_state: MatchState },
    /// Connection error
    Error { message: String },
}

// ============================================================================
// Environment Types
// ============================================================================

/// Environment for live streaming (simplified from full environment data)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_url: Option<String>,
    pub is_default: bool,
}

/// Response from GET /api/environments
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentsResponse {
    pub environments: Vec<Environment>,
    pub total: i64,
}

// ============================================================================
// Live Streaming Types
// ============================================================================

/// Broadcast state for live streaming to ballcam.tv
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum BroadcastState {
    /// Not currently broadcasting
    #[default]
    NotBroadcasting,
    /// Connecting to server, starting session
    Starting,
    /// Actively broadcasting
    #[serde(rename_all = "camelCase")]
    Broadcasting {
        session_id: String,
        share_url: String,
        channel_url: String,
        username: String,
        title: String,
        visibility: Visibility,
        started_at: u64,
        /// Current number of viewers watching the stream
        viewer_count: u32,
    },
    /// Stopping the broadcast
    Stopping,
    /// Error occurred
    #[serde(rename_all = "camelCase")]
    Error {
        message: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        code: Option<String>,
    },
}
