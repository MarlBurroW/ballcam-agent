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

export function AppLayout({ children, currentTab, onTabChange, onLogout }: AppLayoutProps) {
  return (
    <div className="h-screen bg-gray-950 flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 flex-shrink-0 border-r border-gray-800 bg-gray-900/50 flex flex-col h-full">
        {/* Logo */}
        <div className="p-4 border-b border-gray-800">
          <Logo size="sm" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          <NavItem
            icon={<Eye className="w-5 h-5" />}
            label="Status"
            active={currentTab === 'home'}
            onClick={() => onTabChange('home')}
          />
          <NavItem
            icon={<History className="w-5 h-5" />}
            label="History"
            active={currentTab === 'history'}
            onClick={() => onTabChange('history')}
          />
          <NavItem
            icon={<Settings className="w-5 h-5" />}
            label="Settings"
            active={currentTab === 'settings'}
            onClick={() => onTabChange('settings')}
          />
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-gray-800">
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
  );
}
