import { invoke } from '@tauri-apps/api/core';
import type {
  AppConfig,
  AuthSession,
  DetectedFolder,
  DeviceCodeResponse,
  DevicePollResult,
  UploadRecord,
  User,
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

// Upload commands (to be implemented)
export async function uploadReplay(
  filePath: string,
  visibility?: 'public' | 'unlisted'
): Promise<UploadRecord> {
  return invoke('upload_replay', { filePath, visibility });
}

// History commands (to be implemented)
export async function getHistory(): Promise<UploadRecord[]> {
  return invoke('get_history');
}

// Watcher commands (to be implemented)
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

// Open URL in default browser
export async function openUrl(url: string): Promise<void> {
  const { open } = await import('@tauri-apps/plugin-shell');
  await open(url);
}
