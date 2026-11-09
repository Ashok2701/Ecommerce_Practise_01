import { Injectable } from '@nestjs/common';
import { Erp } from './erp';
import { activity, assertCustomerInScope, customerScope, notify, nowIso, text, uid } from './common';
import { badRequest, forbidden, notFound } from '../common/errors';
import { isCustomer, isManager, isRep, type Ctx } from '../common/ctx';
import { creditCheck } from '@/lib/domain/credit';
import { REVIEWABLE_REQUEST, type ActivityItem, type FollowUp, type Order, type User, type Visit, type VisitReport } from '@/types/domain';

const DAY = 86400000;
const counted = (o: Order) => !['cancelled', 'rejected', 'pending_sync', 'draft'].includes(o.status);
const valid = (o: Order) => !['cancelled', 'rejected', 'pending_sync'].includes(o.status);
const sameDay = (d: string) => new Date(d).toDateString() === new Date().toDateString();
const monthStart = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); };

export interface RepPerformance { rep: User; customers: number; ordersMonth: number; salesMonth: number; target: number; achievementPct: number; ordersToday: number; salesToday: number; monthly: { month: string; sales: number; target: number }[]; topCustomers: { name: string; sales: number }[] }

/** Sales team (performance, follow-ups, visits, visit reports) and the dashboards. */
@Injectable()
export class TeamService {
  constructor(private erp: Erp) {}

  /* ---------------- performance ---------------- */

