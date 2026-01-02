import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { GradientButton } from './ui/gradient-button';
import { AuthCard } from './ui/gradient-card';
import * as api from '@/lib/api';
import { Folder, FolderSearch, AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';

interface FolderDetectionProps {
  onConfirm: (folder: string) => void;
  onBack: () => void;
}

export function FolderDetection({ onConfirm, onBack }: FolderDetectionProps) {
  const [folder, setFolder] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const detectFolder = async () => {
      try {
        const detectedFolder = await api.detectReplayFolder();
        setFolder(detectedFolder);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    };
    detectFolder();
  }, []);

  const handleBrowse = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Rocket League Replays Folder',
      });
      if (selected) {
        setFolder(selected as string);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to open folder dialog:', err);
    }
  };

  const handleConfirm = () => {
    if (folder) {
      onConfirm(folder);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-violet-500/20 mb-4">
          <Folder className="w-7 h-7 text-violet-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Replay Folder</h1>
        <p className="text-gray-400">We'll watch this folder for new replays</p>
      </div>

      <AuthCard>
        {isLoading ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
            <p className="text-gray-400">Detecting replay folder...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {error && !folder && (
              <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-amber-400">{error}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    You can manually select the folder below.
                  </p>
                </div>
              </div>
            )}

            {folder && (
              <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
                <p className="text-xs text-gray-500 mb-2">
                  {error ? 'Selected folder:' : 'Detected folder:'}
                </p>
                <p className="text-sm font-mono text-white break-all">{folder}</p>
              </div>
            )}

            <GradientButton
              variant="outline"
              className="w-full gap-2"
              onClick={handleBrowse}
            >
              <FolderSearch className="w-4 h-4" />
              {folder ? 'Choose Different Folder' : 'Browse for Folder'}
            </GradientButton>

            <div className="flex gap-3 pt-2">
              <GradientButton
                variant="outline"
                className="flex-1 gap-2"
                onClick={onBack}
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </GradientButton>
              <GradientButton
                className="flex-1"
                onClick={handleConfirm}
                disabled={!folder}
              >
                Confirm
              </GradientButton>
            </div>
          </div>
        )}
      </AuthCard>
    </div>
  );
}
