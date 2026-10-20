import { source, http } from '@/lib/api/httpClient';
import { getDb, commit, uid, atSite, inSite } from '@/lib/data/mockDb';
import { getCurrentSite } from '@/lib/sites/current';
import { stockStatus } from '@/lib/domain/pricing';
import { pushNotification } from './notificationService';
import type { ActorRef, Product, PurchaseLine, PurchaseOrder, PurchaseOrderStatus, PurchaseRequest, PurchaseRequestStatus, Supplier } from '@/types/domain';

/**
 * Purchasing
 * ----------
 * Suppliers offer stock with a pickup request; our staff raise internal
 * purchase requests (for example for low stock). A supervisor converts a
 * request into a purchase order in the ERP. The supplier acknowledges it,
 * confirms pickup and dispatches; the warehouse receives the goods (GRN),
 * which adds stock at the site. No screen creates a purchase order directly.
 */
const now = () => new Date().toISOString();
const DAY = 86400000;

/** Mock supplier price: stands in for the ERP purchase price list. */
const unitCost = (p: Product) => Math.round(p.basePrice * 0.68 * 100) / 100;
function lineFor(productId: string, quantity: number): PurchaseLine {
  const p = getDb().products.find((x) => x.id === productId)!;
  const c = unitCost(p);
  return { productId, sku: p.sku, name: p.name, uom: p.uom, quantity, unitCost: c, lineTotal: Math.round(c * quantity * 100) / 100 };
}
const total = (ls: PurchaseLine[]) => Math.round(ls.reduce((a, l) => a + l.lineTotal, 0) * 100) / 100;

const supplierUsers = (supplierId: string) => getDb().users.filter((u) => u.supplierId === supplierId).map((u) => u.id);
const notifySupplier = (supplierId: string, title: string, body: string, href: string) =>
  pushNotification({ userIds: supplierUsers(supplierId) }, 'purchase_update', title, body, href);
const notifyBuyers = (title: string, body: string, href: string) => pushNotification({ roles: ['SUPERVISOR'] }, 'purchase_update', title, body, href);

function findPr(id: string) { const r = getDb().purchaseRequests.find((x) => x.id === id); if (!r) throw new Error('errors.purchasing.notFound'); return r; }
function findPo(id: string) { const o = getDb().purchaseOrders.find((x) => x.id === id); if (!o) throw new Error('errors.purchasing.notFound'); return o; }
function logPr(r: PurchaseRequest, status: PurchaseRequestStatus, by: string, note?: string) { r.status = status; r.timeline.push({ status, at: now(), by, note }); }
function logPo(o: PurchaseOrder, status: PurchaseOrderStatus, by: string, note?: string) { o.status = status; o.timeline.push({ status, at: now(), by, note }); }

export interface CatalogItem { product: Product; unitCost: number; low: boolean }
export interface PurchaseQuery { supplierId?: string; view?: 'open' | 'closed' | 'all' }
const OPEN_PR: PurchaseRequestStatus[] = ['submitted', 'changes_requested'];
const OPEN_PO: PurchaseOrderStatus[] = ['issued', 'acknowledged', 'pickup_confirmed', 'in_transit', 'partly_received'];

export const supplierService = {
  list: () => source<Supplier[]>(() => getDb().suppliers, () => http.get('/suppliers')),
  get: (id: string) => source<Supplier>(() => getDb().suppliers.find((s) => s.id === id)!, () => http.get(`/suppliers/${id}`)),
  /** Products a supplier can deliver, with our stock at the current site. Backend: GET /suppliers/:id/catalog */
  catalog: (supplierId: string) =>
    source<CatalogItem[]>(() => {
      const db = getDb();
      const sup = db.suppliers.find((s) => s.id === supplierId)!;
      return sup.productIds.map((pid) => atSite(db.products.find((p) => p.id === pid)!))
        .map((p) => ({ product: p, unitCost: unitCost(p), low: stockStatus(p) !== 'in_stock' }))
        .sort((a, b) => Number(b.low) - Number(a.low));
    }, () => http.get(`/suppliers/${supplierId}/catalog`)),
};

