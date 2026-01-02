import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { GradientButton } from './ui/gradient-button';
import { AuthCard } from './ui/gradient-card';
import * as api from '@/lib/api';
import type { DetectedFolder } from '@/lib/types';
import { Folder, FolderSearch, AlertCircle, ArrowLeft, Loader2, Check } from 'lucide-react';

// Steam logo SVG
function SteamLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658a3.387 3.387 0 0 1 1.912-.59c.064 0 .128.003.191.006l2.866-4.158v-.058a4.525 4.525 0 0 1 4.524-4.524 4.527 4.527 0 0 1 4.526 4.524 4.527 4.527 0 0 1-4.526 4.524h-.105l-4.091 2.921c.003.054.006.109.006.163a3.392 3.392 0 0 1-3.392 3.392 3.397 3.397 0 0 1-3.356-2.912L.465 15.14A11.98 11.98 0 0 0 11.979 24c6.627 0 12-5.373 12-12s-5.373-12-12-12zM7.54 18.21l-1.473-.61a2.542 2.542 0 0 0 1.318 1.318 2.546 2.546 0 0 0 3.31-1.421 2.53 2.53 0 0 0 .001-1.943 2.54 2.54 0 0 0-1.373-1.371 2.536 2.536 0 0 0-1.899-.036l1.523.63a1.87 1.87 0 0 1-1.407 3.433zm8.9-6.785a3.02 3.02 0 0 0 3.017-3.016 3.023 3.023 0 0 0-3.017-3.018 3.023 3.023 0 0 0-3.018 3.018 3.02 3.02 0 0 0 3.018 3.016zm-.002-5.282a2.27 2.27 0 0 1 2.266 2.266 2.27 2.27 0 0 1-2.266 2.266 2.27 2.27 0 0 1-2.265-2.266 2.27 2.27 0 0 1 2.265-2.266z"/>
    </svg>
  );
}

// Epic Games logo SVG
function EpicLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M3.537 0C2.165 0 1.66.506 1.66 1.879V18.44a4.262 4.262 0 0 0 .136 1.07 1.47 1.47 0 0 0 1.163 1.18c.353.087.83.144 1.36.144h15.602c.96 0 1.42-.48 1.42-1.44V4.32c0-.96-.48-1.44-1.44-1.44H5.798v-.72c0-.48.24-.72.72-.72h13.44c.96 0 1.44-.48 1.44-1.44H4.258zm3.6 5.28h11.52c.96 0 1.44.48 1.44 1.44v9.6c0 .96-.48 1.44-1.44 1.44H7.137c-.96 0-1.44-.48-1.44-1.44v-9.6c0-.96.48-1.44 1.44-1.44zm.72 1.44v9.12h1.2v-3.84h2.4v-.96h-2.4v-2.4h2.64v-.96H7.857zm5.04 0v9.12h1.2v-3.6h1.68c1.08 0 1.8-.72 1.8-1.8v-1.92c0-1.08-.72-1.8-1.8-1.8h-2.88zm1.2.96h1.44c.48 0 .72.24.72.72v1.68c0 .48-.24.72-.72.72h-1.44V7.68z"/>
    </svg>
  );
}

interface FolderDetectionProps {
  onConfirm: (folder: string) => void;
  onBack: () => void;
}

export function FolderDetection({ onConfirm, onBack }: FolderDetectionProps) {
  const [detectedFolders, setDetectedFolders] = useState<DetectedFolder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const detectFolders = async () => {
      try {
        const folders = await api.detectAllReplayFolders();
        setDetectedFolders(folders);
        // Auto-select if only one folder found
        if (folders.length === 1) {
          setSelectedFolder(folders[0].path);
        }
        if (folders.length === 0) {
          setError('Rocket League replay folder not found');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    };
    detectFolders();
  }, []);

  const handleBrowse = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Rocket League Replays Folder',
      });
      if (selected) {
        setSelectedFolder(selected as string);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to open folder dialog:', err);
    }
  };

  const handleConfirm = () => {
    if (selectedFolder) {
      onConfirm(selectedFolder);
    }
  };

  const handleSelectFolder = (folder: DetectedFolder) => {
    setSelectedFolder(folder.path);
  };

  // Check if selected folder is from detection or manual
  const isManualSelection = selectedFolder && !detectedFolders.find(f => f.path === selectedFolder);

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-violet-500/20 mb-4">
          <Folder className="w-7 h-7 text-violet-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Replay Folder</h1>
        <p className="text-gray-400">
          {detectedFolders.length > 1
            ? 'Select which version of Rocket League to watch'
            : "We'll watch this folder for new replays"
          }
        </p>
      </div>

      <AuthCard>
        {isLoading ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
            <p className="text-gray-400">Detecting replay folders...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Platform selection when multiple folders detected */}
            {detectedFolders.length > 1 && (
              <div className="grid grid-cols-2 gap-3">
                {detectedFolders.map((folder) => (
                  <button
                    key={folder.path}
                    onClick={() => handleSelectFolder(folder)}
                    className={`relative p-4 rounded-xl border-2 transition-all ${
                      selectedFolder === folder.path
                        ? 'border-violet-500 bg-violet-500/10'
                        : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                  >
                    {selectedFolder === folder.path && (
                      <div className="absolute top-2 right-2">
                        <Check className="w-4 h-4 text-violet-400" />
                      </div>
                    )}
                    <div className="flex flex-col items-center gap-3">
                      {folder.platform === 'steam' ? (
                        <SteamLogo className="w-10 h-10 text-[#1b2838]" />
                      ) : (
                        <EpicLogo className="w-10 h-10 text-white" />
                      )}
                      <span className="text-sm font-medium text-white">
                        {folder.platform === 'steam' ? 'Steam' : 'Epic Games'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Error message */}
            {error && detectedFolders.length === 0 && !selectedFolder && (
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

            {/* Selected folder display (for single detection or manual selection) */}
            {selectedFolder && (detectedFolders.length <= 1 || isManualSelection) && (
              <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
                <p className="text-xs text-gray-500 mb-2">
                  {isManualSelection ? 'Selected folder:' : 'Detected folder:'}
                </p>
                <p className="text-sm font-mono text-white break-all">{selectedFolder}</p>
              </div>
            )}

            {/* Browse button */}
            <GradientButton
              variant="outline"
              className="w-full gap-2"
              onClick={handleBrowse}
            >
              <FolderSearch className="w-4 h-4" />
              {selectedFolder ? 'Choose Different Folder' : 'Browse for Folder'}
            </GradientButton>

            {/* Action buttons */}
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
                disabled={!selectedFolder}
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
