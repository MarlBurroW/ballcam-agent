import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { AppConfig, AuthSession, WatcherState } from './types';
import * as api from './api';

interface AppState {
  config: AppConfig | null;
  session: AuthSession | null;
  watcherState: WatcherState;
  isLoading: boolean;
  error: string | null;
}

interface AppContextType extends AppState {
  refreshConfig: () => Promise<void>;
  refreshSession: () => Promise<void>;
  setError: (error: string | null) => void;
}

const defaultWatcherState: WatcherState = {
  isWatching: false,
  isPaused: false,
  pendingFiles: [],
};

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    config: null,
    session: null,
    watcherState: defaultWatcherState,
    isLoading: true,
    error: null,
  });

  const refreshConfig = async () => {
    try {
      const config = await api.getConfig();
      setState((prev) => ({ ...prev, config }));
    } catch (err) {
      console.error('Failed to load config:', err);
    }
  };

  const refreshSession = async () => {
    try {
      const session = await api.getSession();
      setState((prev) => ({ ...prev, session }));
    } catch (err) {
      console.error('Failed to load session:', err);
    }
  };

  const setError = (error: string | null) => {
    setState((prev) => ({ ...prev, error }));
  };

  useEffect(() => {
    const init = async () => {
      await Promise.all([refreshConfig(), refreshSession()]);
      setState((prev) => ({ ...prev, isLoading: false }));
    };
    init();
  }, []);

  return (
    <AppContext.Provider
      value={{
        ...state,
        refreshConfig,
        refreshSession,
        setError,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

// Re-export for convenience
export { AppContext };
