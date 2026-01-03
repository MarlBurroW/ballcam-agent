import { useEffect, useState, useCallback } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export interface UpdateInfo {
  version: string;
  date?: string;
  body?: string;
}

export type UpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'error';

export function useUpdater() {
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);

  // Derived states for backward compatibility
  const isChecking = status === 'checking';
  const isDownloading = status === 'downloading';
  const isUpToDate = status === 'up-to-date';

  const checkForUpdates = useCallback(async () => {
    console.log('[Updater] Checking for updates...');
    setStatus('checking');
    setError(null);
    try {
      const update = await check();
      console.log('[Updater] Check result:', update);
      if (update) {
        console.log('[Updater] Update available:', update.version);
        setUpdateAvailable({
          version: update.version,
          date: update.date,
          body: update.body,
        });
        setPendingUpdate(update);
        setStatus('available');
      } else {
        console.log('[Updater] No update available (already on latest)');
        setUpdateAvailable(null);
        setPendingUpdate(null);
        setStatus('up-to-date');
        // Reset to idle after 3 seconds
        setTimeout(() => setStatus('idle'), 3000);
      }
    } catch (err) {
      console.error('[Updater] Failed to check for updates:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      setStatus('error');
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    if (!pendingUpdate) {
      console.error('[Updater] No pending update to install');
      return;
    }

    setStatus('downloading');
    setDownloadProgress(0);
    setError(null);

    try {
      let downloaded = 0;
      let contentLength = 0;

      console.log('[Updater] Starting download...');
      await pendingUpdate.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength || 0;
            console.log('[Updater] Download started, size:', contentLength);
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              const progress = Math.round((downloaded / contentLength) * 100);
              setDownloadProgress(progress);
            }
            break;
          case 'Finished':
            console.log('[Updater] Download finished');
            setDownloadProgress(100);
            break;
        }
      });

      console.log('[Updater] Installing and relaunching...');
      await relaunch();
    } catch (err) {
      console.error('[Updater] Failed to download/install update:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      setStatus('error');
    }
  }, [pendingUpdate]);

  // Check for updates on mount
  useEffect(() => {
    checkForUpdates();
  }, [checkForUpdates]);

  return {
    updateAvailable,
    status,
    isChecking,
    isDownloading,
    isUpToDate,
    downloadProgress,
    error,
    checkForUpdates,
    downloadAndInstall,
  };
}
