import { BarChart3, CheckCircle2, XCircle, HardDrive } from 'lucide-react';
import type { UploadStats as UploadStatsType } from '@/lib/types';

interface UploadStatsProps {
  stats: UploadStatsType | null;
}

export function UploadStats({ stats }: UploadStatsProps) {
  // Show empty state if no stats or no uploads yet
  if (!stats || (stats.totalUploads === 0 && stats.totalFailed === 0)) {
    return (
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <BarChart3 className="w-5 h-5 text-violet-400" />
          <h3 className="text-sm font-medium text-white">Upload Statistics</h3>
        </div>
        <p className="text-sm text-gray-500 text-center py-4">
          No uploads yet. Stats will appear after your first upload.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4">
      <div className="flex items-center gap-3 mb-4">
        <BarChart3 className="w-5 h-5 text-violet-400" />
        <h3 className="text-sm font-medium text-white">Upload Statistics</h3>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Total Uploads */}
        <div className="bg-gray-800/50 rounded-xl p-3 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          </div>
          <p className="text-lg font-semibold text-white">{stats.totalUploads}</p>
          <p className="text-xs text-gray-400">Uploaded</p>
        </div>

        {/* Success Rate */}
        <div className="bg-gray-800/50 rounded-xl p-3 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            {stats.totalFailed > 0 ? (
              <XCircle className="w-4 h-4 text-red-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-green-400" />
            )}
          </div>
          <p className="text-lg font-semibold text-white">
            {stats.successRate.toFixed(0)}%
          </p>
          <p className="text-xs text-gray-400">Success</p>
        </div>

        {/* Total Data */}
        <div className="bg-gray-800/50 rounded-xl p-3 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <HardDrive className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-lg font-semibold text-white">
            {stats.totalBytesFormatted}
          </p>
          <p className="text-xs text-gray-400">Uploaded</p>
        </div>
      </div>
    </div>
  );
}
