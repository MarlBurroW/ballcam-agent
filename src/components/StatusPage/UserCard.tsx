import type { User } from '@/lib/types';

interface UserCardProps {
  user: User | null;
}

/**
 * Get initials from username for avatar fallback
 */
function getInitials(username: string): string {
  return username
    .split(/[\s_-]/)
    .map(part => part.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
}

export function UserCard({ user }: UserCardProps) {
  if (!user) {
    return null;
  }

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4">
      <div className="flex items-center gap-3">
        {/* Avatar */}
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.username}
            className="w-10 h-10 rounded-full object-cover border-2 border-violet-500/30"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500/30 to-blue-500/30 border-2 border-violet-500/30 flex items-center justify-center">
            <span className="text-sm font-semibold text-violet-300">
              {getInitials(user.username)}
            </span>
          </div>
        )}

        {/* User Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">
            {user.username}
          </p>
          <p className="text-xs text-gray-400">
            Logged in
          </p>
        </div>
      </div>
    </div>
  );
}
