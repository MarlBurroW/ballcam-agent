import { useState, useEffect } from 'react';
import { Edit2, Loader2, Type } from 'lucide-react';
import * as api from '@/lib/api';
import type { AppConfig } from '@/lib/types';

interface StreamTitleProps {
  config: AppConfig | null;
  isBroadcasting: boolean;
  onConfigChange: (config: AppConfig) => void;
}

export function StreamTitle({ config, isBroadcasting, onConfigChange }: StreamTitleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(config?.streamTitle || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync editedTitle when config changes externally
  useEffect(() => {
    if (!isEditing && config) {
      setEditedTitle(config.streamTitle || '');
    }
  }, [config?.streamTitle, isEditing]);

  const currentTitle = config?.streamTitle || '';

  const handleSave = async () => {
    if (editedTitle === currentTitle) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Always save to config for persistence
      if (config) {
        const newConfig = { ...config, streamTitle: editedTitle };
        await api.saveConfig(newConfig);
        onConfigChange(newConfig);
      }

      // If broadcasting, also update via socket
      if (isBroadcasting) {
        await api.setBroadcastTitle(editedTitle);
      }

      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save title:', err);
      const message = err instanceof Error ? err.message : 'Failed to save title';
      if (message.includes('RATE_LIMIT')) {
        setError('Wait 5 seconds before changing title');
      } else {
        setError(message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedTitle(currentTitle);
    setIsEditing(false);
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Type className="w-3 h-3 text-gray-500" />
          <span className="text-xs text-gray-500">Stream Title:</span>
        </div>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-gray-700 text-gray-300 hover:bg-gray-600 transition-all"
            title="Edit title"
          >
            <Edit2 className="w-3 h-3" />
            Edit
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <input
            type="text"
            value={editedTitle}
            onChange={(e) => setEditedTitle(e.target.value.slice(0, 100))}
            onKeyDown={handleKeyDown}
            maxLength={100}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500"
            placeholder="Enter a title for your stream..."
            autoFocus
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">{editedTitle.length}/100</span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className="px-2 py-1 rounded text-xs bg-gray-700 text-gray-300 hover:bg-gray-600 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 transition-all disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save'
                )}
              </button>
            </div>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      ) : (
        <div className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg">
          <p className="text-sm text-white">
            {currentTitle || <span className="text-gray-500 italic">No title set</span>}
          </p>
        </div>
      )}
    </div>
  );
}
