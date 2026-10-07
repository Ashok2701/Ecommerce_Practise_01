'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';

/** Notification abstraction. Later: subscribe to Web Push / SSE and invalidate this query. */
export function useNotifications() {
  const user = useUser();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notifications', user?.id], queryFn: () => notificationService.list(user.id), enabled: !!user, refetchInterval: 15000 });
  const markRead = useMutation({ mutationFn: notificationService.markRead, onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const markAll = useMutation({ mutationFn: () => notificationService.markAllRead(user.id), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const items = q.data ?? [];
  return { ...q, items, unread: items.filter((n) => !n.read).length, markRead: markRead.mutate, markAllRead: markAll.mutate };
}
