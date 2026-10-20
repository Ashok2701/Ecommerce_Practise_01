import { source, http } from '@/lib/api/httpClient';
import { getDb, commit, uid, atSite } from '@/lib/data/mockDb';
import { getCurrentSite } from '@/lib/sites/current';
import { stockStatus } from '@/lib/domain/pricing';
import { pushNotification } from './notificationService';
import { requestService } from './requestService';
import {
  OPEN_TRANSFER,
  type ActorRef, type Consignment, type ConsignmentLine, type SalesRequest, type StockDetail, type StockPosition, type StockTransfer, type TransferStatus,
} from '@/types/domain';

/**
 * Inventory
 * ---------
 * Stock positions per site, customer consignment stock and transfers between
 * sites. In the backend these come from the ERP (Sage X3: STOCK, STOALL,
 * consignment locations, inter-site transfers); the portal never adjusts
 * stock directly – every movement is a document the ERP posts.
 *
 * Mock model, per product and site:
 *   stockBySite[site]  = free stock (already net of open sales orders)
 *   allocated          = open sales order lines not shipped yet
 *   on hand            = free + allocated
 *   held               = submitted requests while the stock-hold setting applies
 *   available          = free − held
 *   incoming           = purchase orders in transit + transfers on the way
 *   consignment        = customer stock at consignment locations (separate)
 */
const now = () => new Date().toISOString();
const ALLOCATED_STATUSES = ['confirmed', 'processing', 'packed'];
const OPEN_REQ = ['submitted', 'changes_requested', 'approved', 'partly_converted'];
const isManager = (a: ActorRef) => a.role === 'SUPERVISOR' || a.role === 'ADMIN';

/* ---------------- positions ---------------- */

function heldFor(site: string) {
  const t = Date.now();
  return getDb().requests.filter((r) => r.site === site && !r.consignmentId && OPEN_REQ.includes(r.status) && r.holdUntil && new Date(r.holdUntil).getTime() > t);
}
const openQty = (r: SalesRequest, productId: string) => r.lines.filter((l) => l.productId === productId).reduce((s, l) => s + l.quantity - l.convertedQty, 0);

function detailFor(productId: string, site: string): StockDetail {
  const db = getDb();
  const allocated = db.orders.filter((o) => o.site === site && ALLOCATED_STATUSES.includes(o.status))
    .flatMap((o) => o.lines.filter((l) => l.productId === productId).map((l) => ({ orderId: o.id, number: o.number, customerName: o.customerName, quantity: l.quantity, status: o.status })));
  const held = heldFor(site).map((r) => ({ requestId: r.id, number: r.number, customerName: r.customerName, quantity: openQty(r, productId), until: r.holdUntil! })).filter((h) => h.quantity > 0);
  const incoming = [
    ...db.purchaseOrders.filter((o) => o.site === site && ['in_transit', 'partly_received'].includes(o.status))
      .flatMap((o) => o.lines.filter((l) => l.productId === productId && l.quantity > l.receivedQty)
        .map((l) => ({ kind: 'po' as const, id: o.id, number: o.number, from: o.supplierName, quantity: l.quantity - l.receivedQty, status: o.status, expected: o.expectedDate }))),
    ...db.transfers.filter((x) => x.toSite === site && x.status === 'initiated')
      .flatMap((x) => x.lines.filter((l) => l.productId === productId).map((l) => ({ kind: 'transfer' as const, id: x.id, number: x.number, from: x.fromSite, quantity: l.quantity, status: x.status, expected: x.neededBy }))),
  ];
  const consignment = db.consignments.filter((c) => c.site === site)
    .flatMap((c) => c.lines.filter((l) => l.productId === productId && l.quantity > 0).map((l) => ({ id: c.id, number: c.number, customerName: c.customerName, location: c.location, quantity: l.quantity })));
  const otherSites = db.sites.filter((s) => s.code !== site).map((s) => ({ site: s.code, available: freeAt(productId, s.code) }));
  return { allocated, held, incoming, consignment, otherSites };
}

/** Free-to-promise at a site (free stock minus holds). */
function freeAt(productId: string, site: string) {
  const p = getDb().products.find((x) => x.id === productId)!;
  const free = p.stockBySite?.[site] ?? 0;
  const held = heldFor(site).reduce((s, r) => s + openQty(r, productId), 0);
  return Math.max(0, free - held);
}

