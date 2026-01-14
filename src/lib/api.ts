import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type {
  AppConfig,
  AuthSession,
  BroadcastState,
  DetectedFolder,
  DeviceCodeResponse,
  DevicePollResult,
  Environment,
  FolderInfo,
  GameSnapshot,
  LiveConnectionState,
  ServiceStatus,
  UploadRecord,
  UploadStats,
  User,
  Visibility,
  WatcherState,
} from './types';

// Configuration commands
export async function getConfig(): Promise<AppConfig> {
  return invoke('get_config');
}

export async function saveConfig(config: AppConfig): Promise<void> {
  return invoke('save_config', { newConfig: config });
}

// Authentication commands
export async function getSession(): Promise<AuthSession | null> {
  return invoke('get_session');
}

export async function login(email: string, password: string): Promise<User> {
  return invoke('login', { email, password });
}

export async function logout(): Promise<void> {
  return invoke('logout');
}

// Device flow commands
export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  return invoke('request_device_code');
}

export async function pollDeviceToken(deviceCode: string): Promise<DevicePollResult> {
  return invoke('poll_device_token', { deviceCode });
}

export async function refreshDeviceToken(): Promise<User> {
  return invoke('refresh_device_token');
}

export async function fetchMe(): Promise<User> {
  return invoke('fetch_me');
}

// Upload commands (to be implemented)
export async function uploadReplay(
  filePath: string,
  visibility?: 'public' | 'unlisted'
): Promise<UploadRecord> {
  return invoke('upload_replay', { filePath, visibility });
}

// History commands
export async function getHistory(): Promise<UploadRecord[]> {
  return invoke('get_history');
}

export async function retryUpload(recordId: string): Promise<UploadRecord> {
  return invoke('retry_upload', { recordId });
}

// Watcher commands
export async function pauseWatcher(): Promise<void> {
  return invoke('pause_watcher');
}

export async function resumeWatcher(): Promise<void> {
  return invoke('resume_watcher');
}

export async function getWatcherStatus(): Promise<WatcherState> {
  return invoke('get_watcher_status');
}

// Window management commands
export async function minimizeToTray(): Promise<void> {
  return invoke('minimize_to_tray');
}

export async function showWindow(): Promise<void> {
  return invoke('show_window');
}

// Folder detection
export async function detectReplayFolder(): Promise<string> {
  return invoke('detect_replay_folder');
}

export async function detectAllReplayFolders(): Promise<DetectedFolder[]> {
  return invoke('detect_all_replay_folders');
}

// Folder info commands
export async function getFolderInfo(): Promise<FolderInfo> {
  return invoke('get_folder_info');
}

export async function openFolder(path: string): Promise<void> {
  return invoke('open_folder', { path });
}

// Upload statistics
export async function getUploadStats(): Promise<UploadStats> {
  return invoke('get_upload_stats');
}

// Open URL in default browser
export async function openUrl(url: string): Promise<void> {
  const { open } = await import('@tauri-apps/plugin-shell');
  await open(url);
}

// ============================================================================
// Live Viewer Commands
// ============================================================================

// Get current live connection state
export async function getLiveState(): Promise<LiveConnectionState> {
  return invoke('get_live_state');
}

// Start live monitoring
export async function startLive(): Promise<void> {
  return invoke('start_live');
}

// Stop live monitoring
export async function stopLive(): Promise<void> {
  return invoke('stop_live');
}

// Event listeners for live viewer
export async function onLiveStateChanged(
  callback: (state: LiveConnectionState) => void
): Promise<UnlistenFn> {
  return listen<LiveConnectionState>('live_state_changed', (event) => {
    callback(event.payload);
  });
}

export async function onLiveSnapshot(
  callback: (snapshot: GameSnapshot) => void
): Promise<UnlistenFn> {
  return listen<GameSnapshot>('live_snapshot', (event) => {
    callback(event.payload);
  });
}

// ============================================================================
// Live Streaming (Broadcast) Commands
// ============================================================================

// Start broadcasting to ballcam.tv
export async function startBroadcast(
  visibility?: Visibility,
  environmentId?: string,
  title?: string
): Promise<{ sessionId: string; shareUrl: string; channelUrl: string; username: string; title: string }> {
  const [sessionId, shareUrl, channelUrl, username, streamTitle] = await invoke<[string, string, string, string, string]>('start_broadcast', {
    visibility,
    environmentId,
    title,
  });
  return { sessionId, shareUrl, channelUrl, username, title: streamTitle };
}

// Stop the current broadcast
export async function stopBroadcast(): Promise<void> {
  return invoke('stop_broadcast');
}

// Get the current broadcast state
export async function getBroadcastState(): Promise<BroadcastState> {
  return invoke('get_broadcast_state');
}

// Set the stream title during an active broadcast
// Rate limited to 1 change per 5 seconds by the server
export async function setBroadcastTitle(title: string): Promise<string> {
  return invoke('set_broadcast_title', { title });
}

// Event listener for broadcast state changes
export async function onBroadcastStateChanged(
  callback: (state: BroadcastState) => void
): Promise<UnlistenFn> {
  return listen<BroadcastState>('broadcast_state_changed', (event) => {
    callback(event.payload);
  });
}

// ============================================================================
// Environment Commands
// ============================================================================

// Get available environments from ballcam.tv
export async function getEnvironments(): Promise<Environment[]> {
  return invoke('get_environments');
}

// Set the environment during an active broadcast
export async function setBroadcastEnvironment(environmentId: string): Promise<void> {
  return invoke('set_broadcast_environment', { environmentId });
}

// ============================================================================
// Health Check Commands
// ============================================================================

// Get current service status
export async function getServiceStatus(): Promise<ServiceStatus> {
  return invoke('get_service_status');
}

// Trigger a health check (returns true if service is available)
export async function checkServiceHealth(): Promise<boolean> {
  return invoke('check_service_health');
}

// Event listener for service status changes
export async function onServiceStatusChanged(
  callback: (status: ServiceStatus) => void
): Promise<UnlistenFn> {
  return listen<ServiceStatus>('service_status_changed', (event) => {
    callback(event.payload);
  });
}
