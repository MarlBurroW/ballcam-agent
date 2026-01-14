import { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { open } from '@tauri-apps/plugin-shell';

interface ShareUrlProps {
  channelUrl: string;
}

const BALLCAM_BASE_URL = 'https://ballcam.tv';

export function ShareUrl({ channelUrl }: ShareUrlProps) {
  const [copied, setCopied] = useState(false);

  // Handle both full URLs and relative paths
  const fullUrl = channelUrl.startsWith('http')
    ? channelUrl
    : `${BALLCAM_BASE_URL}${channelUrl}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  const handleOpen = async () => {
    try {
      await open(fullUrl);
    } catch (err) {
      console.error('Failed to open URL:', err);
    }
  };

  return (
    <div className="mt-3 p-3 bg-violet-500/10 border border-violet-500/20 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-400">Channel URL (permanent)</p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-all ${
              copied
                ? 'bg-violet-500/20 text-violet-400'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
            title="Copy URL"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                Copy
              </>
            )}
          </button>
          <button
            onClick={handleOpen}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 transition-all"
            title="Open in browser"
          >
            <ExternalLink className="w-3 h-3" />
            Open
          </button>
        </div>
      </div>
      <p className="text-sm text-violet-400 font-mono break-all select-all">{fullUrl}</p>
    </div>
  );
}
