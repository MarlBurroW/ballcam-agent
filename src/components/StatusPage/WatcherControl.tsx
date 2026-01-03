import { Pause, Play } from 'lucide-react';
import type { WatcherState } from '@/lib/types';
import * as api from '@/lib/api';

interface WatcherControlProps {
  watcherState: WatcherState | null;
  onStateChange: () => void;
}

export function WatcherControl({ watcherState, onStateChange }: WatcherControlProps) {
  const isWatching = watcherState?.isWatching ?? false;
  const isPaused = watcherState?.isPaused ?? false;

  const handlePause = async () => {
    try {
      await api.pauseWatcher();
      onStateChange();
    } catch (err) {
      console.error('Failed to pause watcher:', err);
    }
  };

  const handleResume = async () => {
    try {
      await api.resumeWatcher();
      onStateChange();
    } catch (err) {
      console.error('Failed to resume watcher:', err);
    }
  };

  // Don't render if watcher is not running
  if (!isWatching) {
    return null;
  }

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* State indicator */}
          <div className={`w-3 h-3 rounded-full ${isPaused ? 'bg-yellow-500' : 'bg-green-500'} animate-pulse`} />
          <div>
            <p className="text-sm font-medium text-white">
              {isPaused ? 'Watcher Paused' : 'Watcher Active'}
            </p>
            <p className="text-xs text-gray-400">
              {isPaused
                ? 'New replays will not be uploaded'
                : 'Monitoring for new replays'}
            </p>
          </div>
        </div>

        {/* Toggle button */}
        {isPaused ? (
          <button
            onClick={handleResume}
            className="flex items-center gap-2 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-lg text-green-400 text-sm font-medium transition-colors"
          >
            <Play className="w-4 h-4" />
            Resume
          </button>
        ) : (
          <button
            onClick={handlePause}
            className="flex items-center gap-2 px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm font-medium transition-colors"
          >
            <Pause className="w-4 h-4" />
            Pause
          </button>
        )}
      </div>
    </div>
  );
}
