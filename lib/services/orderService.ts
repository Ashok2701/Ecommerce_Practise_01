import { source, http } from '@/lib/api/httpClient';
import { getDb, commit, uid } from '@/lib/data/mockDb';
import { buildOrderTotals } from '@/lib/domain/pricing';
import { creditCheck } from '@/lib/domain/credit';
import { fmtMoney } from '@/lib/format';
import { pushNotification } from './notificationService';
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
      return getDb().orders.filter((o) =>
        (!q.customerId || o.customerId === q.customerId) && (!q.salesRepId || o.salesRepId === q.salesRepId) &&
        (!q.status || q.status === 'all' || (q.status === 'open' ? OPEN.includes(o.status) : o.status === q.status)) &&
        (!s || [o.number, o.customerName, o.poNumber ?? '', ...o.lines.map((l) => l.name)].some((v) => v.toLowerCase().includes(s))));
    }, () => http.get('/orders', q)),

  getOrder: (id: string) => source<Order>(() => find(id), () => http.get(`/orders/${id}`)),

  /** Online orders go to Pending Approval. Offline orders are queued as Pending Sync and never shown as confirmed. */
  createOrder: (input: CreateOrderInput) =>
    source<Order>(() => {
      const db = getDb();
      const cust = db.customers.find((c) => c.id === input.customerId)!;
      const items = input.items.map((i) => ({ product: db.products.find((p) => p.id === i.productId)!, quantity: i.quantity })).filter((i) => i.product && i.quantity > 0);
      if (!items.length) throw new Error('Order has no items');
      const totals = buildOrderTotals(items, cust, db.offers);
      const now = new Date().toISOString();
      const status: OrderStatus = input.offline ? 'pending_sync' : 'pending_approval';
      const seq = db.seq.order++;
      const o: Order = {
        id: `ord_${seq}`, number: input.offline ? `DRAFT-${uid('').slice(1, 7).toUpperCase()}` : `SO-26-${String(seq).padStart(5, '0')}`,
        customerId: cust.id, customerName: cust.name, salesRepId: cust.salesRepId, createdBy: input.actor, source: input.offline ? 'offline' : input.actor.role === 'SALES_REP' ? 'sales_app' : 'portal',
        date: now, expectedDelivery: new Date(Date.now() + 5 * 86400000).toISOString(), status, ...totals, notes: input.notes, poNumber: input.poNumber,
        deliveryAddress: cust.address, billingAddress: cust.billingAddress, comments: [],
        timeline: [{ status, at: now, by: input.actor.name, note: input.offline ? 'Saved on device – will sync when online' : 'Submitted for approval' }],
      };
      db.orders.unshift(o);
      if (!input.offline) {
        cust.lastOrderDate = now; cust.lastOrderAmount = o.total;
        db.activity.unshift({ id: uid('act'), at: now, actor: input.actor.name, text: `placed order ${o.number} for ${cust.name}`, kind: 'order' });
        const cc = creditCheck(o, cust, db.orders);
        if (cc.over || cc.onHold) pushNotification({ roles: ['SUPERVISOR'] }, 'approval_required', 'Credit hold alert', `${o.number} from ${cust.name} ${cc.onHold ? 'is on an account on hold' : `exceeds available credit by ${fmtMoney(cc.exceededBy)}`}`, `/approvals?order=${o.id}`);
        else pushNotification({ roles: ['SUPERVISOR'] }, 'approval_required', 'Approval required', `${o.number} from ${cust.name} – ${o.lines.length} items`, '/approvals');
      }
      commit();
      return o;
    }, () => http.post('/orders', input)),

  /** Push queued offline orders. In API mode the backend/ERP decides the resulting status. */
  syncPending: () =>
    source<number>(() => {
      const pending = getDb().orders.filter((o) => o.status === 'pending_sync');
      pending.forEach((o) => {
        const seq = getDb().seq.order++;
        o.number = `SO-26-${String(seq).padStart(5, '0')}`;
        log(o, 'pending_approval', 'Sync service', 'Synced to server – awaiting approval');
        pushNotification({ roles: ['SUPERVISOR'] }, 'approval_required', 'Approval required', `${o.number} from ${o.customerName} (synced)`, '/approvals');
      });
      commit();
      return pending.length;
    }, () => http.post('/orders/sync')),

  /** Credit position for an order (mock computes locally; backend asks ERP credit control). */
  getCreditCheck: (id: string) =>
    source(() => { const o = find(id); const c = getDb().customers.find((x) => x.id === o.customerId)!; return creditCheck(o, c, getDb().orders); }, () => http.get(`/orders/${id}/credit-check`)),

  decide: (id: string, decision: 'approve' | 'reject' | 'changes', actor: ActorRef, comment?: string, opts: { overrideCredit?: boolean } = {}) =>
    source<Order>(() => {
      const o = find(id);
      if (decision === 'approve') {
        const c = getDb().customers.find((x) => x.id === o.customerId)!;
        const cc = creditCheck(o, c, getDb().orders);
        if ((cc.over || cc.onHold) && !opts.overrideCredit) throw new Error('Credit limit exceeded \u2013 override required');
        if (cc.over || cc.onHold) {
          o.creditOverride = { by: actor.name, at: new Date().toISOString(), exceededBy: cc.exceededBy, reason: comment };
          o.comments.push({ by: actor.name, at: new Date().toISOString(), text: `Credit override: approved ${cc.over ? `${fmtMoney(cc.exceededBy)} above available credit` : 'despite account hold'}${comment ? ` \u2013 ${comment}` : ''}` });
        }
      }
      if (comment) o.comments.push({ by: actor.name, at: new Date().toISOString(), text: comment });
      const map = { approve: 'confirmed', reject: 'rejected', changes: 'changes_requested' } as const;
      log(o, map[decision], actor.name, decision === 'approve' ? (o.creditOverride ? 'Approved with credit override \u2013 posted to Sage X3 (mock)' : 'Approved and posted to Sage X3 (mock)') : comment);
      if (decision === 'approve') o.erpRef = `SOH${Math.floor(270000 + Math.random() * 9999)}`;
      const titles = { approve: 'Order confirmed', reject: 'Order rejected', changes: 'Changes requested on order' };
      pushNotification({ userIds: [customerUserId(o.customerId)!, o.salesRepId].filter(Boolean) }, decision === 'approve' ? 'order_confirmed' : 'order_new', titles[decision], `${o.number} – ${comment || 'by ' + actor.name}`, `/orders/${o.id}`);
      getDb().activity.unshift({ id: uid('act'), at: new Date().toISOString(), actor: actor.name, text: `${decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'requested changes on'} ${o.number}`, kind: 'approval' });
      commit();
      return o;
    }, () => http.post(`/orders/${id}/${decision}`, { comment, ...opts })),

  addComment: (id: string, actor: ActorRef, text: string) =>
    source<Order>(() => { const o = find(id); o.comments.push({ by: actor.name, at: new Date().toISOString(), text }); commit(); return o; }, () => http.post(`/orders/${id}/comments`, { text })),

  /** Demo helper: move an order to its next fulfilment stage (ERP would drive this). */
  advance: (id: string, by: string) =>
    source<Order>(() => {
      const o = find(id); const i = ORDER_FLOW.indexOf(o.status);
      if (i >= 0 && i < ORDER_FLOW.length - 1) {
        log(o, ORDER_FLOW[i + 1], by);
        if (o.status === 'dispatched') pushNotification({ userIds: [customerUserId(o.customerId)!] }, 'order_dispatched', 'Your order has been dispatched', o.number, `/orders/${o.id}`);
      }
      commit(); return o;
    }, () => Promise.reject(new Error('Not supported via API'))),

  cancel: (id: string, by: string) =>
    source<Order>(() => { const o = find(id); log(o, 'cancelled', by, 'Cancelled by user'); commit(); return o; }, () => http.post(`/orders/${id}/cancel`)),
};
