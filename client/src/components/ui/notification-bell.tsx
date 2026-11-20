import React, { useEffect, useState } from 'react';
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
import { useFeatureFlags } from '@/features/FeatureFlagsContext';

// A notification is addressed to an account and belongs to one organization (WP0a).
interface Notification {
  id: number;
  type: string; // comment, mention, task_due, task_assigned, system; unknown values are tolerated
  title: string;
  content: string;
  recipientUserId: number;
  organizationId: number;
  senderUserId: number | null;
  relatedPageId: number | null;
  relatedTaskId: number | null;
  relatedCommentId: number | null;
  isRead: boolean;
  createdAt: string;
}

// What GET /api/notifications answers.
interface NotificationList {
  notifications: Notification[];
  pagination: { hasMore: boolean; nextCursor: string | null; count: number; total: number };
}

const notificationIcons: Record<string, typeof Bell> = {
  comment: MessageSquare,
  mention: AtSign,
  task_due: Calendar,
  task_assigned: AlertTriangle,
};

const notificationColors: Record<string, string> = {
  comment: 'text-info',
  mention: 'text-highlight',
  task_due: 'text-warning',
  task_assigned: 'text-success',
};

// A type this client does not know (for example `system`) renders with a neutral icon.
const iconFor = (type: string) => notificationIcons[type] ?? Bell;
const colorFor = (type: string) => notificationColors[type] ?? 'text-muted-foreground';

import { useSocket } from '@/lib/socket';
import { useAuth } from '@/hooks/useAuth';

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();
  const { flags } = useFeatureFlags();
  const { user } = useAuth();
  const enabled = flags.FEATURE_NOTIFICATIONS;
  // The signed-in account: the server decides what it may see, the id only keys the cache.
  const userId: number | undefined = user?.id;
  const { onNotificationNew, onNotificationUnreadCount, off } = useSocket({
    enabled: enabled && !!userId,
  });

  // Wire socket listeners (the account's own room is joined when the socket connects)
  useEffect(() => {
    if (!enabled || !userId) return;

    const handleNew = (notif: Notification | undefined) => {
      if (!notif || notif.recipientUserId !== userId) return;
      // Optimistically update notifications list
      queryClient.setQueryData<Notification[] | undefined>(['notifications', userId], (old) =>
        old ? [notif, ...old.filter((n) => n.id !== notif.id)] : [notif]
      );
    };

    const handleCount = (data: { recipientUserId: number; count: number }) => {
      if (!data || data.recipientUserId !== userId) return;
      queryClient.setQueryData<{ count: number }>(['notifications', 'unread-count', userId], {
        count: data.count,
      });
    };

    onNotificationNew(handleNew);
    onNotificationUnreadCount(handleCount);

    return () => {
      off('notification:new', handleNew as any);
      off('notification:unread-count', handleCount as any);
    };
  }, [enabled, userId, onNotificationNew, onNotificationUnreadCount, off, queryClient]);

  // Fetch notifications
  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ['notifications', userId],
    enabled: enabled && !!userId,
    queryFn: async () => {
      const response = await fetch('/api/notifications');
      if (!response.ok) {
        throw new Error('Failed to fetch notifications');
      }
      const body = (await response.json()) as NotificationList;
      return Array.isArray(body?.notifications) ? body.notifications : [];
    },
  });

  // Fetch unread count
  const { data: unreadCount = { count: 0 } } = useQuery<{ count: number }>({
    queryKey: ['notifications', 'unread-count', userId],
    enabled: enabled && !!userId,
    queryFn: async () => {
      const response = await fetch('/api/notifications/unread-count');
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
      if (userId) {
        queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
        queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count', userId] });
      }
    },
  });

  // Mark all notifications as read
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/notifications/read-all', {
        method: 'PATCH',
      });
      if (!response.ok) {
        throw new Error('Failed to mark all notifications as read');
      }
      return response.json();
    },
    onSuccess: () => {
      if (userId) {
        queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
        queryClient.invalidateQueries({
          queryKey: ['notifications', 'unread-count', userId],
        });
      }
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
      if (userId) {
        queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
        queryClient.invalidateQueries({
          queryKey: ['notifications', 'unread-count', userId],
        });
      }
    },
  });

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }

    try {
      if (notification.relatedPageId) {
        // Fetch page to resolve slug for navigation
        const res = await fetch(`/api/pages/${notification.relatedPageId}`);
        if (res.ok) {
          const page = await res.json();
          if (page?.slug) {
            window.location.href = `/page/${page.slug}`;
            return;
          }
        }
        // Fallback: go to page by id
        window.location.href = `/page/${notification.relatedPageId}`;
      } else if (notification.relatedTaskId) {
        window.location.href = `/tasks`;
      }
    } catch (_) {
      // Silent fallback
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

  if (!enabled) return null;

  const unreadNotifications = notifications.filter((n) => !n.isRead);
  const readNotifications = notifications.filter((n) => n.isRead);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative"
          aria-label="알림"
          data-testid="notification-bell"
        >
          <Bell className="h-5 w-5" />
          {userId && unreadCount.count > 0 && (
            <Badge
              data-testid="notification-unread-badge"
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
          {userId && unreadCount.count > 0 && (
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
                    const Icon = iconFor(notification.type);
                    const iconColor = colorFor(notification.type);

                    return (
                      <DropdownMenuItem
                        data-testid="notification-item"
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
                const Icon = iconFor(notification.type);
                const iconColor = colorFor(notification.type);

                return (
                  <DropdownMenuItem
                    data-testid="notification-item"
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
