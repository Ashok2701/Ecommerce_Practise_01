import { source, http } from '@/lib/api/httpClient';
import { getDb, commit, uid } from '@/lib/data/mockDb';
import type { FollowUp, Order, User, Visit, VisitReport } from '@/types/domain';
import { pushNotification } from './notificationService';

const monthStart = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); };
const counted = (o: Order) => !['cancelled', 'rejected', 'pending_sync', 'draft'].includes(o.status);

export interface RepPerformance { rep: User; customers: number; ordersMonth: number; salesMonth: number; target: number; achievementPct: number; ordersToday: number; salesToday: number; monthly: { month: string; sales: number; target: number }[]; topCustomers: { name: string; sales: number }[]; }

function perf(rep: User): RepPerformance {
  const db = getDb();
  const orders = db.orders.filter((o) => o.salesRepId === rep.id && counted(o));
  const m = orders.filter((o) => new Date(o.date).getTime() >= monthStart());
  const t = orders.filter((o) => new Date(o.date).toDateString() === new Date().toDateString());
  const salesMonth = m.reduce((s, o) => s + o.total, 0);
  const monthly = Array.from({ length: 6 }).map((_, k) => {
    const d = new Date(); d.setMonth(d.getMonth() - (5 - k), 1);
    const sales = orders.filter((o) => { const od = new Date(o.date); return od.getMonth() === d.getMonth() && od.getFullYear() === d.getFullYear(); }).reduce((s, o) => s + o.total, 0);
    return { month: d.toLocaleString('en', { month: 'short' }), sales: Math.round(sales), target: rep.monthlyTarget ?? 0 };
  });
  const byCust: Record<string, number> = {};
  orders.forEach((o) => { byCust[o.customerName] = (byCust[o.customerName] ?? 0) + o.total; });
  return {
    rep, customers: db.customers.filter((c) => c.salesRepId === rep.id).length, ordersMonth: m.length, salesMonth, target: rep.monthlyTarget ?? 0,
    achievementPct: rep.monthlyTarget ? Math.round((salesMonth / rep.monthlyTarget) * 100) : 0, ordersToday: t.length, salesToday: t.reduce((s, o) => s + o.total, 0), monthly,
    topCustomers: Object.entries(byCust).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, sales]) => ({ name, sales: Math.round(sales) })),
  };
}

export const salesService = {
  getPerformance: (repId: string) => source<RepPerformance>(() => perf(getDb().users.find((u) => u.id === repId)!), () => http.get(`/sales-reps/${repId}/performance`)),
  getTeam: () => source<RepPerformance[]>(() => getDb().users.filter((u) => u.role === 'sales' && u.status === 'active').map(perf), () => http.get('/sales-reps/performance')),
  getFollowUps: (repId?: string) => source<FollowUp[]>(() => getDb().followUps.filter((f) => !repId || f.salesRepId === repId).sort((a, b) => a.date.localeCompare(b.date)), () => http.get('/follow-ups', { repId })),
  saveFollowUp: (f: Partial<FollowUp> & { customerId: string; salesRepId: string }) =>
    source<FollowUp>(() => {
      const db = getDb();
      let item = f.id ? db.followUps.find((x) => x.id === f.id) : undefined;
      if (item) Object.assign(item, f); else { item = { id: uid('fu'), date: new Date().toISOString(), type: 'call', notes: '', status: 'open', ...f } as FollowUp; db.followUps.push(item); }
      commit(); return item;
    }, () => (f.id ? http.patch(`/follow-ups/${f.id}`, f) : http.post('/follow-ups', f))),
  getVisits: (repId: string) => source<Visit[]>(() => getDb().visits.filter((v) => v.salesRepId === repId).sort((a, b) => a.time.localeCompare(b.time)), () => http.get('/visits', { repId, date: 'today' })),
  setVisitStatus: (id: string, status: Visit['status']) => source(() => { const v = getDb().visits.find((x) => x.id === id)!; v.status = status; commit(); return v; }, () => http.patch(`/visits/${id}`, { status })),
  getVisitReports: (q: { customerId?: string; repId?: string } = {}) =>
    source<VisitReport[]>(() => (getDb().visitReports ??= []).filter((r) => (!q.customerId || r.customerId === q.customerId) && (!q.repId || r.salesRepId === q.repId)).sort((a, b) => b.at.localeCompare(a.at)), () => http.get('/visit-reports', q)),
  /** Saves a visit report; completes the visit and creates a follow-up when a next-step date is set. Photos -> object storage in API mode. */
  saveVisitReport: (r: Omit<VisitReport, 'id' | 'at'> & { followUpType?: FollowUp['type'] }) =>
    source<VisitReport>(() => {
      const db = getDb();
      db.visitReports ??= [];
      const { followUpType, ...rest } = r;
      const report: VisitReport = { ...rest, id: uid('vr'), at: new Date().toISOString() };
      db.visitReports.unshift(report);
      if (r.visitId) { const v = db.visits.find((x) => x.id === r.visitId); if (v) { v.status = 'completed'; v.reportId = report.id; } }
      if (r.followUpDate) db.followUps.push({ id: uid('fu'), customerId: r.customerId, salesRepId: r.salesRepId, date: r.followUpDate, type: followUpType ?? 'call', notes: r.nextSteps || 'Follow up from visit', status: 'open' });
      const cust = db.customers.find((c) => c.id === r.customerId);
      db.activity.unshift({ id: uid('act'), at: report.at, actor: r.salesRepName, text: `logged a visit report for ${cust?.name} (${r.outcome.replace('_', ' ')})`, kind: 'customer' });
      if (r.outcome === 'issue_reported') pushNotification({ roles: ['manager'] }, 'message', `Issue reported at ${cust?.name}`, r.notes.slice(0, 90), `/customers/${r.customerId}`);
      commit();
      return report;
    }, () => http.post('/visit-reports', r)),
};
