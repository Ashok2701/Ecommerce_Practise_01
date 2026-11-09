import { source, http } from '@/lib/api/httpClient';
import { getDb, commit, uid } from '@/lib/data/mockDb';
import { pushNotification } from './notificationService';
import { getCurrentSite } from '@/lib/sites/current';
import { offerAppliesTo, offerStatus } from '@/lib/domain/pricing';
import type { ActorRef, Announcement, Offer, OfferPresentation, Role } from '@/types/domain';

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
  get: (id: string) => source<Announcement>(() => { const a = getDb().announcements.find((x) => x.id === id); if (!a) throw new Error('errors.notFound'); return a; }, () => http.get(`/announcements/${id}`)),
  remove: (id: string) => source(() => { const db = getDb(); db.announcements = db.announcements.filter((a) => a.id !== id); commit(); return true; }, () => http.del(`/announcements/${id}`)),
};

function notifyAnnouncement(a: Announcement) {
  const roles: Role[] = a.audience.includes('all') ? ['CUSTOMER_B2B', 'CUSTOMER_B2C', 'SALES_REP', 'SUPERVISOR', 'SUPPLIER'] : (a.audience as Role[]);
  pushNotification({ roles }, 'announcement', a.title, a.body.slice(0, 90), `/announcements/${a.id}`);
}

/**
 * Offers are read from the ERP (Sage X3 price lists). The portal never creates
 * or changes an offer's terms; Admin/Supervisor may only edit its presentation.
 * Customers only get offers that apply to them (audience, site, dates) and that
 * aren't hidden in the portal. Pricing applies hidden offers too – the ERP does.
 */
export interface OfferQuery { forCustomerId?: string; manage?: boolean; kind?: Offer['kind'] }

const withStatus = (o: Offer): Offer => ({ ...o, status: offerStatus(o) });

export const offerService = {
  list: (q: OfferQuery = {}) =>
    source<Offer[]>(() => {
      const db = getDb();
      const all = db.offers.map(withStatus).filter((o) => !q.kind || o.kind === q.kind);
      if (q.manage) return all.sort(byPresentation);
      const customer = q.forCustomerId ? db.customers.find((c) => c.id === q.forCustomerId) : undefined;
      return all.filter((o) => !o.presentation.hidden && offerAppliesTo(o, { customer, site: getCurrentSite() })).sort(byPresentation);
    }, () => http.get('/offers', q)),

  /** Every offer, including hidden and inactive ones – for pricing. Backend: pricing happens server-side. */
  pricing: () => source<Offer[]>(() => getDb().offers.map(withStatus), () => http.get('/offers', { pricing: true })),

  get: (id: string) => source<Offer>(() => { const o = getDb().offers.find((x) => x.id === id); if (!o) throw new Error('errors.notFound'); return withStatus(o); }, () => http.get(`/offers/${id}`)),

  /** When offers were last read from the ERP. */
  syncedAt: () => source<string>(() => getDb().offersSyncedAt, () => http.get('/offers/sync-status')),

  /** Ask the backend to read offers from the ERP again. */
  sync: () => source<string>(() => { const db = getDb(); db.offersSyncedAt = new Date().toISOString(); db.offers.forEach((o) => { o.status = offerStatus(o); }); commit(); return db.offersSyncedAt; }, () => http.post('/offers/sync')),

  /** Portal decoration only (picture, text, featured, hidden, order). */
  savePresentation: (id: string, presentation: OfferPresentation, actor: ActorRef) =>
    source<Offer>(() => {
      if (actor.role !== 'ADMIN' && actor.role !== 'SUPERVISOR') throw new Error('errors.forbidden');
      const db = getDb();
      const o = db.offers.find((x) => x.id === id);
      if (!o) throw new Error('errors.notFound');
      const wasFeatured = !!o.presentation.featured;
      o.presentation = { ...presentation, updatedBy: actor.name, updatedAt: new Date().toISOString() };
      if (!wasFeatured && presentation.featured && !presentation.hidden && offerStatus(o) === 'active')
        pushNotification({ roles: ['CUSTOMER_B2B', 'CUSTOMER_B2C', 'SALES_REP'] }, 'offer', `New offer: ${presentation.title?.en || o.title}`, (presentation.text?.en || o.description).slice(0, 90), `/offers/${o.id}`);
      commit();
      return withStatus(o);
    }, () => http.put(`/offers/${id}/presentation`, presentation)),
};

function byPresentation(a: Offer, b: Offer) {
  const rank = (o: Offer) => (o.status === 'active' ? 0 : o.status === 'scheduled' ? 1 : 2);
  return rank(a) - rank(b) || Number(!!b.presentation.featured) - Number(!!a.presentation.featured) || (a.presentation.sort ?? 99) - (b.presentation.sort ?? 99) || a.validTo.localeCompare(b.validTo);
}

