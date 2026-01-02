import { useState, useEffect } from 'react';
import { Loader2, Globe, Lock, FolderOpen, Bell, Power, Info, Download } from 'lucide-react';
import { getVersion } from '@tauri-apps/api/app';
import type { AppConfig, Visibility } from '@/lib/types';
import * as api from '@/lib/api';
import { useUpdater } from '@/hooks/useUpdater';

export function SettingsPanel() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState<string>('');
  const { updateAvailable, isChecking, isDownloading, downloadProgress, checkForUpdates, downloadAndInstall } = useUpdater();

  useEffect(() => {
    loadConfig();
    getVersion().then(setVersion);
  }, []);

  const loadConfig = async () => {
    try {
      const cfg = await api.getConfig();
      setConfig(cfg);
    } catch (err) {
      setError('Failed to load settings');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async (newConfig: AppConfig) => {
    setSaving(true);
    setError(null);
    try {
      await api.saveConfig(newConfig);
      setConfig(newConfig);
    } catch (err) {
      setError('Failed to save settings');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleVisibilityChange = (visibility: Visibility) => {
    if (config) {
      saveConfig({ ...config, defaultVisibility: visibility });
    }
  };

  const handleAutoStartChange = () => {
    if (config) {
      saveConfig({ ...config, autoStart: !config.autoStart });
    }
  };

  const handleNotificationsChange = () => {
    if (config) {
      saveConfig({ ...config, notificationsEnabled: !config.notificationsEnabled });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="p-4 text-center text-red-400">
        Failed to load settings
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Visibility Setting */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Default Visibility</h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleVisibilityChange('public')}
            disabled={saving}
            className={`flex items-center gap-2 p-3 rounded-xl border transition-all ${
              config.defaultVisibility === 'public'
                ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
                : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-600'
            }`}
          >
            <Globe className="w-4 h-4" />
            <div className="text-left">
              <p className="text-sm font-medium">Public</p>
              <p className="text-xs opacity-70">Anyone can view</p>
            </div>
          </button>
          <button
            onClick={() => handleVisibilityChange('unlisted')}
            disabled={saving}
            className={`flex items-center gap-2 p-3 rounded-xl border transition-all ${
              config.defaultVisibility === 'unlisted'
                ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
                : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-600'
            }`}
          >
            <Lock className="w-4 h-4" />
            <div className="text-left">
              <p className="text-sm font-medium">Unlisted</p>
              <p className="text-xs opacity-70">Link only</p>
            </div>
          </button>
        </div>
      </div>

      {/* App Settings */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl divide-y divide-gray-800">
        <button
          onClick={handleAutoStartChange}
          disabled={saving}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-800/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <Power className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-white">Start with Windows</p>
              <p className="text-xs text-gray-500">Launch when you log in</p>
            </div>
          </div>
          <div className={`w-11 h-6 rounded-full transition-colors ${
            config.autoStart ? 'bg-violet-500' : 'bg-gray-700'
          }`}>
            <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform mt-0.5 ${
              config.autoStart ? 'translate-x-5.5 ml-0.5' : 'translate-x-0.5'
            }`} style={{ transform: config.autoStart ? 'translateX(22px)' : 'translateX(2px)' }} />
          </div>
        </button>

        <button
          onClick={handleNotificationsChange}
          disabled={saving}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-800/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-yellow-500/20 rounded-lg flex items-center justify-center">
              <Bell className="w-4 h-4 text-yellow-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-white">Notifications</p>
              <p className="text-xs text-gray-500">Show when uploads complete</p>
            </div>
          </div>
          <div className={`w-11 h-6 rounded-full transition-colors ${
            config.notificationsEnabled ? 'bg-violet-500' : 'bg-gray-700'
          }`}>
            <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform mt-0.5`}
              style={{ transform: config.notificationsEnabled ? 'translateX(22px)' : 'translateX(2px)' }} />
          </div>
        </button>
      </div>

      {/* Replay Folder */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
            <FolderOpen className="w-4 h-4 text-green-400" />
          </div>
          <h3 className="text-sm font-medium text-white">Replay Folder</h3>
        </div>
        <div className="p-3 bg-gray-800/50 rounded-lg text-xs font-mono text-gray-400 break-all">
          {config.replayFolder || 'Not configured'}
        </div>
      </div>

      {/* About / Version */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-violet-500/20 rounded-lg flex items-center justify-center">
              <Info className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-white">BallCam Agent</h3>
              <p className="text-xs text-gray-500">Version {version}</p>
            </div>
          </div>
          {updateAvailable ? (
            <button
              onClick={downloadAndInstall}
              disabled={isDownloading}
              className="flex items-center gap-2 px-3 py-1.5 bg-violet-500 hover:bg-violet-600 disabled:bg-violet-500/50 text-white text-xs font-medium rounded-lg transition-colors"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {downloadProgress}%
                </>
              ) : (
                <>
                  <Download className="w-3 h-3" />
                  Update to {updateAvailable.version}
                </>
              )}
            </button>
          ) : (
            <button
              onClick={checkForUpdates}
              disabled={isChecking}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700/50 text-gray-300 text-xs font-medium rounded-lg transition-colors"
            >
              {isChecking ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                'Check for updates'
              )}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
