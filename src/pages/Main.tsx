import { useState, useEffect } from 'react';
import { Eye, Upload, Clock, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import type { FolderInfo as FolderInfoType, UploadProgress as UploadProgressType, UploadRecord, UploadStats as UploadStatsType, User, WatcherState } from '@/lib/types';
import { UserCard } from '@/components/StatusPage/UserCard';
import { FolderInfo } from '@/components/StatusPage/FolderInfo';
import { UploadStats } from '@/components/StatusPage/UploadStats';
import * as api from '@/lib/api';
import { UploadProgress } from '@/components/StatusPage/UploadProgress';
import { WatcherControl } from '@/components/StatusPage/WatcherControl';

export function Main() {
  const [watcherState, setWatcherState] = useState<WatcherState | null>(null);
  const [lastUpload, setLastUpload] = useState<UploadRecord | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressType | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [folderInfo, setFolderInfo] = useState<FolderInfoType | null>(null);
  const [uploadStats, setUploadStats] = useState<UploadStatsType | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshWatcherState = async () => {
    try {
      const state = await api.getWatcherStatus();
      setWatcherState(state);
    } catch (err) {
      console.error('Failed to load watcher state:', err);
    }
  };

  const loadUserData = async () => {
    try {
      const session = await api.getSession();
      if (session) {
        setUser(session.user);
      }
    } catch (err) {
      console.error('Failed to load user data:', err);
    }
  };

  const loadFolderInfo = async () => {
    try {
      const info = await api.getFolderInfo();
      setFolderInfo(info);
    } catch (err) {
      console.error('Failed to load folder info:', err);
    }
  };

  const loadUploadStats = async () => {
    try {
      const stats = await api.getUploadStats();
      setUploadStats(stats);
    } catch (err) {
      console.error('Failed to load upload stats:', err);
    }
  };

  useEffect(() => {
    // Load initial data
    const loadAllData = async () => {
      await Promise.all([
        refreshWatcherState(),
        loadUserData(),
        loadFolderInfo(),
        loadUploadStats(),
      ]);
      setIsLoading(false);
    };
    loadAllData();

    // Listen for upload events
    const unlistenStarted = listen<UploadRecord>('upload_started', () => {
      setIsUploading(true);
      setUploadProgress(null);
    });

    const unlistenProgress = listen<UploadProgressType>('upload_progress', (event) => {
      setUploadProgress(event.payload);
    });

    const unlistenCompleted = listen<UploadRecord>('upload_completed', (event) => {
      setIsUploading(false);
      setUploadProgress(null);
      setLastUpload(event.payload);
      // Refresh stats after successful upload
      loadUploadStats();
    });

    const unlistenFailed = listen<UploadRecord>('upload_failed', (event) => {
      setIsUploading(false);
      setUploadProgress(null);
      setLastUpload(event.payload);
    });

    return () => {
      unlistenStarted.then((fn) => fn());
      unlistenProgress.then((fn) => fn());
      unlistenCompleted.then((fn) => fn());
      unlistenFailed.then((fn) => fn());
    };
  }, []);

  const getStatusIcon = () => {
    if (isUploading) {
      return <Upload className="w-8 h-8 text-violet-400 animate-bounce" />;
    }
    if (watcherState?.isWatching && !watcherState?.isPaused) {
      return <Eye className="w-8 h-8 text-green-400" />;
    }
    return <AlertCircle className="w-8 h-8 text-yellow-400" />;
  };

  const getStatusText = () => {
    if (isUploading) {
      return 'Uploading...';
    }
    if (watcherState?.isWatching && !watcherState?.isPaused) {
      return 'Watching for Replays';
    }
    if (watcherState?.isPaused) {
      return 'Paused';
    }
    return 'Not Watching';
  };

  const getStatusColor = () => {
    if (isUploading) {
      return 'bg-violet-500';
    }
    if (watcherState?.isWatching && !watcherState?.isPaused) {
      return 'bg-green-500';
    }
    return 'bg-yellow-500';
  };

  // Show loading state while initial data is loading
  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
          <p className="text-sm text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Status Card */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-gradient-to-br from-violet-500/20 to-blue-500/20 rounded-full flex items-center justify-center">
            {getStatusIcon()}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${getStatusColor()} animate-pulse`} />
              <span className="text-lg font-semibold text-white">{getStatusText()}</span>
            </div>
            <p className="text-sm text-gray-400 mt-1">
              {isUploading
                ? 'Your replay is being uploaded to BallCam'
                : 'New replays will be uploaded automatically'}
            </p>
          </div>
        </div>
      </div>

      {/* User Card */}
      <UserCard user={user} />

      {/* Upload Progress */}
      <UploadProgress progress={uploadProgress} isUploading={isUploading} />

      {/* Watcher Control */}
      <WatcherControl watcherState={watcherState} onStateChange={refreshWatcherState} />

      {/* Folder Info */}
      <FolderInfo folderInfo={folderInfo} />

      {/* Upload Stats */}
      <UploadStats stats={uploadStats} />

      {/* Pending Files */}
      {watcherState?.pendingFiles && watcherState.pendingFiles.length > 0 && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Pending Uploads
          </h3>
          <div className="space-y-2">
            {watcherState.pendingFiles.map((file, index) => (
              <div key={index} className="flex items-center gap-2 text-sm text-gray-300">
                <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" />
                <span className="truncate">{file.split(/[\\/]/).pop()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last Upload */}
      {lastUpload && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Last Upload</h3>
          <div className="flex items-start gap-3">
            {lastUpload.status === 'completed' ? (
              <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-red-400 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{lastUpload.filename}</p>
              {lastUpload.status === 'completed' && lastUpload.replayUrl && (
                <button
                  onClick={() => api.openUrl(lastUpload.replayUrl!)}
                  className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                >
                  View on BallCam
                </button>
              )}
              {lastUpload.status === 'failed' && lastUpload.errorMessage && (
                <p className="text-xs text-red-400 mt-1">{lastUpload.errorMessage}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Info Card */}
      <div className="bg-gradient-to-r from-violet-500/10 to-blue-500/10 border border-violet-500/20 rounded-xl p-4">
        <p className="text-xs text-gray-400 text-center">
          This window can be minimized. The app will continue running in your system tray.
        </p>
      </div>
    </div>
  );
}
