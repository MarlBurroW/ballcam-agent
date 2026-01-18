import { useState, useEffect, memo, useMemo } from 'react';
import { Bug, Circle, Car, Gamepad2, Zap, ChevronDown, ChevronRight } from 'lucide-react';
import type { LiveConnectionState, GameSnapshot, BallSnapshot, CarSnapshot, GameInfo, Vector3, Quaternion } from '@/lib/types';
import * as api from '@/lib/api';

// ============================================================================
// Utility formatters (memoized)
// ============================================================================

const formatVector = (v: Vector3 | undefined): string => {
  if (!v) return '—';
  return `(${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)})`;
};

const formatQuat = (q: Quaternion | undefined): string => {
  if (!q) return '—';
  return `(${q.x.toFixed(3)}, ${q.y.toFixed(3)}, ${q.z.toFixed(3)}, ${q.w.toFixed(3)})`;
};

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatSpeed = (v: Vector3 | undefined): string => {
  if (!v) return '—';
  const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  return `${speed.toFixed(0)} uu/s`;
};

// ============================================================================
// Data Row Component
// ============================================================================

interface DataRowProps {
  label: string;
  value: string | number | boolean | undefined;
  highlight?: boolean;
}

const DataRow = memo(function DataRow({ label, value, highlight }: DataRowProps) {
  const displayValue = typeof value === 'boolean'
    ? (value ? 'Yes' : 'No')
    : (value ?? '—');

  return (
    <div className="flex justify-between py-0.5 text-xs">
      <span className="text-gray-500">{label}</span>
      <span className={highlight ? 'text-violet-400 font-medium' : 'text-gray-300 font-mono'}>
        {String(displayValue)}
      </span>
    </div>
  );
});

// ============================================================================
// Ball Section
// ============================================================================

interface BallSectionProps {
  ball: BallSnapshot | undefined;
}

const BallSection = memo(function BallSection({ ball }: BallSectionProps) {
  const speed = useMemo(() => formatSpeed(ball?.velocity), [ball?.velocity]);
  const position = useMemo(() => formatVector(ball?.position), [ball?.position]);
  const velocity = useMemo(() => formatVector(ball?.velocity), [ball?.velocity]);
  const rotation = useMemo(() => formatQuat(ball?.rotation), [ball?.rotation]);
  const angularVel = useMemo(() => formatVector(ball?.angularVelocity), [ball?.angularVelocity]);

  const lastTouchTeam = ball?.lastTouchTeam === 0 ? 'Blue' : ball?.lastTouchTeam === 1 ? 'Orange' : 'None';

  return (
    <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800">
      <div className="flex items-center gap-2 mb-2">
        <Circle className="w-4 h-4 text-orange-400" />
        <h3 className="text-sm font-medium text-gray-200">Ball</h3>
      </div>
      <div className="space-y-0">
        <DataRow label="Position" value={position} />
        <DataRow label="Velocity" value={velocity} />
        <DataRow label="Speed" value={speed} highlight />
        <DataRow label="Rotation" value={rotation} />
        <DataRow label="Angular Vel" value={angularVel} />
        <DataRow label="Last Touch" value={lastTouchTeam} />
        <DataRow label="Hidden" value={ball?.isHidden} highlight={ball?.isHidden} />
        <DataRow label="Sleeping" value={ball?.sleeping} />
      </div>
    </div>
  );
});

// ============================================================================
// Car Section
// ============================================================================

interface CarSectionProps {
  car: CarSnapshot;
}

