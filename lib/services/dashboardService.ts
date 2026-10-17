import { source, http } from '@/lib/api/httpClient';
import { getDb } from '@/lib/data/mockDb';
import type { ActivityItem, Order } from '@/types/domain';
import { creditCheck } from '@/lib/domain/credit';

const DAY = 86400000;
const valid = (o: Order) => !['cancelled', 'rejected', 'pending_sync'].includes(o.status);
const today = (d: string) => new Date(d).toDateString() === new Date().toDateString();

function salesTrend(orders: Order[], days = 30) {
  return Array.from({ length: days }).map((_, k) => {
    const d = new Date(Date.now() - (days - 1 - k) * DAY);
    const v = orders.filter((o) => valid(o) && new Date(o.date).toDateString() === d.toDateString()).reduce((s, o) => s + o.total, 0);
    return { day: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), sales: Math.round(v) };
  });
}
function statusBreakdown(orders: Order[]) {
  const m: Record<string, number> = {};
  orders.forEach((o) => { m[o.status] = (m[o.status] ?? 0) + 1; });
  return Object.entries(m).map(([status, count]) => ({ status, count }));
}
function categorySales(orders: Order[]) {
  const db = getDb(); const m: Record<string, number> = {};
  orders.filter(valid).forEach((o) => o.lines.forEach((l) => { const c = db.products.find((p) => p.id === l.productId)?.category ?? 'Other'; m[c] = (m[c] ?? 0) + l.lineTotal; }));
  return Object.entries(m).map(([category, sales]) => ({ category, sales: Math.round(sales) })).sort((a, b) => b.sales - a.sales);
}

export const dashboardService = {
  getAdminDashboard: () => source(() => {
    const db = getDb();
    const last30 = db.orders.filter((o) => Date.now() - new Date(o.date).getTime() < 30 * DAY);
    return {
      totalCustomers: db.customers.length, activeCustomers: db.customers.filter((c) => c.status === 'active').length,
      pendingApprovals: db.users.filter((u) => u.status === 'pending').length, totalOrders: db.orders.length,
      pendingOrders: db.orders.filter((o) => o.status === 'pending_approval').length, salesValue: last30.filter(valid).reduce((s, o) => s + o.total, 0),
      unreadMessages: db.conversations.filter((c) => c.unreadBy.includes('usr_admin_1')).length,
      trend: salesTrend(db.orders), byStatus: statusBreakdown(last30), byCategory: categorySales(last30),
      activity: db.activity.slice(0, 8) as ActivityItem[], recentOrders: db.orders.slice(0, 6),
    };
  }, () => http.get('/dashboard/admin')),

  getManagerDashboard: (userId: string) => source(() => {
    const db = getDb();
    const todays = db.orders.filter((o) => today(o.date) && valid(o));
    const mStart = new Date(); mStart.setDate(1);
    return {
      pendingApprovals: db.orders.filter((o) => o.status === 'pending_approval').length, ordersToday: todays.length, salesToday: todays.reduce((s, o) => s + o.total, 0),
      salesMonth: db.orders.filter((o) => valid(o) && new Date(o.date) >= mStart).reduce((s, o) => s + o.total, 0),
      activeReps: db.users.filter((u) => u.role === 'sales' && u.status === 'active').length,
      pendingIssues: db.conversations.filter((c) => c.unreadBy.includes(userId)).length + db.orders.filter((o) => o.status === 'changes_requested').length,
      approvals: db.orders.filter((o) => o.status === 'pending_approval').slice(0, 5), recentOrders: db.orders.slice(0, 8), trend: salesTrend(db.orders, 14),
      activity: db.activity.slice(0, 6) as ActivityItem[],
      creditAlerts: db.orders.filter((o) => o.status === 'pending_approval').map((o) => ({ order: o, check: creditCheck(o, db.customers.find((c) => c.id === o.customerId)!, db.orders) })).filter((x) => x.check.over || x.check.onHold),
    };
  }, () => http.get('/dashboard/manager')),

  getCustomerDashboard: (customerId: string) => source(() => {
    const db = getDb();
    const c = db.customers.find((x) => x.id === customerId)!;
    const orders = db.orders.filter((o) => o.customerId === customerId);
    return {
      customer: c, outstanding: c.outstanding, creditLimit: c.creditLimit, available: Math.max(0, c.creditLimit - c.outstanding),
      overdue: db.invoices.filter((i) => i.customerId === customerId && i.status === 'overdue').reduce((s, i) => s + i.amount - i.paid, 0),
      recentOrders: orders.slice(0, 5), pendingOrders: orders.filter((o) => ['pending_approval', 'pending_sync', 'confirmed', 'processing', 'packed', 'dispatched', 'changes_requested'].includes(o.status)).length,
      lastDelivered: orders.find((o) => o.status === 'delivered'),
      ytd: orders.filter(valid).reduce((s, o) => s + o.total, 0),
    };
  }, () => http.get(`/dashboard/customer/${customerId}`)),
};
