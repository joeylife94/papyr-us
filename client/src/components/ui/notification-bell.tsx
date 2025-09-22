import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, Trash2, MessageSquare, AtSign, Calendar, AlertTriangle } from 'lucide-react';
import { Button } from './button';
import { Badge } from './badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { ScrollArea } from './scroll-area';

interface Notification {
  id: number;
  type: 'comment' | 'mention' | 'task_due' | 'task_assigned';
  title: string;
  content: string;
  recipientId: number;
  senderId: number | null;
  relatedPageId: number | null;
  relatedTaskId: number | null;
  relatedCommentId: number | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationBellProps {
  userId: number;
}

const notificationIcons = {
  comment: MessageSquare,
  mention: AtSign,
  task_due: Calendar,
  task_assigned: AlertTriangle,
};

const notificationColors = {
  comment: 'text-blue-500',
  mention: 'text-purple-500',
  task_due: 'text-orange-500',
  task_assigned: 'text-green-500',
};

export function NotificationBell({ userId }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();

  // Fetch notifications
  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      const response = await fetch(`/api/notifications?recipientId=${userId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch notifications');
      }
      return response.json();
    },
  });

  // Fetch unread count
  const { data: unreadCount = { count: 0 } } = useQuery<{ count: number }>({
    queryKey: ['notifications', 'unread-count', userId],
    queryFn: async () => {
      const response = await fetch(`/api/notifications/unread-count?recipientId=${userId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch unread count');
      }
      return response.json();
    },
  });

  // Mark notification as read
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: number) => {
      const response = await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'PATCH',
      });
      if (!response.ok) {
        throw new Error('Failed to mark notification as read');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count', userId] });
    },
  });

  // Mark all notifications as read
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/notifications/read-all', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: userId }),
      });
      if (!response.ok) {
        throw new Error('Failed to mark all notifications as read');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count', userId] });
    },
  });

  // Delete notification
  const deleteNotificationMutation = useMutation({
    mutationFn: async (notificationId: number) => {
      const response = await fetch(`/api/notifications/${notificationId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete notification');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count', userId] });
    },
  });

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }

    // Navigate to related content
    if (notification.relatedPageId) {
      // Navigate to page
      window.location.href = `/page/${notification.relatedPageId}`;
    } else if (notification.relatedTaskId) {
      // Navigate to task
      window.location.href = `/tasks`;
    }
  };

  const handleMarkAllAsRead = () => {
    markAllAsReadMutation.mutate();
  };

  const handleDeleteNotification = (e: React.MouseEvent, notificationId: number) => {
    e.stopPropagation();
    deleteNotificationMutation.mutate(notificationId);
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return '방금 전';
    if (diffInMinutes < 60) return `${diffInMinutes}분 전`;

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}시간 전`;

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}일 전`;

    return date.toLocaleDateString('ko-KR');
  };

  const unreadNotifications = notifications.filter((n) => !n.isRead);
  const readNotifications = notifications.filter((n) => n.isRead);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount.count > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center"
            >
              {unreadCount.count > 99 ? '99+' : unreadCount.count}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">알림</h3>
          {unreadCount.count > 0 && (
            <Button variant="ghost" size="sm" onClick={handleMarkAllAsRead} className="text-xs">
              모두 읽음 처리
            </Button>
          )}
        </div>

        <ScrollArea className="h-96">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">알림이 없습니다</div>
          ) : (
            <div className="p-2">
              {/* Unread notifications */}
              {unreadNotifications.length > 0 && (
                <>
                  {unreadNotifications.map((notification) => {
                    const Icon = notificationIcons[notification.type];
                    const iconColor = notificationColors[notification.type];

                    return (
                      <DropdownMenuItem
                        key={notification.id}
                        className="flex items-start gap-3 p-3 cursor-pointer hover:bg-accent"
                        onClick={() => handleNotificationClick(notification)}
                      >
                        <div className="flex-shrink-0">
                          <Icon className={`h-4 w-4 ${iconColor}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <p className="text-sm font-medium line-clamp-1">{notification.title}</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                              onClick={(e) => handleDeleteNotification(e, notification.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                            {notification.content}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatTimeAgo(notification.createdAt)}
                          </p>
                        </div>
                        <div className="flex-shrink-0">
                          <div className="w-2 h-2 bg-primary rounded-full"></div>
                        </div>
                      </DropdownMenuItem>
                    );
                  })}

                  {readNotifications.length > 0 && <DropdownMenuSeparator />}
                </>
              )}

              {/* Read notifications */}
              {readNotifications.map((notification) => {
                const Icon = notificationIcons[notification.type];
                const iconColor = notificationColors[notification.type];

                return (
                  <DropdownMenuItem
                    key={notification.id}
                    className="flex items-start gap-3 p-3 cursor-pointer hover:bg-accent opacity-75"
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex-shrink-0">
                      <Icon className={`h-4 w-4 ${iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <p className="text-sm font-medium line-clamp-1">{notification.title}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                          onClick={(e) => handleDeleteNotification(e, notification.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {notification.content}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatTimeAgo(notification.createdAt)}
                      </p>
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