export const purchaseRequestService = {
  list: (q: PurchaseQuery = {}) =>
    source<PurchaseRequest[]>(() => getDb().purchaseRequests.filter((r) => inSite(r) && (!q.supplierId || r.supplierId === q.supplierId) &&
      (!q.view || q.view === 'all' || (q.view === 'open' ? OPEN_PR.includes(r.status) : !OPEN_PR.includes(r.status)))).sort((a, b) => b.date.localeCompare(a.date)),
    () => http.get('/purchase-requests', q)),

  get: (id: string) => source<PurchaseRequest>(() => findPr(id), () => http.get(`/purchase-requests/${id}`)),

  /** Supplier offers stock (pickup) or staff raise a request (internal). */
  create: (input: { supplierId: string; source: 'pickup' | 'internal'; items: { productId: string; quantity: number }[]; proposedDate?: string; notes?: string; actor: ActorRef }) =>
    source<PurchaseRequest>(() => {
      const db = getDb();
      const sup = db.suppliers.find((s) => s.id === input.supplierId)!;
      const lines = input.items.filter((i) => i.quantity > 0 && sup.productIds.includes(i.productId)).map((i) => lineFor(i.productId, i.quantity));
      if (!lines.length) throw new Error('errors.purchasing.empty');
      const seq = db.seq.pr++;
      const r: PurchaseRequest = {
        id: `pr_${seq}`, number: `PR-26-${String(seq).padStart(5, '0')}`, site: getCurrentSite() ?? undefined, supplierId: sup.id, supplierName: sup.name,
        source: input.source, createdBy: input.actor, date: now(), status: 'submitted', lines, total: total(lines), proposedDate: input.proposedDate, notes: input.notes, comments: [],
        timeline: [{ status: 'submitted', at: now(), by: input.actor.name, note: input.source === 'pickup' ? 'Pickup offered by supplier' : undefined }],
      };
      db.purchaseRequests.unshift(r);
      db.activity.unshift({ id: uid('act'), at: now(), actor: input.actor.name, text: `${input.source === 'pickup' ? 'offered pickup' : 'raised purchase request'} ${r.number} (${sup.name})`, kind: 'order' });
      if (input.source === 'pickup') notifyBuyers(`Pickup offered by ${sup.name}`, `${r.number} – ${lines.length} items`, `/purchase-requests/${r.id}`);
      commit();
      return r;
    }, () => http.post('/purchase-requests', input)),

  /** Convert to a purchase order in the ERP. Idempotent: a converted request returns its existing PO. */
  convert: (id: string, actor: ActorRef, expectedDate: string) =>
    source<PurchaseRequest>(() => {
      const db = getDb();
      const r = findPr(id);
      if (r.status === 'converted') return r;
      if (!OPEN_PR.includes(r.status)) throw new Error('errors.purchasing.notOpen');
      const seq = db.seq.po++;
      const o: PurchaseOrder = {
        id: `po_${seq}`, number: `PO-26-${String(seq).padStart(5, '0')}`, site: r.site, supplierId: r.supplierId, supplierName: r.supplierName, requestId: r.id, requestNumber: r.number,
        date: now(), expectedDate, status: r.source === 'pickup' ? 'acknowledged' : 'issued', lines: r.lines.map((l) => ({ ...l, receivedQty: 0 })), total: r.total, receipts: [], erpRef: `POH${410000 + seq}`,
        timeline: [{ status: 'issued', at: now(), by: actor.name, note: `Created from ${r.number} in Sage X3 (mock)` }],
      };
      // a supplier's own pickup offer needs no separate acknowledgement
      if (r.source === 'pickup') o.timeline.push({ status: 'acknowledged', at: now(), by: r.createdBy.name, note: 'Offered by the supplier' });
      db.purchaseOrders.unshift(o);
      r.orderId = o.id; r.orderNumber = o.number;
      logPr(r, 'converted', actor.name, `Purchase order ${o.number} created`);
      notifySupplier(r.supplierId, `Purchase order ${o.number}`, r.source === 'pickup' ? `Your pickup ${r.number} is accepted. Confirm the pickup details.` : `New purchase order from us. Please acknowledge it.`, `/purchase-orders/${o.id}`);
      db.activity.unshift({ id: uid('act'), at: now(), actor: actor.name, text: `converted ${r.number} to ${o.number}`, kind: 'approval' });
      commit();
      return r;
    }, () => http.post(`/purchase-requests/${id}/convert`, { expectedDate })),

  review: (id: string, decision: 'changes' | 'reject', actor: ActorRef, comment: string) =>
    source<PurchaseRequest>(() => {
      const r = findPr(id);
      if (!OPEN_PR.includes(r.status)) throw new Error('errors.purchasing.notOpen');
      if (!comment.trim()) throw new Error('errors.requests.commentRequired');
      r.comments.push({ by: actor.name, at: now(), text: comment });
      logPr(r, decision === 'reject' ? 'rejected' : 'changes_requested', actor.name, comment);
      if (r.source === 'pickup') notifySupplier(r.supplierId, decision === 'reject' ? `Pickup ${r.number} declined` : `Changes requested on ${r.number}`, comment.slice(0, 90), `/purchase-requests/${r.id}`);
      commit();
      return r;
    }, () => http.post(`/purchase-requests/${id}/${decision === 'reject' ? 'reject' : 'request-changes'}`, { comment })),

  cancel: (id: string, actor: ActorRef) =>
    source<PurchaseRequest>(() => { const r = findPr(id); if (!OPEN_PR.includes(r.status)) throw new Error('errors.purchasing.notOpen'); logPr(r, 'cancelled', actor.name); commit(); return r; },
      () => http.post(`/purchase-requests/${id}/cancel`)),

  comment: (id: string, actor: ActorRef, text: string) =>
    source<PurchaseRequest>(() => { const r = findPr(id); r.comments.push({ by: actor.name, at: now(), text }); commit(); return r; }, () => http.post(`/purchase-requests/${id}/comments`, { text })),

  /** Items at or below reorder level at the current site that a supplier can deliver (to prefill an internal request). */
  lowStock: (supplierId: string) =>
    source<{ productId: string; suggested: number }[]>(() => {
      const db = getDb();
      const sup = db.suppliers.find((s) => s.id === supplierId)!;
      return sup.productIds.map((pid) => atSite(db.products.find((p) => p.id === pid)!)).filter((p) => stockStatus(p) !== 'in_stock')
        .map((p) => ({ productId: p.id, suggested: Math.max(p.moq * 10, 50) }));
    }, () => http.get(`/suppliers/${supplierId}/reorder-suggestions`)),
};

