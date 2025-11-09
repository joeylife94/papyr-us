import React, { useState, useEffect } from 'react';
import { User } from '@/hooks/useYjsCollaboration';

interface UserCursorProps {
  user: User;
  containerRef?: React.RefObject<HTMLElement>;
}

export function UserCursor({ user, containerRef }: UserCursorProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!user.cursor) {
      setIsVisible(false);
      return;
    }

    const { x, y } = user.cursor;

    // Calculate position relative to container
    let relativeX = x;
    let relativeY = y;

    if (containerRef?.current) {
      const rect = containerRef.current.getBoundingClientRect();
      relativeX = x - rect.left;
      relativeY = y - rect.top;

      // Hide cursor if outside visible area
      if (relativeX < 0 || relativeY < 0 || relativeX > rect.width || relativeY > rect.height) {
        setIsVisible(false);
        return;
      }
    }

    setPosition({ x: relativeX, y: relativeY });
    setIsVisible(true);
  }, [user.cursor, containerRef]);

  if (!isVisible) return null;

  return (
    <div
      className="user-cursor pointer-events-none fixed z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-2px, -2px)',
        transition: 'left 0.15s ease-out, top 0.15s ease-out',
      }}
    >
      {/* Cursor arrow with pulse effect */}
      <div className="relative">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))' }}
        >
          <path
            d="M5 3L19 12L12 13L9 19L5 3Z"
            fill={user.color}
            stroke="white"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>

        {/* Pulse ring effect */}
        <div
          className="absolute left-0 top-0 h-6 w-6 animate-ping rounded-full opacity-20"
          style={{ backgroundColor: user.color }}
        />
      </div>

      {/* User name label with fade-in animation */}
      <div
        className="absolute left-6 top-0 animate-in fade-in slide-in-from-left-2 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-white shadow-lg duration-200"
        style={{
          backgroundColor: user.color,
          animationDelay: '100ms',
        }}
      >
        {user.name}
      </div>
    </div>
  );
}

interface UserCursorsProps {
  users: User[];
  containerRef?: React.RefObject<HTMLElement>;
}

export function UserCursors({ users, containerRef }: UserCursorsProps) {
  return (
    <>
      {users.map((user) => (
        <UserCursor key={user.id} user={user} containerRef={containerRef} />
      ))}
    </>
  );
}

/**
 * UserAvatarList - Compact list of active collaborators
 * Shows user avatars with color coding
 */
interface UserAvatarListProps {
  users: User[];
  maxVisible?: number;
  className?: string;
}

export function UserAvatarList({ users, maxVisible = 5, className = '' }: UserAvatarListProps) {
  const visibleUsers = users.slice(0, maxVisible);
  const remainingCount = Math.max(0, users.length - maxVisible);

  if (users.length === 0) return null;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {visibleUsers.map((user) => (
        <div
          key={user.id}
          className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white shadow-md ring-2 ring-white transition-transform hover:scale-110"
          style={{ backgroundColor: user.color }}
          title={user.name}
        >
          {user.name.charAt(0).toUpperCase()}
        </div>
      ))}
      {remainingCount > 0 && (
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-400 text-xs font-semibold text-white shadow-md ring-2 ring-white"
          title={`${remainingCount} more user${remainingCount > 1 ? 's' : ''}`}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  );
}

/**
 * CollaborationStatus - Shows connection status and active users
 */
interface CollaborationStatusProps {
  isConnected: boolean;
  userCount: number;
  users: User[];
}

export function CollaborationStatus({ isConnected, userCount, users }: CollaborationStatusProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white px-4 py-2 shadow-md dark:bg-gray-800">
      {/* Connection indicator */}
      <div className="flex items-center gap-2">
        <div
          className={`h-2 w-2 rounded-full ${
            isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
          }`}
        />
        <span className="text-sm text-gray-600 dark:text-gray-300">
          {isConnected ? '실시간 협업 중' : '오프라인'}
        </span>
      </div>

      {/* User count */}
      {userCount > 0 && (
        <>
          <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />
          <span className="text-sm text-gray-600 dark:text-gray-300">{userCount + 1}명 접속</span>
        </>
      )}

      {/* User avatars */}
      {users.length > 0 && (
        <>
          <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />
          <UserAvatarList users={users} maxVisible={3} />
        </>
      )}
    </div>
  );
}
