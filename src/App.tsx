import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Loader2 } from 'lucide-react';
import { Setup } from './pages/Setup';
import { Main } from './pages/Main';
import { Settings } from './pages/Settings';
import { History } from './pages/History';
import { AppLayout } from './components/AppLayout';
import * as api from './lib/api';

type Tab = 'home' | 'history' | 'settings';

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [setupComplete, setSetupComplete] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [currentTab, setCurrentTab] = useState<Tab>('home');

  useEffect(() => {
    const checkState = async () => {
      try {
        const [config, session] = await Promise.all([
          api.getConfig(),
          api.getSession(),
        ]);
        setSetupComplete(config.setupComplete);
        setHasSession(session !== null);
      } catch (err) {
        console.error('Failed to load app state:', err);
      } finally {
        setIsLoading(false);
      }
    };
    checkState();
  }, []);

  // Listen for tray menu events
  useEffect(() => {
    const unlistenSettings = listen('open_settings', () => {
      setCurrentTab('settings');
    });

    const unlistenHistory = listen('open_history', () => {
      setCurrentTab('history');
    });

    return () => {
      unlistenSettings.then((fn) => fn());
      unlistenHistory.then((fn) => fn());
    };
  }, []);

  const handleSetupComplete = () => {
    setSetupComplete(true);
    setHasSession(true);
  };

  const handleLogout = async () => {
    try {
      await api.logout();
      setHasSession(false);
      setSetupComplete(false);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-violet-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!setupComplete || !hasSession) {
    return <Setup onComplete={handleSetupComplete} />;
  }

  // Render with AppLayout
  const renderContent = () => {
    switch (currentTab) {
      case 'settings':
        return <Settings />;
      case 'history':
        return <History />;
      default:
        return <Main />;
    }
  };

  return (
    <AppLayout
      currentTab={currentTab}
      onTabChange={setCurrentTab}
      onLogout={handleLogout}
    >
      {renderContent()}
    </AppLayout>
  );
}

export default App;
