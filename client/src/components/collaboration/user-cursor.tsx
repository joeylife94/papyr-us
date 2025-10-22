import React from 'react';
import { User } from '@/hooks/useYjsCollaboration';

interface UserCursorProps {
  user: User;
  containerRef?: React.RefObject<HTMLElement>;
}

export function UserCursor({ user, containerRef }: UserCursorProps) {
  if (!user.cursor) return null;

  const { x, y } = user.cursor;

  // Calculate position relative to container
  let relativeX = x;
  let relativeY = y;

  if (containerRef?.current) {
    const rect = containerRef.current.getBoundingClientRect();
    relativeX = x - rect.left;
    relativeY = y - rect.top;
  }

  return (
    <div
      className="user-cursor pointer-events-none fixed z-50 transition-all duration-100"
      style={{
        left: `${relativeX}px`,
        top: `${relativeY}px`,
        transform: 'translate(-2px, -2px)',
      }}
    >
      {/* Cursor arrow */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3))' }}
      >
        <path
          d="M5 3L19 12L12 13L9 19L5 3Z"
          fill={user.color}
          stroke="white"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>

      {/* User name label */}
      <div
        className="absolute left-6 top-0 whitespace-nowrap rounded px-2 py-1 text-xs font-medium text-white shadow-lg"
        style={{
          backgroundColor: user.color,
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