const CarSection = memo(function CarSection({ car }: CarSectionProps) {
  const speed = useMemo(() => formatSpeed(car.velocity), [car.velocity]);
  const position = useMemo(() => formatVector(car.position), [car.position]);
  const velocity = useMemo(() => formatVector(car.velocity), [car.velocity]);
  const rotation = useMemo(() => formatQuat(car.rotation), [car.rotation]);

  const teamColor = car.team === 0 ? 'text-blue-400' : 'text-orange-400';
  const teamName = car.team === 0 ? 'Blue' : 'Orange';

  // Platform and ID are now separate fields
  const platformDisplay = car.platform || '—';
  const platformIdDisplay = car.uniqueId || '—';

  return (
    <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800">
      <div className="flex items-center gap-2 mb-2">
        <Car className={`w-4 h-4 ${teamColor}`} />
        <h3 className="text-sm font-medium text-gray-200">
          {car.name} {car.isLocal && <span className="text-violet-400">(You)</span>}
          {car.isBot && <span className="text-yellow-400 ml-1">(Bot)</span>}
        </h3>
      </div>

      {/* Identity */}
      <div className="mb-2 pb-2 border-b border-gray-800">
        <p className="text-xs text-gray-500 mb-1">Identity</p>
        <DataRow label="Team" value={teamName} />
        <DataRow label="Player ID" value={car.playerId} highlight />
        <DataRow label="Is Bot" value={car.isBot} />
        <DataRow label="Platform" value={platformDisplay} />
        <DataRow label="Platform ID" value={platformIdDisplay} />
        <DataRow label="Unique ID" value={car.uniqueId || '—'} />
      </div>

      {/* Physics */}
      <div className="mb-2 pb-2 border-b border-gray-800">
        <p className="text-xs text-gray-500 mb-1">Physics</p>
        <DataRow label="Position" value={position} />
        <DataRow label="Velocity" value={velocity} />
        <DataRow label="Speed" value={speed} highlight />
        <DataRow label="Rotation" value={rotation} />
        <DataRow label="Steer" value={car.steer?.toFixed(2) ?? '—'} />
        <DataRow label="On Ground" value={car.isOnGround} />
        <DataRow label="Sleeping" value={car.sleeping} />
      </div>

      {/* State */}
      <div>
        <p className="text-xs text-gray-500 mb-1">State</p>
        <DataRow label="Boost" value={`${car.boost}%`} highlight />
        <DataRow label="Boosting" value={car.isBoosting} />
        <DataRow label="Supersonic" value={car.isSupersonic} />
        <DataRow label="Ball Cam" value={car.ballCam} />
        <DataRow label="Body ID" value={car.bodyId} />
        <DataRow label="Demolished" value={car.isDemolished} highlight={car.isDemolished} />
        {car.isDemolished && car.demolishedBy !== undefined && (
          <DataRow label="Demolished By (ID)" value={car.demolishedBy} />
        )}
        <DataRow label="Hidden" value={car.isHidden} highlight={car.isHidden} />
        <DataRow label="Sleeping" value={car.sleeping} />
      </div>
    </div>
  );
});

// ============================================================================
// Game Info Section
// ============================================================================

interface GameInfoSectionProps {
  gameInfo: GameInfo | undefined;
}

const GameInfoSection = memo(function GameInfoSection({ gameInfo }: GameInfoSectionProps) {
  if (!gameInfo) {
    return (
      <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800">
        <div className="flex items-center gap-2 mb-2">
          <Gamepad2 className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-medium text-gray-200">Game Info</h3>
        </div>
        <p className="text-xs text-gray-500">No game info available</p>
      </div>
    );
  }

  const timeDisplay = useMemo(() => formatTime(gameInfo.timeRemaining), [gameInfo.timeRemaining]);

  return (
    <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800">
      <div className="flex items-center gap-2 mb-2">
        <Gamepad2 className="w-4 h-4 text-violet-400" />
        <h3 className="text-sm font-medium text-gray-200">Game Info</h3>
      </div>

      {/* Match State */}
      <div className="mb-2 pb-2 border-b border-gray-800">
        <p className="text-xs text-gray-500 mb-1">Match State</p>
        <DataRow label="Event Type" value={gameInfo.eventType} />
        <DataRow label="Playlist" value={`${gameInfo.playlistName} (${gameInfo.playlistId})`} />
        <DataRow label="Time" value={timeDisplay} highlight />
        <DataRow label="Score" value={`${gameInfo.scoreBlue} - ${gameInfo.scoreOrange}`} highlight />
        <DataRow label="Countdown" value={gameInfo.countdownTime} />
      </div>

      {/* Flags */}
      <div className="mb-2 pb-2 border-b border-gray-800">
        <p className="text-xs text-gray-500 mb-1">Flags</p>
        <DataRow label="Overtime" value={gameInfo.isOvertime} />
        <DataRow label="Match Ended" value={gameInfo.isMatchEnded} />
        <DataRow label="Paused" value={gameInfo.isPaused} />
      </div>

      {/* Replay State (v9) */}
      <div className="mb-2 pb-2 border-b border-gray-800">
        <p className="text-xs text-gray-500 mb-1">Replay State (v9)</p>
        <DataRow label="In Replay" value={gameInfo.isInReplay} highlight={gameInfo.isInReplay} />
        <DataRow label="Time Dilation" value={gameInfo.timeDilation.toFixed(2)} highlight={gameInfo.timeDilation < 1} />
        <DataRow label="Focus Player ID" value={gameInfo.replayFocusPlayerId ?? '—'} />
        <DataRow label="On Podium" value={gameInfo.isOnPodium} highlight={gameInfo.isOnPodium} />
      </div>

      {/* Scorer */}
      <div>
        <p className="text-xs text-gray-500 mb-1">Last Scorer</p>
        <DataRow label="Player ID" value={gameInfo.lastScorerId ?? '—'} />
      </div>
    </div>
  );
});

