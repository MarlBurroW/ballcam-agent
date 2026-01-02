// Visibility options for uploaded replays
export type Visibility = 'public' | 'unlisted';

// Application configuration stored in config.json
export interface AppConfig {
  replayFolder: string;
  defaultVisibility: Visibility;
  autoStart: boolean;
  notificationsEnabled: boolean;
  setupComplete: boolean;
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
