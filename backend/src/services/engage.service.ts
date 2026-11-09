import { Injectable } from '@nestjs/common';
import { Erp } from './erp';
import { notify, nowIso, requireManager, text, uid } from './common';
import { badRequest, forbidden, notFound } from '../common/errors';
import { isCustomer, isManager, type Ctx } from '../common/ctx';
import { offerAppliesTo } from '@/lib/domain/pricing';
import { ROLES, type Announcement, type AppNotification, type Audience, type Conversation, type Offer, type OfferPresentation, type Role } from '@/types/domain';

function byPresentation(a: Offer, b: Offer) {
  const rank = (o: Offer) => (o.status === 'active' ? 0 : o.status === 'scheduled' ? 1 : 2);
  return rank(a) - rank(b) || Number(!!b.presentation.featured) - Number(!!a.presentation.featured) || (a.presentation.sort ?? 99) - (b.presentation.sort ?? 99) || a.validTo.localeCompare(b.validTo);
}

const AUDIENCES: Audience[] = ['all', ...ROLES];

/** Announcements, offers (from the ERP), messages and notifications. */
@Injectable()
export class EngageService {
  constructor(private erp: Erp) {}

  /* ---------------- announcements ---------------- */

  private visibleTo(a: Announcement, role: Role) {
    return a.status === 'published' && new Date(a.publishAt).getTime() <= Date.now() + 60_000 && (a.audience.includes('all') || a.audience.includes(role));
  }

  /** Scheduled announcements whose time has come are published (and notified) when read. */
  private async publishDue(list: Announcement[]) {
    const due = list.filter((a) => a.status === 'scheduled' && new Date(a.publishAt).getTime() <= Date.now());
    if (due.length) await this.erp.db.tx(async (r) => { for (const a of due) { a.status = 'published'; await r.announcements.save(a); await this.notifyAnnouncement(r, a); } });
  }

  private notifyAnnouncement(r: Parameters<typeof notify>[0], a: Announcement) {
    const roles: Role[] = a.audience.includes('all') ? ['CUSTOMER_B2B', 'CUSTOMER_B2C', 'SALES_REP', 'SUPERVISOR', 'SUPPLIER'] : (a.audience as Role[]);
    return notify(r, { roles }, 'announcement', a.title, a.body.slice(0, 90), `/announcements/${a.id}`);
  }