// ============================================================================
// Boost Pads Section (Collapsible)
// ============================================================================

interface BoostPadsSectionProps {
  snapshot: GameSnapshot | null;
}

const BoostPadsSection = memo(function BoostPadsSection({ snapshot }: BoostPadsSectionProps) {
  const [expanded, setExpanded] = useState(false);

  // Count available boost pads
  const stats = useMemo(() => {
    if (!snapshot || !('boostPads' in snapshot)) return null;
    const pads = (snapshot as unknown as { boostPads: Array<{ isAvailable: boolean; isBig: boolean }> }).boostPads;
    if (!pads) return null;

    const bigAvailable = pads.filter(p => p.isBig && p.isAvailable).length;
    const bigTotal = pads.filter(p => p.isBig).length;
    const smallAvailable = pads.filter(p => !p.isBig && p.isAvailable).length;
    const smallTotal = pads.filter(p => !p.isBig).length;

    return { bigAvailable, bigTotal, smallAvailable, smallTotal, total: pads.length };
  }, [snapshot]);

  if (!stats) {
    return null;
  }

  return (
    <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500" />
        )}
        <Zap className="w-4 h-4 text-yellow-400" />
        <h3 className="text-sm font-medium text-gray-200">Boost Pads</h3>
        <span className="text-xs text-gray-500 ml-auto">
          Big: {stats.bigAvailable}/{stats.bigTotal} | Small: {stats.smallAvailable}/{stats.smallTotal}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 pt-2 border-t border-gray-800">
          <p className="text-xs text-gray-500">Total pads: {stats.total}</p>
        </div>
      )}
    </div>
  );
});

// ============================================================================
// Connection Status
// ============================================================================

interface ConnectionStatusProps {
  state: LiveConnectionState;
  timestamp: number | undefined;
}

const ConnectionStatus = memo(function ConnectionStatus({ state, timestamp }: ConnectionStatusProps) {
  const statusColor = state.type === 'connected' ? 'text-green-400' :
                      state.type === 'connecting' ? 'text-yellow-400' :
                      state.type === 'error' ? 'text-red-400' : 'text-gray-400';

  const statusText = state.type === 'connected'
    ? `Connected (${state.matchState === 'inMatch' ? 'In Match' : 'In Menu'})`
    : state.type === 'connecting' ? 'Connecting...'
    : state.type === 'error' ? `Error: ${state.message}`
    : 'Disconnected';

  return (
    <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-medium text-gray-200">Debug View</h3>
        </div>
        <div className="flex items-center gap-4">
          {timestamp && (
            <span className="text-xs text-gray-500 font-mono">
              {new Date(timestamp).toLocaleTimeString()}
            </span>
          )}
          <span className={`text-xs ${statusColor}`}>{statusText}</span>
        </div>
      </div>
    </div>
  );
});

// ============================================================================
// Main Debug Page
// ============================================================================

export function Debug() {
  const [connectionState, setConnectionState] = useState<LiveConnectionState>({ type: 'disconnected' });
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);

  useEffect(() => {
    // Start live monitoring
    api.startLive().catch(console.error);

    // Set up event listeners
    const unlistenState = api.onLiveStateChanged(setConnectionState);
    const unlistenSnapshot = api.onLiveSnapshot(setSnapshot);

    // Load initial state
    api.getLiveState().then(setConnectionState).catch(console.error);

    return () => {
      api.stopLive().catch(console.error);
      unlistenState.then((fn) => fn());
      unlistenSnapshot.then((fn) => fn());
    };
  }, []);

  return (
    <div className="p-4 h-full overflow-y-auto">
      <ConnectionStatus state={connectionState} timestamp={snapshot?.timestamp} />

      {snapshot ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Column */}
          <div className="space-y-4">
            <GameInfoSection gameInfo={snapshot.gameInfo} />
            <BallSection ball={snapshot.ball} />
            <BoostPadsSection snapshot={snapshot} />
          </div>

          {/* Right Column - Cars */}
          <div className="space-y-4">
            {snapshot.cars.length > 0 ? (
              snapshot.cars.map((car) => (
                <CarSection key={`${car.name}-${car.team}`} car={car} />
              ))
            ) : (
              <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800">
                <p className="text-xs text-gray-500">No cars in snapshot</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500 text-sm">Waiting for snapshot data...</p>
        </div>
      )}
    </div>
  );
}
