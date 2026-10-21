import { source, http } from '@/lib/api/httpClient';
import { getDb, atSite, inSite, commit, uid } from '@/lib/data/mockDb';
import { getCurrentSite } from '@/lib/sites/current';
import { buildOrderTotals } from '@/lib/domain/pricing';
import { creditCheck } from '@/lib/domain/credit';
import { fmtMoney } from '@/lib/format';
import { pushNotification } from './notificationService';
import { onDispatch } from './commerceService';
import type { ActorRef, Order, OrderStatus } from '@/types/domain';

export interface OrderQuery { customerId?: string; salesRepId?: string; status?: OrderStatus | 'all' | 'open'; search?: string; }
export interface CreateOrderInput { customerId: string; items: { productId: string; quantity: number }[]; notes?: string; poNumber?: string; actor: ActorRef; offline?: boolean; }

const OPEN: OrderStatus[] = ['pending_sync', 'pending_approval', 'changes_requested', 'confirmed', 'processing', 'packed', 'dispatched'];
export const ORDER_FLOW: OrderStatus[] = ['pending_approval', 'confirmed', 'processing', 'packed', 'dispatched', 'delivered'];

function find(id: string) { const o = getDb().orders.find((x) => x.id === id || x.number === id); if (!o) throw new Error('Order not found'); return o; }
function customerUserId(customerId: string) { return getDb().users.find((u) => u.customerId === customerId)?.id; }
function log(o: Order, status: OrderStatus, by: string, note?: string) { o.status = status; o.timeline.push({ status, at: new Date().toISOString(), by, note }); }

export const orderService = {
  getOrders: (q: OrderQuery = {}) =>
    source<Order[]>(() => {
      const s = q.search?.toLowerCase() ?? '';
      return getDb().orders.filter((o) => inSite(o) &&
        (!q.customerId || o.customerId === q.customerId) && (!q.salesRepId || o.salesRepId === q.salesRepId) &&
        (!q.status || q.status === 'all' || (q.status === 'open' ? OPEN.includes(o.status) : o.status === q.status)) &&
        (!s || [o.number, o.customerName, o.poNumber ?? '', ...o.lines.map((l) => l.name)].some((v) => v.toLowerCase().includes(s))));
    }, () => http.get('/orders', q)),

  getOrder: (id: string) => source<Order>(() => find(id), () => http.get(`/orders/${id}`)),

  /** Credit position for an order (mock computes locally; backend asks ERP credit control). */
  getCreditCheck: (id: string) =>
    source(() => { const o = find(id); const c = getDb().customers.find((x) => x.id === o.customerId)!; return creditCheck(o, c, getDb().orders); }, () => http.get(`/orders/${id}/credit-check`)),

  addComment: (id: string, actor: ActorRef, text: string) =>
    source<Order>(() => { const o = find(id); o.comments.push({ by: actor.name, at: new Date().toISOString(), text }); commit(); return o; }, () => http.post(`/orders/${id}/comments`, { text })),

  /**
   * Demo helper: move an order to its next fulfilment stage (the ERP drives this).
   * Stops at dispatched: delivery is confirmed with proof of delivery on the delivery note.
   */
  advance: (id: string, by: string) =>
    source<Order>(() => {
      const o = find(id); const i = ORDER_FLOW.indexOf(o.status);
      if (i >= 0 && i < ORDER_FLOW.indexOf('dispatched')) {
        log(o, ORDER_FLOW[i + 1], by);
        if (o.status === 'dispatched') {
          onDispatch(o, by);
          pushNotification({ userIds: [customerUserId(o.customerId)!] }, 'order_dispatched', 'Your order has been dispatched', o.number, `/orders/${o.id}`);
        }
      }
      commit(); return o;
    }, () => Promise.reject(new Error('Not supported via API'))),

  cancel: (id: string, by: string) =>
    source<Order>(() => { const o = find(id); log(o, 'cancelled', by, 'Cancelled by user'); commit(); return o; }, () => http.post(`/orders/${id}/cancel`)),
};
