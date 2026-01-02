import { useState, useEffect } from 'react';
import { Loader2, FolderOpen } from 'lucide-react';
import { HistoryItem } from '@/components/HistoryItem';
import type { UploadRecord } from '@/lib/types';
import * as api from '@/lib/api';

export function HistoryList() {
  const [records, setRecords] = useState<UploadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const history = await api.getHistory();
      setRecords(history);
    } catch (err) {
      setError('Failed to load history');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-400">
        {error}
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="w-16 h-16 bg-gray-800/50 rounded-full flex items-center justify-center mb-4">
          <FolderOpen className="w-8 h-8 text-gray-600" />
        </div>
        <p className="text-gray-400 font-medium">No uploads yet</p>
        <p className="text-sm text-gray-500 mt-1">
          Replays will appear here after they are uploaded
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {records.map((record) => (
        <HistoryItem key={record.id} record={record} />
      ))}
    </div>
  );
}