  async announcements(ctx: Ctx, manage: boolean): Promise<Announcement[]> {
    const all = await this.erp.db.repos.announcements.find();
    await this.publishDue(all);
    const list = manage && isManager(ctx) ? all : all.filter((a) => this.visibleTo(a, ctx.user.role));
    return list.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.publishAt.localeCompare(a.publishAt));
  }

  async announcement(ctx: Ctx, id: string): Promise<Announcement> {
    const a = await this.erp.db.repos.announcements.get(id);
    if (!a || (!isManager(ctx) && !this.visibleTo(a, ctx.user.role))) throw notFound();
    return a;
  }

  private clean(a: Partial<Announcement>): Partial<Announcement> {
    const out: Partial<Announcement> = {};
    if (a.title !== undefined) out.title = text(a.title, 200).trim();
    if (a.body !== undefined) out.body = text(a.body, 10000);
    if (a.category !== undefined) out.category = (['company', 'product', 'notice'] as const).includes(a.category) ? a.category : 'company';
    if (a.audience !== undefined) out.audience = (Array.isArray(a.audience) ? a.audience : []).filter((x) => AUDIENCES.includes(x));
    if (a.status !== undefined) out.status = (['draft', 'scheduled', 'published'] as const).includes(a.status) ? a.status : 'draft';
    if (a.publishAt !== undefined && !isNaN(new Date(a.publishAt).getTime())) out.publishAt = new Date(a.publishAt).toISOString();
    if (a.pinned !== undefined) out.pinned = !!a.pinned;
    return out;
  }

  async saveAnnouncement(ctx: Ctx, input: Partial<Announcement>, id?: string): Promise<Announcement> {
    requireManager(ctx);
    const patch = this.clean(input ?? {});
    return this.erp.db.tx(async (r) => {
      let a = id ? await r.announcements.get(id) : undefined;
      if (id && !a) throw notFound();
      const wasPublished = a?.status === 'published';
      if (a) Object.assign(a, patch);
      else {
        if (!patch.title) throw badRequest('errors.announcements.title');
        a = { id: uid('ann'), title: patch.title, body: '', category: 'company', audience: ['all'], status: 'draft', publishAt: nowIso(), createdBy: ctx.user.name, ...patch } as Announcement;
      }
      if (!a.audience.length) a.audience = ['all'];
      if (patch.status === 'published' && !wasPublished && input.publishAt === undefined) a.publishAt = nowIso();
      await r.announcements.save(a);
      if (a.status === 'published' && !wasPublished) await this.notifyAnnouncement(r, a);
      await r.audit({ userId: ctx.user.id, userName: ctx.user.name, site: ctx.site, action: id ? 'announcement.update' : 'announcement.create', entity: 'announcement', entityId: a.id, detail: patch });
      return a;
    });
  }

  async deleteAnnouncement(ctx: Ctx, id: string) {
    requireManager(ctx);
    await this.erp.db.tx(async (r) => { await r.announcements.remove(id); await r.audit({ userId: ctx.user.id, userName: ctx.user.name, action: 'announcement.delete', entity: 'announcement', entityId: id }); });
    return true;
  }

  /* ---------------- offers ---------------- */

  async offers(ctx: Ctx, q: { forCustomerId?: string; manage?: string; kind?: string; pricing?: string }): Promise<Offer[]> {
    const all = (await this.erp.offers()).filter((o) => !q.kind || o.kind === q.kind);
    const staff = !isCustomer(ctx);
    // every offer, hidden ones too: the cart previews prices with the same rules as the ERP
    if (q.pricing === 'true') return all;
    if (q.manage === 'true' && staff) return all.sort(byPresentation);
    const customerId = isCustomer(ctx) ? ctx.user.customerId : q.forCustomerId;
    const customer = customerId ? await this.erp.customer(customerId).catch(() => undefined) : undefined;
    return all.filter((o) => !o.presentation.hidden && offerAppliesTo(o, { customer, site: ctx.site })).sort(byPresentation);
  }

  async offer(ctx: Ctx, id: string): Promise<Offer> {
    const o = (await this.erp.offers()).find((x) => x.id === id);
    if (!o || (isCustomer(ctx) && o.presentation.hidden)) throw notFound();
    return o;
  }

  async savePresentation(ctx: Ctx, id: string, p: OfferPresentation): Promise<Offer> {
    requireManager(ctx);
    const o = (await this.erp.offers()).find((x) => x.id === id);
    if (!o) throw notFound();
    const langs = (m?: Record<string, string>) => (m && typeof m === 'object' ? Object.fromEntries(Object.entries(m).filter(([k, v]) => /^[a-z]{2}$/.test(k) && typeof v === 'string').map(([k, v]) => [k, v.slice(0, 2000)])) : undefined);
    const presentation: OfferPresentation = {
      image: text(p?.image, 3_000_000) || undefined, title: langs(p?.title), text: langs(p?.text), featured: !!p?.featured, hidden: !!p?.hidden,
      sort: p?.sort === undefined || p?.sort === null ? undefined : Number(p.sort), updatedBy: ctx.user.name, updatedAt: nowIso(),
    };
    const wasFeatured = !!o.presentation.featured;
    await this.erp.db.tx(async (r) => {
      await r.presentations.save({ id, presentation, at: nowIso() });
      if (!wasFeatured && presentation.featured && !presentation.hidden && o.status === 'active')
        await notify(r, { roles: ['CUSTOMER_B2B', 'CUSTOMER_B2C', 'SALES_REP'] }, 'offer', `New offer: ${presentation.title?.en || o.title}`, (presentation.text?.en || o.description).slice(0, 90), `/offers/${o.id}`);
      await r.audit({ userId: ctx.user.id, userName: ctx.user.name, site: ctx.site, action: 'offer.presentation', entity: 'offer', entityId: id, detail: { featured: presentation.featured, hidden: presentation.hidden } });
    });
    return { ...o, presentation };
  }

  syncStatus() { return this.erp.offersSyncedAt(); }
  async sync(ctx: Ctx) { requireManager(ctx); return this.erp.syncOffers(); }

  /* ---------------- conversations ---------------- */

  private visible(c: Conversation, ctx: Ctx) {
    if (isManager(ctx)) return true;
    if (isCustomer(ctx)) return c.customerId === ctx.user.customerId;
    return c.participantIds.includes(ctx.user.id);
  }

  async conversations(ctx: Ctx): Promise<Conversation[]> {
    return (await this.erp.db.repos.conversations.find()).filter((c) => this.visible(c, ctx));
  }

  private async conversation(ctx: Ctx, id: string) {
    const c = await this.erp.db.repos.conversations.get(id);
    if (!c || !this.visible(c, ctx)) throw notFound();
    return c;
  }

  async markRead(ctx: Ctx, id: string) {
    const c = await this.conversation(ctx, id);
    if (c.unreadBy.includes(ctx.user.id)) { c.unreadBy = c.unreadBy.filter((u) => u !== ctx.user.id); await this.erp.db.tx((r) => r.conversations.save(c)); }
    return true;
  }

  async send(ctx: Ctx, id: string, body: string): Promise<Conversation> {
    const c = await this.conversation(ctx, id);
    const b = text(body, 10000).trim();
    if (!b) throw badRequest('errors.messages.empty');
    const at = nowIso();
    c.messages.push({ id: uid('msg'), senderId: ctx.user.id, senderName: ctx.user.name, senderRole: ctx.user.role, body: b, at });
    c.updatedAt = at;
    if (!c.participantIds.includes(ctx.user.id)) c.participantIds.push(ctx.user.id);
    const others = c.participantIds.filter((p) => p !== ctx.user.id);
    c.unreadBy = Array.from(new Set([...c.unreadBy.filter((u) => u !== ctx.user.id), ...others]));
    await this.erp.db.tx(async (r) => { await r.conversations.save(c); await notify(r, { userIds: others }, 'message', `New message from ${ctx.user.name}`, b.slice(0, 80), '/messages'); });
    return c;
  }

  /** Customers open support conversations; their rep and the managers are added automatically. */
  async createConversation(ctx: Ctx, subject: string, body: string): Promise<Conversation> {
    const s = text(subject, 200).trim(), b = text(body, 10000).trim();
    if (!s || !b) throw badRequest('errors.messages.empty');
    const cust = ctx.user.customerId ? await this.erp.customer(ctx.user.customerId).catch(() => undefined) : undefined;
    const managers = (await this.erp.users()).filter((u) => (u.role === 'SUPERVISOR' || u.role === 'ADMIN') && u.status === 'active').map((u) => u.id);
    const participants = Array.from(new Set([ctx.user.id, ...(cust?.salesRepId ? [cust.salesRepId] : []), ...managers]));
    const at = nowIso();
    const c: Conversation = {
      id: uid('conv'), subject: s, customerId: cust?.id, participantIds: participants, participantNames: [ctx.user.name, 'Support'], updatedAt: at,
      unreadBy: participants.filter((p) => p !== ctx.user.id), messages: [{ id: uid('msg'), senderId: ctx.user.id, senderName: ctx.user.name, senderRole: ctx.user.role, body: b, at }],
    };
    await this.erp.db.tx(async (r) => { await r.conversations.insert(c); await notify(r, { userIds: c.unreadBy }, 'message', `New conversation: ${s}`, b.slice(0, 80), '/messages'); });
    return c;
  }

  /* ---------------- notifications ---------------- */

  notifications(ctx: Ctx): Promise<AppNotification[]> { return this.erp.db.repos.notifications.find({ party_id: ctx.user.id }, { limit: 200 }); }

  async readNotification(ctx: Ctx, id: string) {
    const n = await this.erp.db.repos.notifications.get(id);
    if (!n || n.userId !== ctx.user.id) throw notFound();
    if (!n.read) { n.read = true; await this.erp.db.tx((r) => r.notifications.save(n)); }
    return true;
  }

  async readAll(ctx: Ctx) {
    const list = await this.erp.db.repos.notifications.find({ party_id: ctx.user.id, status: 'unread' });
    if (list.length) await this.erp.db.tx(async (r) => { for (const n of list) { n.read = true; await r.notifications.save(n); } });
    return true;
  }

  forbid() { throw forbidden(); }
}
