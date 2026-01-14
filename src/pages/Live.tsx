import { useState, useEffect, useRef } from 'react';
import { Radio, AlertCircle, Loader2, Gamepad2, User, Clock, Globe, Link, Sun, ChevronDown, Check, RefreshCw } from 'lucide-react';
import type { LiveConnectionState, GameSnapshot, BroadcastState, Visibility, Environment, ServiceStatus, AppConfig } from '@/lib/types';
import * as api from '@/lib/api';
import { BroadcastButton, BroadcastStatus, BroadcastStats, ShareUrl, StreamTitle } from '@/components/BroadcastPanel';

interface LiveProps {
  isActive: boolean;
}

export function Live({ isActive }: LiveProps) {
  const [connectionState, setConnectionState] = useState<LiveConnectionState>({ type: 'disconnected' });
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [broadcastState, setBroadcastState] = useState<BroadcastState>({ type: 'notBroadcasting' });
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [config, setConfig] = useState<AppConfig | null>(null);

  // Track if live monitoring is currently running
  const liveMonitoringRef = useRef(false);

  // Environment state
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedEnvironment, setSelectedEnvironment] = useState<Environment | null>(null);
  const [environmentsLoading, setEnvironmentsLoading] = useState(false);
  const [environmentsError, setEnvironmentsError] = useState<string | null>(null);
  const [environmentDropdownOpen, setEnvironmentDropdownOpen] = useState(false);

  // Service status
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>({ type: 'checking' });

  // Set up broadcast state listener
  useEffect(() => {
    const unlistenBroadcast = api.onBroadcastStateChanged((state) => {
      setBroadcastState(state);
    });

    // Load initial broadcast state
    api.getBroadcastState().then(setBroadcastState).catch(console.error);

    return () => {
      unlistenBroadcast.then((fn) => fn());
    };
  }, []);

  // Load config on mount
  useEffect(() => {
    api.getConfig().then(setConfig).catch(console.error);
  }, []);

  // Set up service status listener
  useEffect(() => {
    // Load initial status
    api.getServiceStatus().then(setServiceStatus).catch(console.error);

    // Listen for status changes
    const unlisten = api.onServiceStatusChanged(setServiceStatus);

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Load environments function (reusable for initial load and refresh)
  const loadEnvironments = async (autoSelectDefault = true) => {
    setEnvironmentsLoading(true);
    setEnvironmentsError(null);
    try {
      const envs = await api.getEnvironments();
      setEnvironments(envs);
      // Auto-select default environment if one exists and requested
      if (autoSelectDefault) {
        const defaultEnv = envs.find((e) => e.isDefault);
        if (defaultEnv) {
          setSelectedEnvironment(defaultEnv);
        }
      }
    } catch (err) {
      console.error('Failed to load environments:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load environments';
      setEnvironmentsError(errorMessage);
      // Update service status to unavailable
      setServiceStatus({ type: 'unavailable', message: errorMessage });
    } finally {
      setEnvironmentsLoading(false);
    }
  };

  // Load environments on mount
  useEffect(() => {
    loadEnvironments();
  }, []);

  // Start/stop live monitoring based on tab visibility and broadcast state
  useEffect(() => {
    if (isActive) {
      // Start live monitoring when tab becomes active
      api.startLive().then(() => {
        liveMonitoringRef.current = true;
      }).catch((err) => {
        console.error('Failed to start live monitoring:', err);
      });

      // Set up event listeners
      const unlistenState = api.onLiveStateChanged((state) => {
        setConnectionState(state);
      });

      const unlistenSnapshot = api.onLiveSnapshot((snap) => {
        setSnapshot(snap);
      });

      // Load initial state
      api.getLiveState().then(setConnectionState).catch(console.error);

      return () => {
        // Only stop live monitoring if NOT broadcasting
        // Check broadcastState via getBroadcastState to get latest value
        api.getBroadcastState().then((state) => {
          if (state.type !== 'broadcasting') {
            api.stopLive().then(() => {
              liveMonitoringRef.current = false;
            }).catch(console.error);
          }
          // If broadcasting, keep live monitoring running
        }).catch(() => {
          // If we can't check, stop anyway to be safe
          api.stopLive().then(() => {
            liveMonitoringRef.current = false;
          }).catch(console.error);
        });

        unlistenState.then((fn) => fn());
        unlistenSnapshot.then((fn) => fn());
      };
    }
  }, [isActive]);

  // Stop live monitoring when broadcast stops while not on Live tab
  useEffect(() => {
    if (!isActive && broadcastState.type === 'notBroadcasting' && liveMonitoringRef.current) {
      api.stopLive().then(() => {
        liveMonitoringRef.current = false;
      }).catch(console.error);
    }
  }, [isActive, broadcastState]);

  // Get status display info based on connection state
  const getStatusInfo = () => {
    switch (connectionState.type) {
      case 'disconnected':
        return {
          icon: <AlertCircle className="w-8 h-8 text-gray-400" />,
          text: 'Waiting for Rocket League...',
          description: 'Start Rocket League to begin live monitoring',
          color: 'bg-gray-500',
        };
      case 'connecting':
        return {
          icon: <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />,
          text: 'Connecting...',
          description: 'Attaching to Rocket League process',
          color: 'bg-violet-500',
        };
      case 'connected':
        if (connectionState.matchState === 'inMatch') {
          return {
            icon: <Radio className="w-8 h-8 text-green-400 animate-pulse" />,
            text: 'In Match',
            description: 'Receiving live game data',
            color: 'bg-green-500',
          };
        } else {
          return {
            icon: <Radio className="w-8 h-8 text-green-400" />,
            text: 'In Menu',
            description: 'Rocket League running - waiting for match',
            color: 'bg-green-500',
          };
        }
      case 'error':
        return {
          icon: <AlertCircle className="w-8 h-8 text-red-400" />,
          text: 'Connection Error',
          description: connectionState.message,
          color: 'bg-red-500',
        };
    }
  };

  const statusInfo = getStatusInfo();

  // Get local player name (first one if splitscreen)
  const getLocalPlayer = () => {
    if (!snapshot) return null;
    return snapshot.cars.find(c => c.isLocal) || null;
  };

  // Format time remaining as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const localPlayer = getLocalPlayer();
  const gameInfo = snapshot?.gameInfo;

  return (
    <div className="p-4 space-y-6">
      {/* Section 1: Rocket League Connection */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <Gamepad2 className="w-4 h-4 text-violet-400" />
          <h2 className="text-sm font-medium text-gray-300">Rocket League</h2>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-violet-500/20 to-blue-500/20 rounded-full flex items-center justify-center">
            {statusInfo.icon}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${statusInfo.color} ${connectionState.type !== 'disconnected' && connectionState.type !== 'error' ? 'animate-pulse' : ''}`} />
              <span className="text-base font-semibold text-white">{statusInfo.text}</span>
            </div>
            <p className="text-sm text-gray-400 mt-1">{statusInfo.description}</p>
          </div>
        </div>

        {/* Match info - Only show when in match */}
        {connectionState.type === 'connected' && connectionState.matchState === 'inMatch' && snapshot && snapshot.cars.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-800 space-y-3">
            {/* Player & Playlist Type */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-violet-400" />
                <span className="text-sm text-white font-medium">
                  {localPlayer?.name || 'Unknown'}
                </span>
              </div>
              {gameInfo && (
                <span className={`px-2 py-0.5 rounded text-xs ${getPlaylistStyle(gameInfo.playlistId)}`}>
                  {gameInfo.playlistName ? formatPlaylistName(gameInfo.playlistName) : gameInfo.eventType || 'Match'}
                </span>
              )}
            </div>

            {/* Time & Score */}
            {gameInfo && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-500" />
                  <span className={`text-lg font-mono font-semibold ${gameInfo.isOvertime ? 'text-yellow-400' : 'text-white'}`}>
                    {gameInfo.isOvertime ? '+' : ''}{formatTime(gameInfo.timeRemaining)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/20 border border-blue-500/30">
                    <div className="w-2 h-2 rounded-full bg-blue-400" />
                    <span className="text-lg font-bold text-blue-400">{gameInfo.scoreBlue}</span>
                  </div>
                  <span className="text-gray-600 text-lg font-bold">:</span>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/20 border border-orange-500/30">
                    <span className="text-lg font-bold text-orange-400">{gameInfo.scoreOrange}</span>
                    <div className="w-2 h-2 rounded-full bg-orange-400" />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 2: Live Streaming */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-violet-400" />
            <h2 className="text-sm font-medium text-gray-300">Live Streaming</h2>
          </div>
          <BroadcastStatus broadcastState={broadcastState} />
        </div>

        {/* Visibility selector - only show when not broadcasting */}
        {broadcastState.type === 'notBroadcasting' && (
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-gray-500">Visibility:</span>
            <div className="flex gap-1">
              <button
                onClick={() => setVisibility('public')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-all ${
                  visibility === 'public'
                    ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                <Globe className="w-3 h-3" />
                Public
              </button>
              <button
                onClick={() => setVisibility('unlisted')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-all ${
                  visibility === 'unlisted'
                    ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                <Link className="w-3 h-3" />
                Unlisted
              </button>
            </div>
          </div>
        )}

        {/* Stream title - unified component for before/during broadcast */}
        <StreamTitle
          config={config}
          isBroadcasting={broadcastState.type === 'broadcasting'}
          onConfigChange={setConfig}
        />

        {/* Environment selector */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-500">Environment:</span>
            {broadcastState.type === 'broadcasting' && (
              <span className="text-xs text-gray-600">(Click to change)</span>
            )}
            <button
              onClick={() => loadEnvironments(false)}
              disabled={environmentsLoading}
              className="p-1 text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
              title="Refresh environments"
            >
              <RefreshCw className={`w-3 h-3 ${environmentsLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="relative">
            <button
              onClick={() => setEnvironmentDropdownOpen(!environmentDropdownOpen)}
              disabled={environmentsLoading || !!environmentsError}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all ${
                environmentsError
                  ? 'bg-red-500/10 border-red-500/30 text-red-400'
                  : selectedEnvironment
                    ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                    : 'bg-gray-800 border-gray-700 text-gray-400'
              } hover:bg-gray-700/50 disabled:cursor-not-allowed`}
            >
              <div className="flex items-center gap-2">
                <Sun className="w-4 h-4" />
                {environmentsLoading ? (
                  <span className="text-sm">Loading environments...</span>
                ) : environmentsError ? (
                  <span className="text-sm text-red-400">Failed to load</span>
                ) : selectedEnvironment ? (
                  <span className="text-sm">{selectedEnvironment.name}</span>
                ) : (
                  <span className="text-sm text-gray-500">Select an environment</span>
                )}
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform ${environmentDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown menu */}
            {environmentDropdownOpen && environments.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                {environments.map((env) => (
                  <button
                    key={env.id}
                    onClick={async () => {
                      setSelectedEnvironment(env);
                      setEnvironmentDropdownOpen(false);
                      // If broadcasting, change environment immediately
                      if (broadcastState.type === 'broadcasting') {
                        try {
                          await api.setBroadcastEnvironment(env.id);
                        } catch (err) {
                          console.error('Failed to change environment:', err);
                        }
                      }
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors ${
                      selectedEnvironment?.id === env.id
                        ? 'bg-orange-500/20 text-orange-400'
                        : 'text-gray-300 hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Sun className="w-4 h-4 text-orange-400" />
                      <span>{env.name}</span>
                      {env.isDefault && (
                        <span className="text-xs px-1.5 py-0.5 bg-gray-700 rounded text-gray-400">Default</span>
                      )}
                    </div>
                    {selectedEnvironment?.id === env.id && <Check className="w-4 h-4" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          {environmentsError && (
            <p className="text-xs text-red-400 mt-1">{environmentsError}</p>
          )}
          {!selectedEnvironment && broadcastState.type === 'notBroadcasting' && !environmentsLoading && !environmentsError && environments.length > 0 && (
            <p className="text-xs text-red-400 mt-1">Please select an environment to start broadcasting</p>
          )}
        </div>

        <BroadcastButton
          broadcastState={broadcastState}
          isConnected={connectionState.type === 'connected'}
          visibility={visibility}
          environmentId={selectedEnvironment?.id}
          title={config?.streamTitle}
          requiresEnvironment={true}
          serviceStatus={serviceStatus}
        />
        {broadcastState.type === 'broadcasting' && (
          <ShareUrl channelUrl={broadcastState.channelUrl} />
        )}
        <BroadcastStats broadcastState={broadcastState} />
      </div>
    </div>
  );
}

// Get playlist badge style based on playlist ID
function getPlaylistStyle(playlistId: number): string {
  // Ranked playlists (yellow)
  // 10=RankedSoloDuel, 11=RankedTeamDoubles, 13=RankedStandard
  // 27=RankedHoops, 28=RankedRumble, 29=RankedDropshot, 30=RankedSnowDay
  if ([10, 11, 13, 27, 28, 29, 30].includes(playlistId)) {
    return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30';
  }
  // Tournament (purple)
  if ([22, 34].includes(playlistId)) {
    return 'bg-purple-500/20 text-purple-400 border border-purple-500/30';
  }
  // Private match (blue)
  if (playlistId === 6) {
    return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
  }
  // Training/Freeplay (gray)
  if (playlistId === 9) {
    return 'bg-gray-700 text-gray-400';
  }
  // Workshop (cyan)
  if (playlistId === 19) {
    return 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30';
  }
  // Extra modes casual: Hoops, Rumble (orange)
  if ([17, 18].includes(playlistId)) {
    return 'bg-orange-500/20 text-orange-400 border border-orange-500/30';
  }
  // Knockout (red)
  if (playlistId === 54) {
    return 'bg-red-500/20 text-red-400 border border-red-500/30';
  }
  // Experimental (pink)
  if (playlistId === 16) {
    return 'bg-pink-500/20 text-pink-400 border border-pink-500/30';
  }
  // Season/Offline (gray darker)
  if ([7, 8].includes(playlistId)) {
    return 'bg-gray-800 text-gray-500';
  }
  // Unknown
  if (playlistId === -1337 || playlistId === 0) {
    return 'bg-gray-800 text-gray-500';
  }
  // Casual (green) - default for 1, 2, 3, 4 and others
  return 'bg-green-500/20 text-green-400 border border-green-500/30';
}

// Format playlist name for display
function formatPlaylistName(name: string): string {
  // Map internal names to friendly display names
  const nameMap: Record<string, string> = {
    // Standard modes
    'Unknown': 'Unknown',
    'Casual': 'Casual',
    'Duel': '1v1',
    'Doubles': '2v2',
    'Standard': '3v3',
    'Chaos': '4v4',
    'PrivateMatch': 'Private',
    'Season': 'Season',
    'OfflineSplitscreen': 'Offline',
    'Training': 'Freeplay',
    // Ranked
    'RankedSoloDuel': 'Ranked 1v1',
    'RankedTeamDoubles': 'Ranked 2v2',
    'RankedStandard': 'Ranked 3v3',
    'RankedBasketballDoubles': 'Ranked Hoops',
    'RankedRumble': 'Ranked Rumble',
    'RankedBreakout': 'Ranked Dropshot',
    'RankedSnowDay': 'Ranked Snow Day',
    // Extra modes
    'Experimental': 'Experimental',
    'BasketballDoubles': 'Hoops',
    'Rumble': 'Rumble',
    'Workshop': 'Workshop',
    'Knockout': 'Knockout',
    // Tournament
    'Tournament': 'Tournament',
    'AutoTournament': 'Tournament',
  };
  return nameMap[name] || name;
}