function positionFor(productId: string, site: string): StockPosition {
  const db = getDb();
  const raw = db.products.find((x) => x.id === productId)!;
  const d = detailFor(productId, site);
  const free = raw.stockBySite?.[site] ?? raw.stock;
  const allocated = d.allocated.reduce((s, x) => s + x.quantity, 0);
  const held = d.held.reduce((s, x) => s + x.quantity, 0);
  const available = Math.max(0, free - held);
  const product = atSite(raw, site);
  return {
    product, onHand: free + allocated, allocated, held, available,
    incoming: d.incoming.reduce((s, x) => s + x.quantity, 0),
    consignment: d.consignment.reduce((s, x) => s + x.quantity, 0),
    low: stockStatus({ ...product, stock: available }) !== 'in_stock',
  };
}

export type StockFilter = 'all' | 'low' | 'reserved' | 'incoming' | 'consignment';
export interface StockQuery { search?: string; category?: string; filter?: StockFilter }

const siteOrMain = () => getCurrentSite() ?? 'MAIN';

export const inventoryService = {
  /** Backend: GET /inventory?site=…&search=…&category=…&filter=… */
  positions: (q: StockQuery = {}) =>
    source<StockPosition[]>(() => {
      const site = siteOrMain();
      const s = q.search?.trim().toLowerCase() ?? '';
      return getDb().products.map((p) => positionFor(p.id, site)).filter((x) =>
        (!s || [x.product.name, x.product.sku, x.product.brand].some((v) => v.toLowerCase().includes(s))) &&
        (!q.category || x.product.category === q.category) &&
        (!q.filter || q.filter === 'all' || (q.filter === 'low' ? x.low : q.filter === 'reserved' ? x.allocated + x.held > 0 : q.filter === 'incoming' ? x.incoming > 0 : x.consignment > 0)))
        .sort((a, b) => Number(b.low) - Number(a.low) || a.product.name.localeCompare(b.product.name));
    }, () => http.get('/inventory', q)),

  /** Backend: GET /inventory/{productId}?site=… */
  detail: (productId: string) =>
    source<{ position: StockPosition; detail: StockDetail }>(() => ({ position: positionFor(productId, siteOrMain()), detail: detailFor(productId, siteOrMain()) }),
      () => http.get(`/inventory/${productId}`)),

  /** Free-to-promise at a site; used by the transfer form. */
  availableAt: (productId: string, site: string) => source<number>(() => freeAt(productId, site), () => http.get(`/inventory/${productId}/available`, { site })),

  /** Free-to-promise of every product at two sites. Backend: GET /inventory/availability?sites=A,B */
  availability: (sites: string[]) =>
    source<Record<string, Record<string, number>>>(() => Object.fromEntries(getDb().products.map((p) => [p.id, Object.fromEntries(sites.map((st) => [st, freeAt(p.id, st)]))])),
      () => http.get('/inventory/availability', { sites: sites.join(',') })),
};

/* ---------------- consignment ---------------- */

export interface ConsignmentLineView extends ConsignmentLine { reserved: number; available: number; low: boolean }
export interface ConsignmentView extends Omit<Consignment, 'lines'> { lines: ConsignmentLineView[]; openCallOffs: { id: string; number: string; status: string; date: string }[] }

function findCons(id: string) { const c = getDb().consignments.find((x) => x.id === id); if (!c) throw new Error('errors.consignment.notFound'); return c; }

function viewOf(c: Consignment): ConsignmentView {
  const open = getDb().requests.filter((r) => r.consignmentId === c.id && OPEN_REQ.includes(r.status));
  return {
    ...c,
    lines: c.lines.map((l) => {
      const reserved = open.reduce((s, r) => s + openQty(r, l.productId), 0);
      return { ...l, reserved, available: Math.max(0, l.quantity - reserved), low: l.quantity < l.minQty };
    }),
    openCallOffs: open.map((r) => ({ id: r.id, number: r.number, status: r.status, date: r.date })),
  };
}

