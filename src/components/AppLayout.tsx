import { ReactNode } from 'react';
import { Eye, History, Settings, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/ui/Logo';

type Tab = 'home' | 'history' | 'settings';

interface AppLayoutProps {
  children: ReactNode;
  currentTab: Tab;
  onTabChange: (tab: Tab) => void;
  onLogout: () => void;
}

interface NavButtonProps {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

function NavButton({ icon, label, active, onClick }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center gap-1 py-2 px-4 rounded-lg transition-all',
        active
          ? 'text-violet-400 bg-violet-500/10'
          : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
      )}
    >
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

export function AppLayout({ children, currentTab, onTabChange, onLogout }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm px-4 py-3">
        <div className="flex items-center justify-center">
          <Logo size="sm" />
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>

      {/* Bottom navigation */}
      <nav className="border-t border-gray-800 bg-gray-900/80 backdrop-blur-sm px-2 py-2">
        <div className="flex items-center justify-around max-w-md mx-auto">
          <NavButton
            icon={<Eye className="w-5 h-5" />}
            label="Status"
            active={currentTab === 'home'}
            onClick={() => onTabChange('home')}
          />
          <NavButton
            icon={<History className="w-5 h-5" />}
            label="History"
            active={currentTab === 'history'}
            onClick={() => onTabChange('history')}
          />
          <NavButton
            icon={<Settings className="w-5 h-5" />}
            label="Settings"
            active={currentTab === 'settings'}
            onClick={() => onTabChange('settings')}
          />
          <button
            onClick={onLogout}
            className="flex flex-col items-center justify-center gap-1 py-2 px-4 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-xs font-medium">Logout</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
