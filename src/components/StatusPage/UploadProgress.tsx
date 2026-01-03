import { Upload } from 'lucide-react';
import type { UploadProgress as UploadProgressType } from '@/lib/types';

interface UploadProgressProps {
  progress: UploadProgressType | null;
  isUploading: boolean;
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Format speed to human-readable string
 */
function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond === 0) return '-- MB/s';
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function UploadProgress({ progress, isUploading }: UploadProgressProps) {
  // Don't render if not uploading
  if (!isUploading) {
    return null;
  }

  const percentage = progress?.percentage ?? 0;
  const bytesUploaded = progress?.bytesUploaded ?? 0;
  const totalBytes = progress?.totalBytes ?? 0;
  const speed = progress?.speed ?? 0;

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <Upload className="w-5 h-5 text-violet-400 animate-bounce" />
        <div className="flex-1">
          <h3 className="text-sm font-medium text-white">
            Uploading{progress?.filename ? `: ${progress.filename}` : '...'}
          </h3>
        </div>
        <span className="text-sm font-semibold text-violet-400">
          {percentage}%
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden mb-2">
        <div
          className="h-full bg-gradient-to-r from-violet-500 to-blue-500 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Stats Row */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>
          {formatBytes(bytesUploaded)} / {formatBytes(totalBytes)}
        </span>
        <span>{formatSpeed(speed)}</span>
      </div>
    </div>
  );
}
