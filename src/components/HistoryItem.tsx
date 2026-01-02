import { CheckCircle2, XCircle, Clock, Loader2, ExternalLink } from 'lucide-react';
import type { UploadRecord } from '@/lib/types';
import * as api from '@/lib/api';

interface HistoryItemProps {
  record: UploadRecord;
}

export function HistoryItem({ record }: HistoryItemProps) {
  const getStatusIcon = () => {
    switch (record.status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-400" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'uploading':
      case 'processing':
        return <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />;
      default:
        return <Clock className="w-5 h-5 text-yellow-400" />;
    }
  };

  const getStatusColor = () => {
    switch (record.status) {
      case 'completed':
        return 'text-green-400';
      case 'failed':
        return 'text-red-400';
      case 'uploading':
      case 'processing':
        return 'text-violet-400';
      default:
        return 'text-yellow-400';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return 'Today, ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday, ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: 'long' }) + ', ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {getStatusIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-white truncate">{record.filename}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {formatDate(record.createdAt)}
              </p>
            </div>
            <span className={`text-xs font-medium ${getStatusColor()}`}>
              {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
            </span>
          </div>

          {record.status === 'completed' && record.replayUrl && (
            <button
              onClick={() => api.openUrl(record.replayUrl!)}
              className="mt-2 flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View on BallCam
            </button>
          )}

          {record.status === 'failed' && record.errorMessage && (
            <p className="mt-2 text-xs text-red-400/80">{record.errorMessage}</p>
          )}

          {record.attempts > 1 && (
            <p className="mt-1 text-xs text-gray-500">
              {record.attempts} attempts
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
