import { useState, useEffect, useCallback, useRef } from 'react';
import { open } from '@tauri-apps/plugin-shell';
import { GradientButton } from './ui/gradient-button';
import { AuthCard } from './ui/gradient-card';
import * as api from '@/lib/api';
import type { User, DeviceCodeResponse } from '@/lib/types';
import { Loader2, ExternalLink, RefreshCw, CheckCircle2, XCircle, LogIn } from 'lucide-react';

interface DeviceLoginFlowProps {
  onSuccess: (user: User) => void;
  onSwitchToPassword?: () => void;
}

type FlowState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'code_ready'; code: DeviceCodeResponse }
  | { status: 'polling'; code: DeviceCodeResponse }
  | { status: 'success'; user: User }
  | { status: 'expired' }
  | { status: 'denied' }
  | { status: 'error'; message: string };

export function DeviceLoginFlow({ onSuccess, onSwitchToPassword }: DeviceLoginFlowProps) {
  const [state, setState] = useState<FlowState>({ status: 'idle' });
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (code: DeviceCodeResponse) => {
      setState({ status: 'polling', code });

      const pollInterval = (code.interval || 5) * 1000;

      pollingRef.current = setInterval(async () => {
        if (!mountedRef.current) {
          stopPolling();
          return;
        }

        try {
          const result = await api.pollDeviceToken(code.device_code);

          if (!mountedRef.current) return;

          switch (result.status) {
            case 'pending':
              break;
            case 'slow_down':
              break;
            case 'success':
              stopPolling();
              setState({ status: 'success', user: result.user });
              onSuccess(result.user);
              break;
            case 'expired':
              stopPolling();
              setState({ status: 'expired' });
              break;
            case 'denied':
              stopPolling();
              setState({ status: 'denied' });
              break;
          }
        } catch (err) {
          console.error('Polling error:', err);
        }
      }, pollInterval);
    },
    [stopPolling, onSuccess]
  );

  const startFlow = useCallback(async () => {
    stopPolling();
    setState({ status: 'loading' });

    try {
      const code = await api.requestDeviceCode();
      if (!mountedRef.current) return;
      setState({ status: 'code_ready', code });
    } catch (err) {
      if (!mountedRef.current) return;
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [stopPolling]);

  const openAndStartPolling = useCallback(async (code: DeviceCodeResponse) => {
    try {
      await open(code.verification_url);
      // Start polling automatically after opening the URL
      startPolling(code);
    } catch (err) {
      console.error('Failed to open URL:', err);
    }
  }, [startPolling]);

  useEffect(() => {
    mountedRef.current = true;
    startFlow();

    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, [startFlow, stopPolling]);

  const renderContent = () => {
    switch (state.status) {
      case 'idle':
      case 'loading':
        return (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
            <p className="text-gray-400">Generating code...</p>
          </div>
        );

      case 'code_ready':
      case 'polling':
        return (
          <div className="flex flex-col items-center gap-6">
            <div className="text-center">
              <p className="text-sm text-gray-400 mb-3">
                Click below to open the authorization page:
              </p>
              <div className="font-mono text-3xl font-bold tracking-wider text-white py-4 px-6 bg-gray-800/50 border border-gray-700 rounded-lg">
                {state.code.user_code}
              </div>
            </div>

            {state.status === 'code_ready' && (
              <GradientButton
                className="w-full gap-2"
                onClick={() => openAndStartPolling(state.code)}
              >
                <ExternalLink className="h-4 w-4" />
                Open {state.code.verification_url}
              </GradientButton>
            )}

            {state.status === 'polling' && (
              <>
                <div className="flex items-center gap-2 text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
                  <span className="text-sm">Waiting for authorization...</span>
                </div>
                <p className="text-xs text-gray-500">
                  Enter code <span className="font-mono font-bold text-violet-400">{state.code.user_code}</span> on the page
                </p>
              </>
            )}

            <p className="text-xs text-gray-500 text-center">
              Code expires in {Math.floor(state.code.expires_in / 60)} minutes
            </p>
          </div>
        );

      case 'success':
        return (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-green-400" />
            </div>
            <div className="text-center">
              <p className="font-medium text-white">Welcome, {state.user.username}!</p>
              <p className="text-sm text-gray-400">Device authorized successfully</p>
            </div>
          </div>
        );

      case 'expired':
        return (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center">
              <XCircle className="h-7 w-7 text-red-400" />
            </div>
            <div className="text-center">
              <p className="font-medium text-white">Code expired</p>
              <p className="text-sm text-gray-400">
                The authorization code has expired. Please try again.
              </p>
            </div>
            <GradientButton onClick={startFlow} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Get new code
            </GradientButton>
          </div>
        );

      case 'denied':
        return (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center">
              <XCircle className="h-7 w-7 text-red-400" />
            </div>
            <div className="text-center">
              <p className="font-medium text-white">Authorization denied</p>
              <p className="text-sm text-gray-400">
                You denied the authorization request.
              </p>
            </div>
            <GradientButton onClick={startFlow} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try again
            </GradientButton>
          </div>
        );

      case 'error':
        return (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center">
              <XCircle className="h-7 w-7 text-red-400" />
            </div>
            <div className="text-center">
              <p className="font-medium text-white">Something went wrong</p>
              <p className="text-sm text-red-400">{state.message}</p>
            </div>
            <GradientButton onClick={startFlow} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try again
            </GradientButton>
          </div>
        );
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-violet-500/20 mb-4">
          <LogIn className="w-7 h-7 text-violet-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Welcome to BallCam</h1>
        <p className="text-gray-400">Sign in with your BallCam account</p>
      </div>

      <AuthCard>
        {renderContent()}

        {onSwitchToPassword && state.status !== 'success' && (
          <div className="pt-6 mt-6 border-t border-gray-700/50">
            <p className="text-xs text-center text-gray-500">
              Have a password?{' '}
              <button
                onClick={onSwitchToPassword}
                className="text-violet-400 hover:text-violet-300 transition-colors"
              >
                Sign in with email
              </button>
            </p>
          </div>
        )}
      </AuthCard>
    </div>
  );
}