export const purchaseOrderService = {
  list: (q: PurchaseQuery = {}) =>
    source<PurchaseOrder[]>(() => getDb().purchaseOrders.filter((o) => inSite(o) && (!q.supplierId || o.supplierId === q.supplierId) &&
      (!q.view || q.view === 'all' || (q.view === 'open' ? OPEN_PO.includes(o.status) : !OPEN_PO.includes(o.status)))).sort((a, b) => b.date.localeCompare(a.date)),
    () => http.get('/purchase-orders', q)),

  get: (id: string) => source<PurchaseOrder>(() => findPo(id), () => http.get(`/purchase-orders/${id}`)),

  /** Supplier accepts the order. */
  acknowledge: (id: string, actor: ActorRef) =>
    source<PurchaseOrder>(() => {
      const o = findPo(id);
      if (o.status !== 'issued') throw new Error('errors.purchasing.notOpen');
      logPo(o, 'acknowledged', actor.name);
      notifyBuyers(`${o.number} acknowledged`, `${o.supplierName} accepted the order`, `/purchase-orders/${o.id}`);
      commit(); return o;
    }, () => http.post(`/purchase-orders/${id}/acknowledge`)),

  /** Supplier confirms when and how the goods leave. */
  confirmPickup: (id: string, actor: ActorRef, pickup: NonNullable<PurchaseOrder['pickup']>) =>
    source<PurchaseOrder>(() => {
      const o = findPo(id);
      if (!['acknowledged', 'pickup_confirmed'].includes(o.status)) throw new Error('errors.purchasing.notOpen');
      if (!pickup.date || !pickup.vehicle.trim()) throw new Error('errors.purchasing.pickupDetails');
      o.pickup = pickup;
      if (o.status !== 'pickup_confirmed') logPo(o, 'pickup_confirmed', actor.name, `${pickup.vehicle}${pickup.driver ? ` · ${pickup.driver}` : ''}`);
      notifyBuyers(`Pickup confirmed for ${o.number}`, `${o.supplierName}: ${new Date(pickup.date).toDateString()}, ${pickup.vehicle}`, `/purchase-orders/${o.id}`);
      commit(); return o;
    }, () => http.post(`/purchase-orders/${id}/pickup`, pickup)),

  /** Supplier: goods have left. */
  dispatch: (id: string, actor: ActorRef) =>
    source<PurchaseOrder>(() => {
      const o = findPo(id);
      if (o.status !== 'pickup_confirmed') throw new Error('errors.purchasing.notOpen');
      logPo(o, 'in_transit', actor.name);
      notifyBuyers(`${o.number} in transit`, `${o.supplierName} dispatched the goods`, `/purchase-orders/${o.id}`);
      commit(); return o;
    }, () => http.post(`/purchase-orders/${id}/dispatch`)),

  /** Warehouse goods receipt (GRN). Adds stock at the PO's site. Partial receipts keep the order open. */
  receive: (id: string, actor: ActorRef, lines: { productId: string; quantity: number }[]) =>
    source<PurchaseOrder>(() => {
      const db = getDb();
      const o = findPo(id);
      if (!['in_transit', 'partly_received'].includes(o.status)) throw new Error('errors.purchasing.notOpen');
      const take = lines.map((l) => {
        const line = o.lines.find((x) => x.productId === l.productId)!;
        return { productId: l.productId, quantity: Math.max(0, Math.min(l.quantity, line.quantity - line.receivedQty)) };
      }).filter((l) => l.quantity > 0);
      if (!take.length) throw new Error('errors.purchasing.nothingToReceive');
      take.forEach((l) => {
        o.lines.find((x) => x.productId === l.productId)!.receivedQty += l.quantity;
        const p = db.products.find((x) => x.id === l.productId)!;
        if (o.site && p.stockBySite) p.stockBySite[o.site] = (p.stockBySite[o.site] ?? 0) + l.quantity;
      });
      const grn = { id: `grn_${db.seq.grn}`, number: `GRN-26-${String(db.seq.grn++).padStart(5, '0')}`, at: now(), by: actor.name, lines: take };
      o.receipts.push(grn);
      const done = o.lines.every((l) => l.receivedQty >= l.quantity);
      logPo(o, done ? 'received' : 'partly_received', actor.name, `${grn.number}`);
      notifySupplier(o.supplierId, `Goods received for ${o.number}`, `${grn.number}${done ? '' : ' (part)'}`, `/purchase-orders/${o.id}`);
      db.activity.unshift({ id: uid('act'), at: now(), actor: actor.name, text: `received ${grn.number} for ${o.number}`, kind: 'order' });
      commit(); return o;
    }, () => http.post(`/purchase-orders/${id}/receipts`, { lines })),

  cancel: (id: string, actor: ActorRef, reason: string) =>
    source<PurchaseOrder>(() => {
      const o = findPo(id);
      if (!['issued', 'acknowledged'].includes(o.status)) throw new Error('errors.purchasing.notOpen');
      logPo(o, 'cancelled', actor.name, reason);
      notifySupplier(o.supplierId, `${o.number} cancelled`, reason.slice(0, 90), `/purchase-orders/${o.id}`);
      commit(); return o;
    }, () => http.post(`/purchase-orders/${id}/cancel`, { reason })),
};

export const DEFAULT_EXPECTED_DAYS = 5;
export const expectedDefault = () => new Date(Date.now() + DEFAULT_EXPECTED_DAYS * DAY).toISOString().slice(0, 10);
