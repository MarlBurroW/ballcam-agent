// Visibility options for uploaded replays
export type Visibility = 'public' | 'unlisted';

// Application configuration stored in config.json
export interface AppConfig {
  replayFolder: string;
  defaultVisibility: Visibility;
  autoStart: boolean;
  notificationsEnabled: boolean;
  setupComplete: boolean;
  streamTitle: string;
}

// User information from BallCam API
export interface User {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  avatarUrl: string | null;
}

// Authentication session stored in session.json
export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiry: string;
  refreshTokenExpiry: string;
  user: User;
  deviceId?: string;
}

// ============================================================================
// Device Flow Types (snake_case to match RFC 8628 and Rust types)
// ============================================================================

// Response from POST /api/auth/device/code
export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

// Response from POST /api/auth/device/token on success
export interface DeviceTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  device_id: string;
  user: User;
}

// Result of polling for device token
export type DevicePollResult =
  | { status: 'pending' }
  | { status: 'success'; access_token: string; token_type: string; expires_in: number; device_id: string; user: User }
  | { status: 'slow_down' }
  | { status: 'expired' }
  | { status: 'denied' };

// Upload status enum
export type UploadStatus = 'pending' | 'uploading' | 'processing' | 'completed' | 'failed';

// Record of a single upload attempt
export interface UploadRecord {
  id: string;
  filename: string;
  filePath: string;
  status: UploadStatus;
  replayId?: string;
  replayUrl?: string;
  errorMessage?: string;
  attempts: number;
  createdAt: string;
  completedAt?: string;
  /** File size in bytes (for statistics tracking) */
  fileSize?: number;
}

// Watcher runtime state
export interface WatcherState {
  isWatching: boolean;
  isPaused: boolean;
  lastEventAt?: string;
  pendingFiles: string[];
}

// Detected replay folder with platform info
export interface DetectedFolder {
  path: string;
  platform: 'steam' | 'epic';
}

// ============================================================================
// Status Page Enhancement Types
// ============================================================================

// Real-time upload progress information
export interface UploadProgress {
  /** Upload record ID */
  id: string;
  /** Name of file being uploaded */
  filename: string;
  /** Bytes transferred so far */
  bytesUploaded: number;
  /** Total file size in bytes */
  totalBytes: number;
  /** Progress percentage (0-100) */
  percentage: number;
  /** Current upload speed in bytes/second */
  speed: number;
  /** Estimated seconds remaining */
  estimatedRemaining?: number;
}

// Aggregated upload statistics
export interface UploadStats {
  /** Count of all completed uploads */
  totalUploads: number;
  /** Count of all failed uploads */
  totalFailed: number;
  /** Percentage of successful uploads (0-100) */
  successRate: number;
  /** Sum of all successfully uploaded file sizes in bytes */
  totalBytesUploaded: number;
  /** Human-readable size (e.g., "1.2 GB") */
  totalBytesFormatted: string;
}

// Information about the watched folder for display
export interface FolderInfo {
  /** Full folder path */
  path: string;
  /** Truncated path for display */
  displayPath: string;
  /** Detected game platform */
  platform: 'steam' | 'epic' | 'unknown';
  /** Whether folder currently exists */
  exists: boolean;
}

// ============================================================================
// Environment Types
// ============================================================================

// Environment for live streaming (simplified version)
export interface Environment {
  id: string;
  name: string;
  description?: string;
  thumbnailUrl?: string;
  isDefault: boolean;
}

// Response from GET /api/environments
export interface EnvironmentsResponse {
  environments: Environment[];
  total: number;
}

// ============================================================================
// Live Viewer Types
// ============================================================================

// 3D position or velocity vector
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

// Rotation quaternion (normalized)
export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

// Ball state at a point in time
export interface BallSnapshot {
  position: Vector3;
  velocity: Vector3;
  rotation: Quaternion;
  angularVelocity: Vector3;
  /** Last team that touched the ball (0 = Blue, 1 = Orange, undefined = no touch yet) */
  lastTouchTeam?: number;
  /** Rigid body sleeping state (true = at rest, false = actively simulated) */
  sleeping: boolean;
}

// Car/player state at a point in time
export interface CarSnapshot {
  name: string;
  team: number; // 0=Blue, 1=Orange
  /** Is this the local player's car? */
  isLocal: boolean;
  position: Vector3;
  velocity: Vector3;
  rotation: Quaternion;
  boost: number; // 0-100
  isBoosting: boolean;
  isOnGround: boolean;
  isSupersonic: boolean;
  /** Ball cam active (true = following ball, false = following car) */
  ballCam: boolean;
  /** Car body ID (determines which car model to use, e.g., 23=Octane, 403=Fennec) */
  bodyId: number;
  /** Rigid body sleeping state (true = at rest, false = actively simulated) */
  sleeping: boolean;
}

// Game info: time, scores, and match state
export interface GameInfo {
  /** Event type name (e.g., "Soccar", "Hockey", "Hoops", etc.) */
  eventType: string;
  /** Time remaining in seconds (300.0 = 5:00) */
  timeRemaining: number;
  /** Blue team score */
  scoreBlue: number;
  /** Orange team score */
  scoreOrange: number;
  /** Is the match in overtime? */
  isOvertime: boolean;
  /** Has the match ended? */
  isMatchEnded: boolean;
  /** Unique ID of the last player who scored (e.g., "Steam_76561198012345678") */
  lastScorerId?: string;
  /** Playlist ID (e.g., 9=Training, 6=PrivateMatch, 13=RankedStandard) */
  playlistId: number;
  /** Playlist name (e.g., "Training", "RankedStandard", "Doubles") */
  playlistName: string;
  /** Kickoff countdown (3, 2, 1, 0 = GO!) */
  countdownTime: number;
  /** Is the game currently paused? */
  isPaused: boolean;
}

// Complete game state snapshot
export interface GameSnapshot {
  timestamp: number;
  ball: BallSnapshot;
  cars: CarSnapshot[];
  /** Match info (time, scores, etc.) */
  gameInfo?: GameInfo;
}

// Connection state enum for UI feedback
// When connected, matchState indicates if the player is in a match or in menus
export type LiveConnectionState =
  | { type: 'disconnected' }
  | { type: 'connecting' }
  | { type: 'connected'; matchState: 'inMatch' | 'inMenu' }
  | { type: 'error'; message: string };

// ============================================================================
// Live Streaming Types
// ============================================================================

// Broadcast state for live streaming to ballcam.tv
export type BroadcastState =
  | { type: 'notBroadcasting' }
  | { type: 'starting' }
  | { type: 'broadcasting'; sessionId: string; shareUrl: string; channelUrl: string; username: string; title: string; visibility: Visibility; startedAt: number; viewerCount: number }
  | { type: 'stopping' }
  | { type: 'error'; message: string; code?: string };

// ============================================================================
// Service Health Types
// ============================================================================

// Service availability status
export type ServiceStatus =
  | { type: 'available' }
  | { type: 'checking' }
  | { type: 'unavailable'; message: string };
