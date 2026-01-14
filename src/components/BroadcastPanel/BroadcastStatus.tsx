import { useState, useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Loader2, AlertCircle, ArrowUp, Users, Clock, Database, Film } from 'lucide-react';
import type { BroadcastState } from '@/lib/types';

interface BroadcastStatusProps {
  broadcastState: BroadcastState;
}

interface TrafficEvent {
  bytesSent: number;
  snapshotsSent: number;
}

interface TrafficStats {
  bandwidth: number;
  totalBytes: number;
  totalSnapshots: number;
}

// Hook to share traffic stats between components
function useTrafficStats(isBroadcasting: boolean) {
  const [traffic, setTraffic] = useState<TrafficStats>({ bandwidth: 0, totalBytes: 0, totalSnapshots: 0 });
  const lastTrafficRef = useRef<{ bytes: number; time: number } | null>(null);

  useEffect(() => {
    if (!isBroadcasting) {
      setTraffic({ bandwidth: 0, totalBytes: 0, totalSnapshots: 0 });
      lastTrafficRef.current = null;
      return;
    }

    const unlisten = listen<TrafficEvent>('live_traffic', (event) => {
      const now = Date.now();
      const { bytesSent, snapshotsSent } = event.payload;

      let bandwidth = 0;
      if (lastTrafficRef.current) {
        const deltaBytes = bytesSent - lastTrafficRef.current.bytes;
        const deltaTime = (now - lastTrafficRef.current.time) / 1000;
        if (deltaTime > 0) {
          bandwidth = deltaBytes / deltaTime;
        }
      }

      lastTrafficRef.current = { bytes: bytesSent, time: now };
      setTraffic({ bandwidth, totalBytes: bytesSent, totalSnapshots: snapshotsSent });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [isBroadcasting]);

  return traffic;
}

/** Header badges: LIVE indicator + viewer count */
export function BroadcastStatus({ broadcastState }: BroadcastStatusProps) {
  if (broadcastState.type === 'notBroadcasting') {
    return (
      <span className="px-2 py-1 rounded-full bg-gray-800 text-gray-500 text-xs">
        Offline
      </span>
    );
  }

  if (broadcastState.type === 'starting') {
    return (
      <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-violet-500/20 text-violet-400 text-xs">
        <Loader2 className="w-3 h-3 animate-spin" />
        Connecting...
      </span>
    );
  }

  if (broadcastState.type === 'stopping') {
    return (
      <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-400 text-xs">
        <Loader2 className="w-3 h-3 animate-spin" />
        Stopping...
      </span>
    );
  }

  if (broadcastState.type === 'error') {
    return (
      <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/20 text-red-400 text-xs">
        <AlertCircle className="w-3 h-3" />
        Error
      </span>
    );
  }

  // Broadcasting state - show LIVE badge + viewer count
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-medium">
        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        LIVE
      </span>
      <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-violet-500/20 text-violet-400 text-xs font-medium">
        <Users className="w-3 h-3" />
        {broadcastState.viewerCount}
      </span>
    </div>
  );
}

/** Stats container: duration, bandwidth, data sent, frames */
export function BroadcastStats({ broadcastState }: BroadcastStatusProps) {
  const traffic = useTrafficStats(broadcastState.type === 'broadcasting');

  if (broadcastState.type !== 'broadcasting') {
    return null;
  }

  return (
    <div className="mt-3 p-3 bg-gray-800/50 border border-gray-700/50 rounded-lg">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-gray-500" />
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Duration</p>
            <p className="text-sm text-white font-mono">{formatDuration(broadcastState.startedAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ArrowUp className="w-3.5 h-3.5 text-gray-500" />
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Bandwidth</p>
            <p className="text-sm text-white font-mono">{formatBandwidth(traffic.bandwidth)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Database className="w-3.5 h-3.5 text-gray-500" />
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Data sent</p>
            <p className="text-sm text-white font-mono">{formatBytes(traffic.totalBytes)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Film className="w-3.5 h-3.5 text-gray-500" />
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Frames</p>
            <p className="text-sm text-white font-mono">{traffic.totalSnapshots.toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Format duration since broadcast started
function formatDuration(startedAt: number): string {
  const now = Date.now();
  const elapsed = Math.floor((now - startedAt) / 1000);

  if (elapsed < 60) {
    return `${elapsed}s`;
  }

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  if (minutes < 60) {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}:${mins.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Format bandwidth in human-readable format (bytes per second)
function formatBandwidth(bytesPerSec: number): string {
  if (bytesPerSec < 1024) {
    return `${Math.round(bytesPerSec)} B/s`;
  }
  if (bytesPerSec < 1024 * 1024) {
    return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  }
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

// Format total bytes in human-readable format
function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
