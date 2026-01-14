import { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, Loader2, ArrowUpCircle, Gamepad2, Radio } from 'lucide-react';
import { getVersion } from '@tauri-apps/api/app';
import type { ServiceStatus, LiveConnectionState, BroadcastState } from '@/lib/types';
import { useUpdater } from '@/hooks/useUpdater';
import * as api from '@/lib/api';

export function ServiceStatusBar() {
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>({ type: 'checking' });
  const [liveState, setLiveState] = useState<LiveConnectionState>({ type: 'disconnected' });
  const [broadcastState, setBroadcastState] = useState<BroadcastState>({ type: 'notBroadcasting' });
  const [isRetrying, setIsRetrying] = useState(false);
  const [version, setVersion] = useState<string>('');
  const { updateAvailable, status: updateStatus, downloadAndInstall, downloadProgress } = useUpdater();

  useEffect(() => {
    // Load version
    getVersion().then(setVersion).catch(console.error);

    // Load initial service status
    api.getServiceStatus().then(setServiceStatus).catch(console.error);

    // Load initial live state
    api.getLiveState().then(setLiveState).catch(console.error);

    // Load initial broadcast state
    api.getBroadcastState().then(setBroadcastState).catch(console.error);

    // Listen for service status changes
    const unlistenService = api.onServiceStatusChanged((newStatus) => {
      setServiceStatus(newStatus);
      setIsRetrying(false);
    });

    // Listen for live state changes
    const unlistenLive = api.onLiveStateChanged(setLiveState);

    // Listen for broadcast state changes
    const unlistenBroadcast = api.onBroadcastStateChanged(setBroadcastState);

    return () => {
      unlistenService.then((fn) => fn());
      unlistenLive.then((fn) => fn());
      unlistenBroadcast.then((fn) => fn());
    };
  }, []);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      const isAvailable = await api.checkServiceHealth();
      if (isAvailable) {
        setServiceStatus({ type: 'available' });
      }
    } catch (err) {
      console.error('Health check failed:', err);
    } finally {
      setIsRetrying(false);
    }
  };

  // Service status indicator
  const ServiceIndicator = () => {
    if (serviceStatus.type === 'checking') {
      return (
        <div className="flex items-center gap-1.5" title="Checking connection...">
          <Loader2 className="w-3 h-3 text-gray-500 animate-spin" />
          <span className="text-xs text-gray-500">Ballcam.tv</span>
        </div>
      );
    }

    if (serviceStatus.type === 'available') {
      return (
        <div className="flex items-center gap-1.5" title="Connected to Ballcam.tv">
          <Wifi className="w-3 h-3 text-green-500" />
          <span className="text-xs text-gray-500">Ballcam.tv</span>
        </div>
      );
    }

    // Unavailable
    return (
      <div className="flex items-center gap-1.5">
        <div
          className="flex items-center gap-1.5 cursor-help"
          title={serviceStatus.message || 'Service unavailable'}
        >
          <WifiOff className="w-3 h-3 text-red-400" />
          <span className="text-xs text-red-400">Ballcam.tv</span>
        </div>
        <button
          onClick={handleRetry}
          disabled={isRetrying}
          className="p-0.5 text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
          title="Retry connection"
        >
          {isRetrying ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
        </button>
      </div>
    );
  };

  // Rocket League connection indicator
  const RocketLeagueIndicator = () => {
    const getStateInfo = () => {
      switch (liveState.type) {
        case 'disconnected':
          return { color: 'text-gray-500', text: 'Not running', title: 'Rocket League not detected' };
        case 'connecting':
          return { color: 'text-yellow-400', text: 'Connecting...', title: 'Connecting to Rocket League' };
        case 'connected':
          if (liveState.matchState === 'inMatch') {
            return { color: 'text-green-500', text: 'In match', title: 'Connected - receiving game data' };
          } else {
            return { color: 'text-green-500', text: 'In menu', title: 'Rocket League running - in menus' };
          }
        case 'error':
          return { color: 'text-red-400', text: 'Error', title: liveState.message || 'Connection error' };
        default:
          return { color: 'text-gray-500', text: 'Unknown', title: 'Unknown state' };
      }
    };

    const info = getStateInfo();

    return (
      <div className="flex items-center gap-1.5" title={info.title}>
        <Gamepad2 className={`w-3 h-3 ${info.color}`} />
        <span className={`text-xs ${info.color === 'text-gray-500' ? 'text-gray-500' : info.color}`}>
          {info.text}
        </span>
      </div>
    );
  };

  // Broadcast status indicator
  const BroadcastIndicator = () => {
    if (broadcastState.type === 'broadcasting') {
      return (
        <div className="flex items-center gap-1.5" title="Broadcasting live">
          <div className="relative">
            <Radio className="w-3 h-3 text-red-500" />
            <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
          </div>
          <span className="text-xs text-red-400 font-medium">LIVE</span>
        </div>
      );
    }

    if (broadcastState.type === 'starting') {
      return (
        <div className="flex items-center gap-1.5" title="Starting broadcast...">
          <Loader2 className="w-3 h-3 text-yellow-400 animate-spin" />
          <span className="text-xs text-yellow-400">Starting...</span>
        </div>
      );
    }

    if (broadcastState.type === 'stopping') {
      return (
        <div className="flex items-center gap-1.5" title="Stopping broadcast...">
          <Loader2 className="w-3 h-3 text-yellow-400 animate-spin" />
          <span className="text-xs text-yellow-400">Stopping...</span>
        </div>
      );
    }

    // Not broadcasting - don't show anything
    return null;
  };

  // Version display component
  const VersionDisplay = () => (
    <div className="flex items-center gap-2">
      {updateAvailable ? (
        <button
          onClick={downloadAndInstall}
          disabled={updateStatus === 'downloading'}
          className="flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium text-violet-400 bg-violet-500/10 rounded hover:bg-violet-500/20 transition-colors disabled:opacity-50"
        >
          {updateStatus === 'downloading' ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>{downloadProgress}%</span>
            </>
          ) : (
            <>
              <ArrowUpCircle className="w-3 h-3" />
              <span>Update to {updateAvailable.version}</span>
            </>
          )}
        </button>
      ) : (
        <span className="text-xs text-gray-600">v{version}</span>
      )}
    </div>
  );

  const isBroadcasting = broadcastState.type === 'broadcasting' || broadcastState.type === 'starting' || broadcastState.type === 'stopping';

  return (
    <div className="h-6 px-3 flex items-center justify-between border-t border-gray-800 bg-gray-900/30">
      {/* Left side: Status indicators */}
      <div className="flex items-center gap-4">
        <ServiceIndicator />
        <div className="w-px h-3 bg-gray-700" />
        <RocketLeagueIndicator />
        {isBroadcasting && (
          <>
            <div className="w-px h-3 bg-gray-700" />
            <BroadcastIndicator />
          </>
        )}
      </div>

      {/* Right side: Version */}
      <VersionDisplay />
    </div>
  );
}
