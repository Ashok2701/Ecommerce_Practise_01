import { source, http } from '@/lib/api/httpClient';
import { getDb, commit, uid } from '@/lib/data/mockDb';
import { pushNotification } from './notificationService';
import { isCustomerRole } from '@/types/domain';
import type { Conversation, User } from '@/types/domain';

function visible(c: Conversation, u: User) {
  if (u.role === 'ADMIN' || u.role === 'SUPERVISOR') return true;
  if (isCustomerRole(u.role)) return c.customerId === u.customerId;
  return c.participantIds.includes(u.id);
}

export const messageService = {
  listConversations: (user: User) =>
    source<Conversation[]>(() => getDb().conversations.filter((c) => visible(c, user)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), () => http.get('/conversations')),
  unreadCount: (user: User) => getDb().conversations.filter((c) => visible(c, user) && c.unreadBy.includes(user.id)).length,
  markRead: (id: string, userId: string) =>
    source(() => { const c = getDb().conversations.find((x) => x.id === id); if (c) c.unreadBy = c.unreadBy.filter((u) => u !== userId); commit(); return true; }, () => http.post(`/conversations/${id}/read`)),
  send: (id: string, user: User, body: string) =>
    source<Conversation>(() => {
      const c = getDb().conversations.find((x) => x.id === id)!;
      const now = new Date().toISOString();
      c.messages.push({ id: uid('msg'), senderId: user.id, senderName: user.name, senderRole: user.role, body, at: now });
      c.updatedAt = now;
      if (!c.participantIds.includes(user.id)) c.participantIds.push(user.id);
      const others = c.participantIds.filter((p) => p !== user.id);
      c.unreadBy = Array.from(new Set([...c.unreadBy.filter((u) => u !== user.id), ...others]));
      pushNotification({ userIds: others }, 'message', `New message from ${user.name}`, body.slice(0, 80), '/messages');
      commit(); return c;
    }, () => http.post(`/conversations/${id}/messages`, { body })),
  /** Customers open support tickets; their rep + managers are added automatically. */
  create: (user: User, subject: string, body: string) =>
    source<Conversation>(() => {
      const db = getDb();
      const cust = user.customerId ? db.customers.find((c) => c.id === user.customerId) : undefined;
      const participants = [user.id, ...(cust ? [cust.salesRepId] : []), ...db.users.filter((u) => u.role === 'SUPERVISOR' || u.role === 'ADMIN').map((u) => u.id)];
      const now = new Date().toISOString();
      const c: Conversation = { id: uid('conv'), subject, customerId: cust?.id, participantIds: Array.from(new Set(participants)), participantNames: [user.name, 'Support'], updatedAt: now,
        unreadBy: participants.filter((p) => p !== user.id), messages: [{ id: uid('msg'), senderId: user.id, senderName: user.name, senderRole: user.role, body, at: now }] };
      db.conversations.unshift(c);
      pushNotification({ userIds: c.unreadBy }, 'message', `New conversation: ${subject}`, body.slice(0, 80), '/messages');
      commit(); return c;
    }, () => http.post('/conversations', { subject, body })),
  /** Mock: simulate a support agent reply so the customer chat feels alive. */
  simulateReply: (id: string) => {
    const db = getDb();
    const c = db.conversations.find((x) => x.id === id);
    if (!c) return;
    const rep = db.users.find((u) => c.participantIds.includes(u.id) && u.role === 'SALES_REP') ?? db.users.find((u) => u.role === 'SUPERVISOR')!;
    const now = new Date().toISOString();
    c.messages.push({ id: uid('msg'), senderId: rep.id, senderName: rep.name, senderRole: rep.role, body: 'Thanks for reaching out – I have noted this and will update you shortly.', at: now });
    c.updatedAt = now; commit();
  },
};