export const consignmentService = {
  /** Customers see their own; staff see all at the site. Backend: GET /consignments */
  list: (q: { customerId?: string } = {}) =>
    source<ConsignmentView[]>(() => {
      const site = getCurrentSite();
      return getDb().consignments.filter((c) => (!site || c.site === site) && (!q.customerId || c.customerId === q.customerId)).map(viewOf);
    }, () => http.get('/consignments', q)),

  get: (id: string) => source<ConsignmentView>(() => viewOf(findCons(id)), () => http.get(`/consignments/${id}`)),

  /** Customer (or their rep) calls stock off: raises a Sales Request against the consignment. */
  callOff: (input: { consignmentId: string; items: { productId: string; quantity: number }[]; poNumber?: string; notes?: string; actor: ActorRef }) =>
    source<SalesRequest>(async () => {
      const c = findCons(input.consignmentId);
      return requestService.submit({ customerId: c.customerId, items: input.items, poNumber: input.poNumber, notes: input.notes, actor: input.actor, consignmentId: c.id });
    }, () => http.post(`/consignments/${input.consignmentId}/call-offs`, input)),

  /** Warehouse moves free stock into the consignment location. Backend posts a location transfer in the ERP. */
  topUp: (id: string, actor: ActorRef, items: { productId: string; quantity: number }[]) =>
    source<ConsignmentView>(() => {
      if (!isManager(actor)) throw new Error('errors.forbidden');
      const db = getDb();
      const c = findCons(id);
      const take = items.filter((i) => i.quantity > 0);
      if (!take.length) throw new Error('errors.consignment.empty');
      for (const i of take) if (freeAt(i.productId, c.site) < i.quantity) throw new Error('errors.consignment.noFreeStock');
      take.forEach((i) => {
        const p = db.products.find((x) => x.id === i.productId)!;
        p.stockBySite![c.site] = (p.stockBySite![c.site] ?? 0) - i.quantity;
        c.lines.find((l) => l.productId === i.productId)!.quantity += i.quantity;
        c.movements.unshift({ id: uid('cm'), at: now(), by: actor.name, kind: 'top_up', productId: i.productId, quantity: i.quantity });
      });
      const users = db.users.filter((u) => u.customerId === c.customerId).map((u) => u.id);
      pushNotification({ userIds: users }, 'stock_update', `Consignment ${c.number} topped up`, `${take.length} item(s) added at ${c.location}`, `/consignment/${c.id}`);
      commit();
      return viewOf(c);
    }, () => http.post(`/consignments/${id}/top-ups`, { items })),
};

/* ---------------- transfers ---------------- */

function findTr(id: string) { const t = getDb().transfers.find((x) => x.id === id); if (!t) throw new Error('errors.transfers.notFound'); return t; }
function logTr(t: StockTransfer, status: TransferStatus, by: string, note?: string) { t.status = status; t.timeline.push({ status, at: now(), by, note }); }
const notifyManagers = (title: string, body: string, href: string) => pushNotification({ roles: ['SUPERVISOR'] }, 'stock_update', title, body, href);
const notifyCreator = (t: StockTransfer, title: string, body: string) => pushNotification({ userIds: [t.createdBy.id] }, 'stock_update', title, body, `/transfers/${t.id}`);

export interface TransferQuery { view?: 'open' | 'closed' | 'all'; direction?: 'in' | 'out' }

