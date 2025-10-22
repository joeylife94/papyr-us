import React from 'react';
import { SessionUser } from '../../hooks/useCollaboration';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Users } from 'lucide-react';

interface CollaboratorPresenceProps {
  sessionUsers: SessionUser[];
  isConnected: boolean;
}

// Generate initials from name
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Generate consistent color for avatar
function getAvatarColor(userId: string): string {
  const colors = [
    'bg-red-500',
    'bg-blue-500',
    'bg-green-500',
    'bg-yellow-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-teal-500',
    'bg-orange-500',
  ];

  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length];
}

export function CollaboratorPresence({ sessionUsers, isConnected }: CollaboratorPresenceProps) {
  if (!isConnected || sessionUsers.length === 0) {
    return null;
  }

  const displayUsers = sessionUsers.slice(0, 5);
  const remainingCount = sessionUsers.length - 5;

  return (
    <div className="flex items-center gap-2 bg-muted/50 px-3 py-2 rounded-lg border">
      <Users className="w-4 h-4 text-muted-foreground" />
      <div className="flex -space-x-2">
        <TooltipProvider>
          {displayUsers.map((user) => (
            <Tooltip key={user.id}>
              <TooltipTrigger asChild>
                <Avatar className={`w-8 h-8 border-2 border-background ${getAvatarColor(user.id)}`}>
                  <AvatarFallback className="text-white text-xs font-semibold">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>
                <p>{user.name}</p>
                <p className="text-xs text-muted-foreground">현재 편집 중</p>
              </TooltipContent>
            </Tooltip>
          ))}
          {remainingCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Avatar className="w-8 h-8 border-2 border-background bg-muted">
                  <AvatarFallback className="text-xs font-semibold">
                    +{remainingCount}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>
                <p>외 {remainingCount}명</p>
              </TooltipContent>
            </Tooltip>
          )}
        </TooltipProvider>
      </div>
      <span className="text-sm text-muted-foreground">{sessionUsers.length}명 온라인</span>
    </div>
  );
}
