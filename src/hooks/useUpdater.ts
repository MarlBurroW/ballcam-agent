import { useEffect, useState } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export interface UpdateInfo {
  version: string;
  date?: string;
  body?: string;
}

export function useUpdater() {
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const checkForUpdates = async () => {
    setIsChecking(true);
    setError(null);
    try {
      const update = await check();
      if (update) {
        setUpdateAvailable({
          version: update.version,
          date: update.date,
          body: update.body,
        });
      }
    } catch (err) {
      console.error('Failed to check for updates:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsChecking(false);
    }
  };

  const downloadAndInstall = async () => {
    setIsDownloading(true);
    setDownloadProgress(0);
    try {
      const update = await check();
      if (update) {
        let downloaded = 0;
        let contentLength = 0;

        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case 'Started':
              contentLength = event.data.contentLength || 0;
              break;
            case 'Progress':
              downloaded += event.data.chunkLength;
              if (contentLength > 0) {
                setDownloadProgress(Math.round((downloaded / contentLength) * 100));
              }
              break;
            case 'Finished':
              setDownloadProgress(100);
              break;
          }
        });

        // Relaunch the app after update
        await relaunch();
      }
    } catch (err) {
      console.error('Failed to download/install update:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDownloading(false);
    }
  };

  // Check for updates on mount
  useEffect(() => {
    checkForUpdates();
  }, []);

  return {
    updateAvailable,
    isChecking,
    isDownloading,
    downloadProgress,
    error,
    checkForUpdates,
    downloadAndInstall,
  };
}
