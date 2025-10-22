import React from 'react';
import { CollaboratorCursor } from '../../hooks/useCollaboration';

interface CollaboratorCursorsProps {
  cursors: CollaboratorCursor[];
}

export function CollaboratorCursors({ cursors }: CollaboratorCursorsProps) {
  return (
    <>
      {cursors.map((cursor) => (
        <div
          key={cursor.userId}
          className="pointer-events-none fixed z-50 transition-all duration-100"
          style={{
            left: `${cursor.position.x}px`,
            top: `${cursor.position.y}px`,
          }}
        >
          {/* Cursor pointer */}
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="drop-shadow-lg"
          >
            <path
              d="M5.65376 12.3673L13.0564 19.7699L15.2283 14.0607L20.9375 11.8888L13.5348 4.48618L5.65376 12.3673Z"
              fill={cursor.color}
              stroke="white"
              strokeWidth="1.5"
            />
          </svg>

          {/* User name label */}
          <div
            className="ml-5 -mt-1 px-2 py-1 rounded text-xs font-medium text-white whitespace-nowrap drop-shadow-lg"
            style={{
              backgroundColor: cursor.color,
            }}
          >
            {cursor.userName}
          </div>
        </div>
      ))}
    </>
  );
}
