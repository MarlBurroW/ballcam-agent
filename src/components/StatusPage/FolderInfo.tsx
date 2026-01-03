import { Folder, ExternalLink, AlertTriangle } from 'lucide-react';
import type { FolderInfo as FolderInfoType } from '@/lib/types';
import * as api from '@/lib/api';

interface FolderInfoProps {
  folderInfo: FolderInfoType | null;
}

/**
 * Get platform badge styling and label
 */
function getPlatformBadge(platform: string): { label: string; className: string } {
  switch (platform) {
    case 'steam':
      return {
        label: 'Steam',
        className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      };
    case 'epic':
      return {
        label: 'Epic',
        className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      };
    default:
      return {
        label: 'Unknown',
        className: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
      };
  }
}

export function FolderInfo({ folderInfo }: FolderInfoProps) {
  // Don't render if no folder info
  if (!folderInfo) {
    return null;
  }

  const handleOpenFolder = async () => {
    try {
      await api.openFolder(folderInfo.path);
    } catch (err) {
      console.error('Failed to open folder:', err);
    }
  };

  const platformBadge = getPlatformBadge(folderInfo.platform);

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <Folder className="w-5 h-5 text-violet-400" />
        <h3 className="text-sm font-medium text-white flex-1">Watched Folder</h3>
        <span
          className={`text-xs px-2 py-0.5 rounded-full border ${platformBadge.className}`}
        >
          {platformBadge.label}
        </span>
      </div>

      {/* Folder Path */}
      <div className="flex items-center gap-2">
        <p
          className="text-sm text-gray-400 flex-1 truncate"
          title={folderInfo.path}
        >
          {folderInfo.displayPath}
        </p>
        <button
          onClick={handleOpenFolder}
          className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          title="Open folder"
        >
          <ExternalLink className="w-4 h-4" />
        </button>
      </div>

      {/* Warning if folder doesn't exist */}
      {!folderInfo.exists && (
        <div className="mt-3 flex items-center gap-2 text-xs text-yellow-400">
          <AlertTriangle className="w-4 h-4" />
          <span>Folder not found - check your settings</span>
        </div>
      )}
    </div>
  );
}
