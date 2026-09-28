import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, getData, getPage } from '@/lib/api';
import type { NotificationItem, Paginated } from '@/types/api';

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (page: number, unreadOnly: boolean) => ['notifications', 'list', page, unreadOnly] as const,
  unread: ['notifications', 'unread'] as const,
};

export const useUnreadCount = () =>
  useQuery({
    queryKey: notificationKeys.unread,
    queryFn: () => getData<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 60_000,
    select: (data) => data.count,
  });

export const useNotifications = (page: number, unreadOnly = false, pageSize = 20) =>
  useQuery({
    queryKey: [...notificationKeys.list(page, unreadOnly), pageSize],
    queryFn: () =>
      getPage<Paginated<NotificationItem, { unread: number }>>('/notifications', { params: { page, pageSize, unreadOnly } }),
  });

export const useMarkRead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
};

export const useMarkAllRead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
};
