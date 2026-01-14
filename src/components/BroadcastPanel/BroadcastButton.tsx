import { useState } from 'react';
import { Radio, Loader2, StopCircle, WifiOff } from 'lucide-react';
import type { BroadcastState, ServiceStatus, Visibility } from '@/lib/types';
import * as api from '@/lib/api';

interface BroadcastButtonProps {
  broadcastState: BroadcastState;
  isConnected: boolean;
  visibility: Visibility;
  environmentId?: string;
  title?: string;
  requiresEnvironment?: boolean;
  serviceStatus?: ServiceStatus;
}

export function BroadcastButton({ broadcastState, isConnected, visibility, environmentId, title, requiresEnvironment = false, serviceStatus }: BroadcastButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleStartBroadcast = async () => {
    setIsLoading(true);
    try {
      await api.startBroadcast(visibility, environmentId, title || undefined);
      // State will be updated via event listener
    } catch (err) {
      console.error('Failed to start broadcast:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopBroadcast = async () => {
    setIsLoading(true);
    try {
      await api.stopBroadcast();
      // State will be updated via event listener
    } catch (err) {
      console.error('Failed to stop broadcast:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const isBroadcasting = broadcastState.type === 'broadcasting';
  const isStarting = broadcastState.type === 'starting';
  const isStopping = broadcastState.type === 'stopping';
  const hasError = broadcastState.type === 'error';
  const hasEnvironment = !requiresEnvironment || !!environmentId;
  const isServiceAvailable = !serviceStatus || serviceStatus.type === 'available';
  // Allow starting from notBroadcasting OR error state (to retry after an error)
  const canStart = isConnected && isServiceAvailable && (broadcastState.type === 'notBroadcasting' || hasError) && hasEnvironment;
  const canStop = isBroadcasting;

  // Determine button state
  let buttonLabel = 'Start Broadcast';
  let buttonIcon = <Radio className="w-5 h-5" />;
  let buttonClass = 'bg-gradient-to-r from-violet-500 to-blue-500 hover:from-violet-600 hover:to-blue-600';
  let isDisabled = !canStart && !canStop;

  if (isLoading || isStarting) {
    buttonLabel = 'Starting...';
    buttonIcon = <Loader2 className="w-5 h-5 animate-spin" />;
    isDisabled = true;
  } else if (isStopping) {
    buttonLabel = 'Stopping...';
    buttonIcon = <Loader2 className="w-5 h-5 animate-spin" />;
    isDisabled = true;
  } else if (isBroadcasting) {
    buttonLabel = 'Stop Broadcast';
    buttonIcon = <StopCircle className="w-5 h-5" />;
    buttonClass = 'bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600';
  } else if (!isServiceAvailable) {
    buttonLabel = 'Service unavailable';
    buttonIcon = <WifiOff className="w-5 h-5" />;
    isDisabled = true;
    buttonClass = 'bg-gray-700 cursor-not-allowed';
  } else if (!isConnected) {
    buttonLabel = 'Start Rocket League first';
    isDisabled = true;
    buttonClass = 'bg-gray-700 cursor-not-allowed';
  } else if (!hasEnvironment) {
    buttonLabel = 'Select environment first';
    isDisabled = true;
    buttonClass = 'bg-gray-700 cursor-not-allowed';
  }

  const handleClick = isBroadcasting ? handleStopBroadcast : handleStartBroadcast;

  return (
    <div className="space-y-3">
      <button
        onClick={handleClick}
        disabled={isDisabled}
        className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white font-medium transition-all ${buttonClass} ${
          isDisabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        {buttonIcon}
        {buttonLabel}
      </button>

      {hasError && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-sm text-red-400">{broadcastState.message}</p>
        </div>
      )}

      {!isServiceAvailable && serviceStatus?.type === 'unavailable' && !isBroadcasting && (
        <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
          <p className="text-sm text-orange-400">
            Cannot start broadcast: {serviceStatus.message}
          </p>
        </div>
      )}
    </div>
  );
}
