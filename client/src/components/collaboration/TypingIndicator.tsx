import React from 'react';
import { TypingUser } from '../../hooks/useCollaboration';

interface TypingIndicatorProps {
  typingUsers: TypingUser[];
}

export function TypingIndicator({ typingUsers }: TypingIndicatorProps) {
  if (typingUsers.length === 0) return null;

  const names = typingUsers.map((u) => u.userName);
  let message = '';

  if (names.length === 1) {
    message = `${names[0]}이(가) 입력 중`;
  } else if (names.length === 2) {
    message = `${names[0]}과(와) ${names[1]}이(가) 입력 중`;
  } else {
    message = `${names[0]} 외 ${names.length - 1}명이 입력 중`;
  }

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
      <div className="flex gap-1">
        <span
          className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
          style={{ animationDelay: '300ms' }}
        />
      </div>
      <span>{message}...</span>
    </div>
  );
}
