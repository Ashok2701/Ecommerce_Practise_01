import { source, http } from '@/lib/api/httpClient';
import { getDb, commit, uid } from '@/lib/data/mockDb';
import type { AppNotification, NotificationType, Role } from '@/types/domain';

/** Internal helper used by other mock services to emit notifications. */
export function pushNotification(target: { userIds?: string[]; roles?: Role[] }, type: NotificationType, title: string, body: string, href?: string) {
  const db = getDb();
  const ids = new Set(target.userIds ?? []);
  (target.roles ?? []).forEach((r) => db.users.filter((u) => u.role === r && u.status === 'active').forEach((u) => ids.add(u.id)));
  ids.forEach((userId) => db.notifications.unshift({ id: uid('ntf'), userId, type, title, body, href, at: new Date().toISOString(), read: false }));
}

export const notificationService = {
  list: (userId: string) =>
    source<AppNotification[]>(() => getDb().notifications.filter((n) => n.userId === userId).sort((a, b) => b.at.localeCompare(a.at)), () => http.get('/notifications')),
  markRead: (id: string) =>
    source(() => { const n = getDb().notifications.find((x) => x.id === id); if (n) n.read = true; commit(); return true; }, () => http.patch(`/notifications/${id}`, { read: true })),
  markAllRead: (userId: string) =>
    source(() => { getDb().notifications.forEach((n) => { if (n.userId === userId) n.read = true; }); commit(); return true; }, () => http.post('/notifications/read-all')),
};