  private perf(rep: User, orders: Order[], customers: number): RepPerformance {
    const mine = orders.filter((o) => o.salesRepId === rep.id && counted(o));
    const m = mine.filter((o) => new Date(o.date).getTime() >= monthStart());
    const t = mine.filter((o) => sameDay(o.date));
    const salesMonth = m.reduce((s, o) => s + o.total, 0);
    const monthly = Array.from({ length: 6 }).map((_, k) => {
      const d = new Date(); d.setMonth(d.getMonth() - (5 - k), 1);
      const sales = mine.filter((o) => { const od = new Date(o.date); return od.getMonth() === d.getMonth() && od.getFullYear() === d.getFullYear(); }).reduce((s, o) => s + o.total, 0);
      return { month: d.toLocaleString('en', { month: 'short' }), sales: Math.round(sales), target: rep.monthlyTarget ?? 0 };
    });
    const byCust: Record<string, number> = {};
    mine.forEach((o) => { byCust[o.customerName] = (byCust[o.customerName] ?? 0) + o.total; });
    return {
      rep, customers, ordersMonth: m.length, salesMonth, target: rep.monthlyTarget ?? 0, achievementPct: rep.monthlyTarget ? Math.round((salesMonth / rep.monthlyTarget) * 100) : 0,
      ordersToday: t.length, salesToday: t.reduce((s, o) => s + o.total, 0), monthly,
      topCustomers: Object.entries(byCust).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, sales]) => ({ name, sales: Math.round(sales) })),
    };
  }

  async performance(ctx: Ctx, repId: string): Promise<RepPerformance> {
    if (isRep(ctx) && repId !== ctx.user.id) throw notFound();
    if (!isManager(ctx) && !isRep(ctx)) throw forbidden();
    const rep = (await this.erp.users()).find((u) => u.id === repId && u.role === 'SALES_REP');
    if (!rep) throw notFound();
    const [orders, customers] = await Promise.all([this.erp.orders({ salesRepId: repId }), this.erp.customers()]);
    return this.perf(rep, orders, customers.filter((c) => c.salesRepId === repId).length);
  }

  async team(ctx: Ctx): Promise<RepPerformance[]> {
    if (!isManager(ctx)) throw forbidden();
    const reps = (await this.erp.users()).filter((u) => u.role === 'SALES_REP' && u.status === 'active');
    const [orders, customers] = await Promise.all([this.erp.orders(), this.erp.customers()]);
    return reps.map((r) => this.perf(r, orders, customers.filter((c) => c.salesRepId === r.id).length));
  }

  /* ---------------- follow-ups, visits, visit reports ---------------- */

  private repFor(ctx: Ctx, repId?: string) {
    if (isRep(ctx)) return ctx.user.id;
    if (!isManager(ctx)) throw forbidden();
    return repId || undefined;
  }

  async followUps(ctx: Ctx, repId?: string): Promise<FollowUp[]> {
    const rep = this.repFor(ctx, repId);
    return (await this.erp.db.repos.followUps.find(rep ? { party_id: rep } : {})).sort((a, b) => a.date.localeCompare(b.date));
  }

  async saveFollowUp(ctx: Ctx, f: Partial<FollowUp>, id?: string): Promise<FollowUp> {
    const rep = this.repFor(ctx, f?.salesRepId) ?? ctx.user.id;
    return this.erp.db.tx(async (r) => {
      const cur = id ? await r.followUps.get(id) : undefined;
      if (id && !cur) throw notFound();
      if (cur && isRep(ctx) && cur.salesRepId !== ctx.user.id) throw notFound();
      const patch: Partial<FollowUp> = {};
      if (f.customerId !== undefined) patch.customerId = text(f.customerId, 40);
      if (f.date !== undefined && !isNaN(new Date(f.date).getTime())) patch.date = new Date(f.date).toISOString();
      if (f.type !== undefined) patch.type = (['call', 'visit', 'payment', 'quote'] as const).includes(f.type) ? f.type : 'call';
      if (f.notes !== undefined) patch.notes = text(f.notes, 4000);
      if (f.status !== undefined) patch.status = f.status === 'done' ? 'done' : 'open';
      const item: FollowUp = cur ? Object.assign(cur, patch) : { id: uid('fu'), date: nowIso(), type: 'call', notes: '', status: 'open', salesRepId: rep, customerId: '', ...patch } as FollowUp;
      if (!item.customerId) throw badRequest('errors.followUps.customer');
      await r.followUps.save(item);
      return item;
    });
  }

  async visits(ctx: Ctx, repId?: string): Promise<Visit[]> {
    const rep = this.repFor(ctx, repId);
    return (await this.erp.db.repos.visits.find(rep ? { party_id: rep } : {})).filter((v) => sameDay(v.date)).sort((a, b) => a.time.localeCompare(b.time));
  }

  async setVisitStatus(ctx: Ctx, id: string, status: Visit['status']): Promise<Visit> {
    const v = await this.erp.db.repos.visits.get(id);
    if (!v || (isRep(ctx) && v.salesRepId !== ctx.user.id)) throw notFound();
    if (!(['planned', 'checked_in', 'completed'] as const).includes(status)) throw badRequest('errors.generic');
    v.status = status;
    await this.erp.db.tx((r) => r.visits.save(v));
    return v;
  }

  async visitReports(ctx: Ctx, q: { customerId?: string; repId?: string }): Promise<VisitReport[]> {
    if (q.customerId) await assertCustomerInScope(ctx, this.erp, q.customerId);
    const rep = isRep(ctx) ? ctx.user.id : q.repId;
    if (!isManager(ctx) && !isRep(ctx)) throw forbidden();
    return this.erp.db.repos.visitReports.find({ customer_id: q.customerId || undefined, party_id: rep || undefined });
  }

  /** Saves a visit report; completes the visit and creates a follow-up when a next-step date is set. */
  async saveVisitReport(ctx: Ctx, input: Omit<VisitReport, 'id' | 'at'> & { followUpType?: FollowUp['type'] }): Promise<VisitReport> {
    if (!isRep(ctx) && !isManager(ctx)) throw forbidden();
    const customerId = text(input?.customerId, 40);
    await assertCustomerInScope(ctx, this.erp, customerId);
    const cust = await this.erp.customer(customerId);
    const outcomes = ['order_placed', 'quote_requested', 'payment_collected', 'no_order', 'issue_reported'] as const;
    const report: VisitReport = {
      id: uid('vr'), at: nowIso(), visitId: input.visitId || undefined, customerId, salesRepId: isRep(ctx) ? ctx.user.id : text(input.salesRepId, 64) || ctx.user.id, salesRepName: ctx.user.name,
      outcome: outcomes.includes(input.outcome) ? input.outcome : 'no_order', contactMet: text(input.contactMet, 200), notes: text(input.notes, 10000), nextSteps: text(input.nextSteps, 4000),
      followUpDate: input.followUpDate || undefined,
      // photos are kept with the report (data URLs, resized on the device); move to object storage when volumes grow
      photos: (Array.isArray(input.photos) ? input.photos : []).filter((p) => typeof p === 'string' && p.length < 1_500_000).slice(0, 6),
    };
    await this.erp.db.tx(async (r) => {
      await r.visitReports.insert(report);
      if (report.visitId) { const v = await r.visits.get(report.visitId); if (v) { v.status = 'completed'; v.reportId = report.id; await r.visits.save(v); } }
      if (report.followUpDate) await r.followUps.insert({ id: uid('fu'), customerId, salesRepId: report.salesRepId, date: report.followUpDate, type: input.followUpType ?? 'call', notes: report.nextSteps || 'Follow up from visit', status: 'open' });
      await activity(r, { actor: ctx.user.name, text: `logged a visit report for ${cust.name} (${report.outcome.replace('_', ' ')})`, kind: 'customer', site: ctx.site });
      if (report.outcome === 'issue_reported') await notify(r, { roles: ['SUPERVISOR'] }, 'message', `Issue reported at ${cust.name}`, report.notes.slice(0, 90), `/customers/${customerId}`);
    });
    return report;
  }

  /* ---------------- dashboards ---------------- */

  private salesTrend(orders: Order[], days = 30) {
    return Array.from({ length: days }).map((_, k) => {
      const d = new Date(Date.now() - (days - 1 - k) * DAY);
      const v = orders.filter((o) => valid(o) && new Date(o.date).toDateString() === d.toDateString()).reduce((s, o) => s + o.total, 0);
      return { day: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), sales: Math.round(v) };
    });
  }

  private async activity(ctx: Ctx, n: number): Promise<ActivityItem[]> {
    return (await this.erp.db.repos.activity.find({}, { limit: n * 4 })).filter((a) => !a.site || a.site === ctx.site).slice(0, n).map(({ site, ...a }) => { void site; return a; });
  }

  async admin(ctx: Ctx) {
    if (!isManager(ctx)) throw forbidden();
    const [orders, customers, users, requests, convs, products] = await Promise.all([
      this.erp.orders({ site: ctx.site }), this.erp.x3.customers(), this.erp.users(), this.erp.db.repos.requests.find({ site: ctx.site, status: REVIEWABLE_REQUEST }),
      this.erp.db.repos.conversations.find(), this.erp.x3.products(),
    ]);
    const last30 = orders.filter((o) => Date.now() - new Date(o.date).getTime() < 30 * DAY);
    const cat = new Map(products.map((p) => [p.id, p.category]));
    const byStatus: Record<string, number> = {};
    last30.forEach((o) => { byStatus[o.status] = (byStatus[o.status] ?? 0) + 1; });
    const byCat: Record<string, number> = {};
    last30.filter(valid).forEach((o) => o.lines.forEach((l) => { const c = cat.get(l.productId) ?? 'Other'; byCat[c] = (byCat[c] ?? 0) + l.lineTotal; }));
    return {
      totalCustomers: customers.length, activeCustomers: customers.filter((c) => c.status === 'active').length,
      pendingApprovals: users.filter((u) => u.status === 'pending').length, totalOrders: orders.length, pendingOrders: requests.length,
      salesValue: last30.filter(valid).reduce((s, o) => s + o.total, 0), unreadMessages: convs.filter((c) => c.unreadBy.includes(ctx.user.id)).length,
      trend: this.salesTrend(orders), byStatus: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
      byCategory: Object.entries(byCat).map(([category, sales]) => ({ category, sales: Math.round(sales) })).sort((a, b) => b.sales - a.sales),
      activity: await this.activity(ctx, 8), recentOrders: orders.slice(0, 6),
    };
  }

  async manager(ctx: Ctx) {
    if (!isManager(ctx)) throw forbidden();
    const [orders, review, users, convs] = await Promise.all([
      this.erp.orders({ site: ctx.site }), this.erp.db.repos.requests.find({ site: ctx.site, status: REVIEWABLE_REQUEST }), this.erp.users(), this.erp.db.repos.conversations.find(),
    ]);
    const todays = orders.filter((o) => sameDay(o.date) && valid(o));
    const mStart = new Date(); mStart.setDate(1);
    const flagged = review.filter((r) => (r.credit?.over || r.credit?.onHold) && !r.creditOverride);
    const custs = new Map((await this.erp.customers([...new Set(flagged.map((r) => r.customerId))])).map((c) => [c.id, c]));
    const custOrders = flagged.length ? await this.erp.orders({ customerIds: [...custs.keys()] }) : [];
    return {
      pendingApprovals: review.length, ordersToday: todays.length, salesToday: todays.reduce((s, o) => s + o.total, 0),
      salesMonth: orders.filter((o) => valid(o) && new Date(o.date) >= mStart).reduce((s, o) => s + o.total, 0),
      activeReps: users.filter((u) => u.role === 'SALES_REP' && u.status === 'active').length,
      pendingIssues: convs.filter((c) => c.unreadBy.includes(ctx.user.id)).length + orders.filter((o) => o.status === 'changes_requested').length,
      approvals: review.slice(0, 5), recentOrders: orders.slice(0, 8), trend: this.salesTrend(orders, 14), activity: await this.activity(ctx, 6),
      creditAlerts: flagged.filter((r) => custs.has(r.customerId)).map((r) => ({ order: r, check: creditCheck({ id: r.id, total: r.total }, custs.get(r.customerId)!, custOrders) })),
    };
  }

  async customer(ctx: Ctx, customerId: string) {
    if (isCustomer(ctx) && ctx.user.customerId !== customerId) throw notFound();
    const scope = await customerScope(ctx, this.erp);
    if (scope && !scope.includes(customerId)) throw notFound();
    const [c, orders, invoices] = await Promise.all([this.erp.customer(customerId), this.erp.orders({ site: ctx.site, customerIds: [customerId] }), this.erp.invoices({ customerIds: [customerId] })]);
    return {
      customer: c, outstanding: c.outstanding, creditLimit: c.creditLimit, available: Math.max(0, c.creditLimit - c.outstanding),
      overdue: invoices.filter((i) => i.status === 'overdue').reduce((s, i) => s + i.amount - i.paid, 0),
      recentOrders: orders.slice(0, 5), pendingOrders: orders.filter((o) => ['pending_approval', 'pending_sync', 'confirmed', 'processing', 'packed', 'dispatched', 'changes_requested'].includes(o.status)).length,
      lastDelivered: orders.find((o) => o.status === 'delivered'), ytd: orders.filter(valid).reduce((s, o) => s + o.total, 0),
    };
  }
}