export const transferService = {
  /** Transfers into or out of the current site. Backend: GET /transfers */
  list: (q: TransferQuery = {}) =>
    source<StockTransfer[]>(() => {
      const site = getCurrentSite();
      return getDb().transfers.filter((t) =>
        (!site || (q.direction === 'in' ? t.toSite === site : q.direction === 'out' ? t.fromSite === site : t.toSite === site || t.fromSite === site)) &&
        (!q.view || q.view === 'all' || (q.view === 'open' ? OPEN_TRANSFER.includes(t.status) : !OPEN_TRANSFER.includes(t.status))))
        .sort((a, b) => b.date.localeCompare(a.date));
    }, () => http.get('/transfers', q)),

  get: (id: string) => source<StockTransfer>(() => findTr(id), () => http.get(`/transfers/${id}`)),

  create: (input: { fromSite: string; toSite: string; items: { productId: string; quantity: number }[]; reason: string; neededBy?: string; actor: ActorRef }) =>
    source<StockTransfer>(() => {
      const db = getDb();
      if (input.fromSite === input.toSite) throw new Error('errors.transfers.sameSite');
      if (!input.reason.trim()) throw new Error('errors.transfers.reasonRequired');
      const lines = input.items.filter((i) => i.quantity > 0).map((i) => {
        const p = db.products.find((x) => x.id === i.productId)!;
        return { productId: p.id, sku: p.sku, name: p.name, uom: p.uom, quantity: i.quantity, receivedQty: 0 };
      });
      if (!lines.length) throw new Error('errors.transfers.empty');
      const n = db.seq.transfer++;
      const t: StockTransfer = {
        id: `tr_${n}`, number: `TR-26-${String(n).padStart(5, '0')}`, fromSite: input.fromSite, toSite: input.toSite, status: 'pending', lines,
        reason: input.reason.trim(), neededBy: input.neededBy, createdBy: input.actor, date: now(), comments: [],
        timeline: [{ status: 'pending', at: now(), by: input.actor.name }],
      };
      db.transfers.unshift(t);
      notifyManagers(`Transfer request ${t.number}`, `${t.fromSite} → ${t.toSite}: ${lines.length} item(s)`, `/transfers/${t.id}`);
      db.activity.unshift({ id: uid('act'), at: now(), actor: input.actor.name, text: `requested transfer ${t.number} (${t.fromSite} → ${t.toSite})`, kind: 'order' });
      commit();
      return t;
    }, () => http.post('/transfers', input)),

  approve: (id: string, actor: ActorRef) =>
    source<StockTransfer>(() => {
      if (!isManager(actor)) throw new Error('errors.forbidden');
      const t = findTr(id);
      if (t.status !== 'pending') throw new Error('errors.transfers.notOpen');
      logTr(t, 'approved', actor.name);
      notifyCreator(t, `Transfer ${t.number} approved`, `${t.fromSite} will ship to ${t.toSite}.`);
      commit(); return t;
    }, () => http.post(`/transfers/${id}/approve`)),

  reject: (id: string, actor: ActorRef, comment: string) =>
    source<StockTransfer>(() => {
      if (!isManager(actor)) throw new Error('errors.forbidden');
      const t = findTr(id);
      if (!['pending', 'approved'].includes(t.status)) throw new Error('errors.transfers.notOpen');
      if (!comment.trim()) throw new Error('errors.requests.commentRequired');
      logTr(t, 'rejected', actor.name, comment.trim());
      notifyCreator(t, `Transfer ${t.number} rejected`, comment.trim().slice(0, 90));
      commit(); return t;
    }, () => http.post(`/transfers/${id}/reject`, { comment })),

  /** Source site ships: stock leaves the source and is in transit. */
  initiate: (id: string, actor: ActorRef) =>
    source<StockTransfer>(() => {
      if (!isManager(actor)) throw new Error('errors.forbidden');
      const db = getDb();
      const t = findTr(id);
      if (t.status !== 'approved') throw new Error('errors.transfers.notOpen');
      for (const l of t.lines) if (freeAt(l.productId, t.fromSite) < l.quantity) throw new Error('errors.transfers.noStock');
      t.lines.forEach((l) => { const p = db.products.find((x) => x.id === l.productId)!; p.stockBySite![t.fromSite] = (p.stockBySite![t.fromSite] ?? 0) - l.quantity; });
      t.erpRef = `STR${520000 + Number(t.id.split('_')[1])}`;
      logTr(t, 'initiated', actor.name, t.erpRef);
      notifyManagers(`Transfer ${t.number} on the way`, `${t.fromSite} → ${t.toSite}`, `/transfers/${t.id}`);
      commit(); return t;
    }, () => http.post(`/transfers/${id}/initiate`)),

  /** Destination receives. Short receipts are recorded; the difference stays with the source for investigation. */
  receive: (id: string, actor: ActorRef, lines: { productId: string; quantity: number }[]) =>
    source<StockTransfer>(() => {
      if (!isManager(actor)) throw new Error('errors.forbidden');
      const db = getDb();
      const t = findTr(id);
      if (t.status !== 'initiated') throw new Error('errors.transfers.notOpen');
      t.lines.forEach((l) => {
        const q = Math.max(0, Math.min(l.quantity, lines.find((x) => x.productId === l.productId)?.quantity ?? l.quantity));
        l.receivedQty = q;
        const p = db.products.find((x) => x.id === l.productId)!;
        p.stockBySite![t.toSite] = (p.stockBySite![t.toSite] ?? 0) + q;
      });
      const short = t.lines.filter((l) => l.receivedQty < l.quantity).length;
      logTr(t, 'transferred', actor.name, short ? `${short} line(s) short` : undefined);
      notifyCreator(t, `Transfer ${t.number} received at ${t.toSite}`, short ? `${short} line(s) arrived short` : 'All quantities received');
      commit(); return t;
    }, () => http.post(`/transfers/${id}/receive`, { lines })),

  /** Close after checking; the ERP posts the transfer. */
  complete: (id: string, actor: ActorRef) =>
    source<StockTransfer>(() => {
      if (!isManager(actor)) throw new Error('errors.forbidden');
      const t = findTr(id);
      if (t.status !== 'transferred') throw new Error('errors.transfers.notOpen');
      logTr(t, 'completed', actor.name);
      commit(); return t;
    }, () => http.post(`/transfers/${id}/complete`)),

  cancel: (id: string, actor: ActorRef) =>
    source<StockTransfer>(() => {
      const t = findTr(id);
      if (!['pending', 'approved'].includes(t.status)) throw new Error('errors.transfers.notOpen');
      if (t.createdBy.id !== actor.id && !isManager(actor)) throw new Error('errors.forbidden');
      logTr(t, 'cancelled', actor.name);
      commit(); return t;
    }, () => http.post(`/transfers/${id}/cancel`)),

  comment: (id: string, actor: ActorRef, text: string) =>
    source<StockTransfer>(() => { const t = findTr(id); if (text.trim()) t.comments.push({ by: actor.name, at: now(), text: text.trim() }); commit(); return t; },
      () => http.post(`/transfers/${id}/comments`, { text })),
};
