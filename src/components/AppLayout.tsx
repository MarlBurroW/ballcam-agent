import { ReactNode, useState, useEffect } from 'react';
import { FolderSearch, History, Settings, LogOut, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/ui/Logo';
import { ServiceStatusBar } from '@/components/ServiceStatusBar';
import type { User, BroadcastState } from '@/lib/types';
import * as api from '@/lib/api';

type Tab = 'home' | 'live' | 'history' | 'settings';

function getInitials(username: string): string {
  return username
    .split(/[\s_-]/)
    .map(part => part.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
}

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
      {children}
    </div>
  );
}

interface AppLayoutProps {
  children: ReactNode;
  currentTab: Tab;
  onTabChange: (tab: Tab) => void;
  onLogout: () => void;
  user: User | null;
}

interface NavItemProps {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  variant?: 'default' | 'danger';
}

function NavItem({ icon, label, active, onClick, variant = 'default' }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left',
        active
          ? 'text-violet-400 bg-violet-500/10'
          : variant === 'danger'
            ? 'text-gray-500 hover:text-red-400 hover:bg-red-500/10'
            : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
      )}
    >
      {icon}
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

export function AppLayout({ children, currentTab, onTabChange, onLogout, user }: AppLayoutProps) {
  const [broadcastState, setBroadcastState] = useState<BroadcastState>({ type: 'notBroadcasting' });

  useEffect(() => {
    // Load initial broadcast state
    api.getBroadcastState().then(setBroadcastState).catch(console.error);

    // Listen for broadcast state changes
    const unlisten = api.onBroadcastStateChanged(setBroadcastState);

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const isBroadcasting = broadcastState.type === 'broadcasting';

  return (
    <div className="h-screen bg-gray-950 flex flex-col overflow-hidden">
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-52 flex-shrink-0 border-r border-gray-800 bg-gray-900/50 flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-gray-800">
          <Logo size="sm" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          {/* Live Section - Featured (at top) */}
          <div className="pb-1">
            <div className={cn(
              "px-3 py-2 mb-1 rounded-lg border transition-all",
              isBroadcasting
                ? "bg-gradient-to-r from-red-500/20 to-orange-500/10 border-red-500/30"
                : "bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border-violet-500/20"
            )}>
              <div className="flex items-center gap-2 mb-2">
                {isBroadcasting && (
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                )}
                <span className={cn(
                  "text-xs font-semibold uppercase tracking-wider",
                  isBroadcasting ? "text-red-400" : "text-violet-400"
                )}>
                  {isBroadcasting ? "On Air" : "Live"}
                </span>
              </div>
              <button
                onClick={() => onTabChange('live')}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left',
                  currentTab === 'live'
                    ? isBroadcasting
                      ? 'text-white bg-red-500/30 shadow-lg shadow-red-500/20'
                      : 'text-white bg-violet-500/30 shadow-lg shadow-violet-500/20'
                    : 'text-gray-300 hover:text-white hover:bg-violet-500/20'
                )}
              >
                <Radio className={cn("w-5 h-5", isBroadcasting && "text-red-400")} />
                <span className="text-sm font-semibold">Broadcast</span>
              </button>
            </div>
          </div>

          {/* Replays Section */}
          <div className="pt-2">
            <SectionHeader>Replays</SectionHeader>
          </div>
          <NavItem
            icon={<FolderSearch className="w-5 h-5" />}
            label="Watcher"
            active={currentTab === 'home'}
            onClick={() => onTabChange('home')}
          />
          <NavItem
            icon={<History className="w-5 h-5" />}
            label="History"
            active={currentTab === 'history'}
            onClick={() => onTabChange('history')}
          />

          {/* Settings at bottom of nav area */}
          <div className="pt-3">
            <NavItem
              icon={<Settings className="w-5 h-5" />}
              label="Settings"
              active={currentTab === 'settings'}
              onClick={() => onTabChange('settings')}
            />
          </div>
        </nav>

        {/* User & Logout */}
        <div className="p-3 border-t border-gray-800 space-y-2">
          {user && (
            <div className="flex items-center gap-2 px-2 py-1.5">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.username}
                  className="w-7 h-7 rounded-full object-cover border border-violet-500/30"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500/30 to-blue-500/30 border border-violet-500/30 flex items-center justify-center">
                  <span className="text-xs font-semibold text-violet-300">
                    {getInitials(user.username)}
                  </span>
                </div>
              )}
              <span className="text-sm text-gray-300 truncate flex-1">{user.username}</span>
            </div>
          )}
          <NavItem
            icon={<LogOut className="w-5 h-5" />}
            label="Logout"
            active={false}
            onClick={onLogout}
            variant="danger"
          />
        </div>
      </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Status bar - full width at bottom */}
      <ServiceStatusBar />
    </div>
  );
}
