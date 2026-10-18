import { source, http } from '@/lib/api/httpClient';
import { getDb, commit, uid } from '@/lib/data/mockDb';
import { pushNotification } from './notificationService';
import type { Announcement, Offer, Role } from '@/types/domain';

export const announcementService = {
  /** manage=true returns everything (admin/manager); otherwise only published items targeted to the role. */
  list: (role: Role, manage = false) =>
    source<Announcement[]>(() => getDb().announcements
      .filter((a) => manage || (a.status === 'published' && (a.audience.includes('all') || a.audience.includes(role))))
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.publishAt.localeCompare(a.publishAt)), () => http.get('/announcements', { manage })),
  save: (a: Partial<Announcement> & { title: string }, by: string) =>
    source<Announcement>(() => {
      const db = getDb();
      let item = a.id ? db.announcements.find((x) => x.id === a.id) : undefined;
      if (item) Object.assign(item, a);
      else { item = { id: uid('ann'), body: '', category: 'company', audience: ['all'], status: 'draft', publishAt: new Date().toISOString(), createdBy: by, ...a } as Announcement; db.announcements.unshift(item); }
      if (item.status === 'published') notifyAnnouncement(item);
      commit(); return item;
    }, () => (a.id ? http.patch(`/announcements/${a.id}`, a) : http.post('/announcements', a))),
  setStatus: (id: string, status: Announcement['status']) =>
    source(() => { const a = getDb().announcements.find((x) => x.id === id)!; a.status = status; if (status === 'published') { a.publishAt = new Date().toISOString(); notifyAnnouncement(a); } commit(); return a; }, () => http.patch(`/announcements/${id}`, { status })),
  remove: (id: string) => source(() => { const db = getDb(); db.announcements = db.announcements.filter((a) => a.id !== id); commit(); return true; }, () => http.del(`/announcements/${id}`)),
};

function notifyAnnouncement(a: Announcement) {
  const roles: Role[] = a.audience.includes('all') ? ['CUSTOMER_B2B', 'CUSTOMER_B2C', 'SALES_REP', 'SUPERVISOR', 'SUPPLIER'] : (a.audience as Role[]);
  pushNotification({ roles }, 'announcement', a.title, a.body.slice(0, 90), '/announcements');
}

export const offerService = {
  list: (opts: { manage?: boolean; tier?: 'A' | 'B' | 'C' } = {}) =>
    source<Offer[]>(() => getDb().offers.filter((o) => opts.manage || (o.status === 'active' && (o.audience === 'all' || o.audience === `tier_${opts.tier}`))), () => http.get('/offers', opts)),
  activeOffers: () => getDb().offers.filter((o) => o.status === 'active'),
  save: (o: Partial<Offer> & { title: string }) =>
    source<Offer>(() => {
      const db = getDb();
      let item = o.id ? db.offers.find((x) => x.id === o.id) : undefined;
      if (item) Object.assign(item, o);
      else {
        item = { id: uid('off'), code: o.title.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 12), description: '', productIds: [], discountPct: 5, validFrom: new Date().toISOString(), validTo: new Date(Date.now() + 14 * 86400000).toISOString(), status: 'draft', audience: 'all', ...o } as Offer;
        db.offers.unshift(item);
      }
      if (item.status === 'active') pushNotification({ roles: ['CUSTOMER_B2B', 'CUSTOMER_B2C', 'SALES_REP'] }, 'offer', `New offer: ${item.title}`, item.description.slice(0, 90), '/offers');
      commit(); return item;
    }, () => (o.id ? http.patch(`/offers/${o.id}`, o) : http.post('/offers', o))),
  setStatus: (id: string, status: Offer['status']) =>
    source(() => { const o = getDb().offers.find((x) => x.id === id)!; o.status = status; commit(); return o; }, () => http.patch(`/offers/${id}`, { status })),
};
