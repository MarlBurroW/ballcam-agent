import { useState, useEffect } from 'react';
import { Loader2, FolderOpen, ChevronDown } from 'lucide-react';
import { HistoryItem } from '@/components/HistoryItem';
import type { UploadRecord } from '@/lib/types';
import * as api from '@/lib/api';

const PAGE_SIZE = 50;

export function HistoryList() {
  const [allRecords, setAllRecords] = useState<UploadRecord[]>([]);
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const history = await api.getHistory();
      // Sort by most recent first
      const sorted = history.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setAllRecords(sorted);
    } catch (err) {
      setError('Failed to load history');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = () => {
    setDisplayCount(prev => prev + PAGE_SIZE);
  };

  const records = allRecords.slice(0, displayCount);
  const hasMore = displayCount < allRecords.length;

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
      {/* Record count */}
      <div className="text-xs text-gray-500 text-center">
        Showing {records.length} of {allRecords.length} replays
      </div>

      {records.map((record) => (
        <HistoryItem key={record.id} record={record} />
      ))}

      {/* Load more button */}
      {hasMore && (
        <button
          onClick={loadMore}
          className="w-full py-3 flex items-center justify-center gap-2 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-xl text-sm text-gray-400 hover:text-gray-300 transition-colors"
        >
          <ChevronDown className="w-4 h-4" />
          Load more ({allRecords.length - displayCount} remaining)
        </button>
      )}
    </div>
  );
}
