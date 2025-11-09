import { User } from '@/hooks/useYjsCollaboration';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CollaborativeCursorsProps {
  users: User[];
  containerRef: React.RefObject<HTMLElement>;
}

interface CursorPosition {
  user: User;
  x: number;
  y: number;
}

/**
 * CollaborativeCursors - Real-time cursor visualization for collaborative editing
 *
 * Features:
 * - Shows other users' cursor positions in real-time
 * - Color-coded per user
 * - Displays user name in tooltip
 * - Smooth animations with framer-motion
 */
export default function CollaborativeCursors({ users, containerRef }: CollaborativeCursorsProps) {
  const [visibleCursors, setVisibleCursors] = useState<CursorPosition[]>([]);

  useEffect(() => {
    // Filter users with cursor positions
    const cursors = users
      .filter((user) => user.cursor && user.cursor.x !== undefined && user.cursor.y !== undefined)
      .map((user) => ({
        user,
        x: user.cursor!.x,
        y: user.cursor!.y,
      }));

    setVisibleCursors(cursors);
  }, [users]);

  if (!containerRef.current) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-50">
      <AnimatePresence>
        {visibleCursors.map((cursor) => (
          <motion.div
            key={cursor.user.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'absolute',
              left: `${cursor.x}px`,
              top: `${cursor.y}px`,
              pointerEvents: 'none',
            }}
          >
            {/* Cursor pointer */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
              }}
            >
              <path
                d="M5.5 3.5L18.5 12L11 13.5L8.5 20.5L5.5 3.5Z"
                fill={cursor.user.color}
                stroke="white"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>

            {/* User name label */}
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="absolute left-6 top-0 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-white shadow-lg"
              style={{
                backgroundColor: cursor.user.color,
              }}
            >
              {cursor.user.name}
            </motion.div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/**
 * UserAvatarList - Compact list of active collaborators
 */
interface UserAvatarListProps {
  users: User[];
  maxVisible?: number;
}

export function UserAvatarList({ users, maxVisible = 5 }: UserAvatarListProps) {
  const visibleUsers = users.slice(0, maxVisible);
  const remainingCount = Math.max(0, users.length - maxVisible);

  return (
    <div className="flex items-center gap-1">
      {visibleUsers.map((user) => (
        <div
          key={user.id}
          className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white shadow-md ring-2 ring-white"
          style={{ backgroundColor: user.color }}
          title={user.name}
        >
          {user.name.charAt(0).toUpperCase()}
        </div>
      ))}
      {remainingCount > 0 && (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-400 text-xs font-semibold text-white shadow-md ring-2 ring-white">
          +{remainingCount}
        </div>
      )}
    </div>
  );
}
