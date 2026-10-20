import { source, http } from '@/lib/api/httpClient';
import { getDb, commit, uid, atSite, inSite } from '@/lib/data/mockDb';
import { getCurrentSite } from '@/lib/sites/current';
import { buildOrderTotals } from '@/lib/domain/pricing';
import { creditCheck } from '@/lib/domain/credit';
import { pushNotification } from './notificationService';
import { OPEN_REQUEST, REVIEWABLE_REQUEST } from '@/types/domain';
import type { ActorRef, Order, RequestStatus, SalesRequest, WorkflowSettings } from '@/types/domain';

/**
 * Sales requests (request-first ordering)
 * ---------------------------------------
 * Nothing in the portal creates a sales order directly. Checkout, quick order,
 * reorder and rep orders all submit a Sales Request; a supervisor (or an
 * auto-approval rule) converts it, and only then is the sales order created in
 * the ERP. See docs/API_CONTRACT.md for the backend endpoints.
 */
export interface SubmitInput {
  customerId: string;
  items: { productId: string; quantity: number }[];
  notes?: string;
  poNumber?: string;
  actor: ActorRef;
  offline?: boolean;
}
export interface RequestQuery { customerId?: string; salesRepId?: string; view?: 'open' | 'review' | 'closed' | 'all'; search?: string; }
export interface ConvertOptions {
  /** Approve although the customer is over the credit limit or on hold (warn mode). */
  overrideCredit?: boolean;
  overrideReason?: string;
  /** The requester accepted today's prices (required when they changed since submission). */
  acceptPriceChange?: boolean;
  /** Convert only what is in stock now; the rest stays open on the request. */
  onlyAvailable?: boolean;
  /** Same key = same result; a retry or double click never creates a second order. */
  idempotencyKey: string;
}
export interface ConversionPreview {
  lines: { productId: string; name: string; sku: string; uom: string; open: number; stock: number; priceThen: number; priceNow: number }[];
  totalThen: number;
  totalNow: number;
  priceChanged: boolean;
  shortLines: number;
  creditIssue: boolean;
}

const SYSTEM: ActorRef = { id: 'system', name: 'Automatic approval', role: 'ADMIN' };
const now = () => new Date().toISOString();
const DAY = 86400000;
const usedKeys = new Map<string, string>(); // idempotencyKey -> request id (mock)

function find(id: string) {
  const r = getDb().requests.find((x) => x.id === id);
  if (!r) throw new Error('errors.requests.notFound');
  return r;
}

function log(r: SalesRequest, status: RequestStatus, by: string, note?: string) {
  r.status = status;
  r.timeline.push({ status, at: now(), by, note });
}

/** Expired requests are closed on read, so lists are always current. */
function expire(r: SalesRequest) {
  if (r.expiresAt && ['submitted', 'changes_requested', 'approved'].includes(r.status) && new Date(r.expiresAt).getTime() < Date.now()) {
    log(r, 'expired', 'System', 'Not converted before the expiry date');
  }
  return r;
}

const notifyRequester = (r: SalesRequest, title: string, body: string) =>
  pushNotification({ userIds: [r.createdBy.id, r.salesRepId].filter(Boolean) }, 'request_update', title, body, `/requests/${r.id}`);

function creditMode(w: WorkflowSettings, customerId: string) { return w.creditOverrides[customerId] ?? w.creditMode; }

/** Remaining (not yet converted) lines priced at today's prices for the request's site. */
function priceNow(r: SalesRequest) {
  const db = getDb();
  const cust = db.customers.find((c) => c.id === r.customerId)!;
  const items = r.lines.filter((l) => l.quantity > l.convertedQty)
    .map((l) => ({ product: atSite(db.products.find((p) => p.id === l.productId)!, r.site), quantity: l.quantity - l.convertedQty }));
  return buildOrderTotals(items, cust, db.offers);
}

function preview(r: SalesRequest): ConversionPreview {
  const db = getDb();
  const now_ = priceNow(r);
  const lines = r.lines.filter((l) => l.quantity > l.convertedQty).map((l) => {
    const raw = db.products.find((p) => p.id === l.productId)!;
    const stock = r.site && raw.stockBySite ? raw.stockBySite[r.site] ?? 0 : raw.stock;
    const priceNowLine = now_.lines.find((x) => x.productId === l.productId);
    return { productId: l.productId, name: l.name, sku: l.sku, uom: l.uom, open: l.quantity - l.convertedQty, stock, priceThen: l.unitPrice, priceNow: priceNowLine?.unitPrice ?? l.unitPrice };
  });
  // indicative total of the open lines, including tax at the rate used on submission
  const allLines = r.lines.reduce((s, l) => s + l.lineTotal, 0);
  const open = r.lines.reduce((s, l) => s + (l.lineTotal * (l.quantity - l.convertedQty)) / l.quantity, 0);
  const totalThen = open * (allLines ? (allLines + r.tax) / allLines : 1);
  const priceChanged = lines.some((l) => Math.abs(l.priceNow - l.priceThen) > 0.009);
  return {
    lines, totalThen: Math.round(totalThen * 100) / 100, totalNow: now_.total, priceChanged,
    shortLines: lines.filter((l) => l.stock < l.open).length,
    creditIssue: !!r.credit && (r.credit.over || r.credit.onHold) && !r.creditOverride,
  };
}

/** Create the sales order (mock ERP) for the remaining lines, or the in-stock part of them. */
function convertNow(r: SalesRequest, actor: ActorRef, opts: Omit<ConvertOptions, 'idempotencyKey'>): SalesRequest {
  const db = getDb();
  if (!['submitted', 'approved', 'partly_converted'].includes(r.status)) throw new Error('errors.requests.notOpen');
  const p = preview(r);
  if (p.creditIssue && !opts.overrideCredit) throw new Error('errors.requests.creditOverrideNeeded');
  if (p.priceChanged && !opts.acceptPriceChange) throw new Error('errors.requests.priceChanged');
  if (p.creditIssue && opts.overrideCredit) r.creditOverride = { by: actor.name, at: now(), reason: opts.overrideReason ?? '' };

  const cust = db.customers.find((c) => c.id === r.customerId)!;
  const take = p.lines.map((l) => ({ ...l, qty: opts.onlyAvailable ? Math.min(l.open, Math.max(0, l.stock)) : l.open })).filter((l) => l.qty > 0);
  if (!take.length) throw new Error('errors.requests.nothingInStock');
  const items = take.map((l) => ({ product: atSite(db.products.find((x) => x.id === l.productId)!, r.site), quantity: l.qty }));
  const totals = buildOrderTotals(items, cust, db.offers);
  const seq = db.seq.order++;
  const at = now();
  const order: Order = {
    id: `ord_${seq}`, number: `SO-26-${String(seq).padStart(5, '0')}`, site: r.site, requestId: r.id, requestNumber: r.number,
    customerId: r.customerId, customerName: r.customerName, salesRepId: r.salesRepId, createdBy: r.createdBy, source: r.source,
    date: at, expectedDelivery: new Date(Date.now() + 4 * DAY).toISOString(), status: 'confirmed', ...totals,
    poNumber: r.poNumber, notes: r.notes, deliveryAddress: r.deliveryAddress, billingAddress: r.billingAddress, comments: [],
    timeline: [{ status: 'confirmed', at, by: actor.name, note: `Created from request ${r.number} in Sage X3 (mock)` }],
    erpRef: `SOH${260000 + seq}`,
  };
  db.orders.unshift(order);
  // stock leaves the site
  take.forEach((l) => { const raw = db.products.find((x) => x.id === l.productId)!; if (r.site && raw.stockBySite) raw.stockBySite[r.site] = Math.max(0, (raw.stockBySite[r.site] ?? 0) - l.qty); });
  take.forEach((l) => { const line = r.lines.find((x) => x.productId === l.productId)!; line.convertedQty += l.qty; });
  r.orderIds.push(order.id); r.orderNumbers.push(order.number);
  r.holdUntil = undefined;
  const done = r.lines.every((l) => l.convertedQty >= l.quantity);
  if (r.status === 'submitted') r.timeline.push({ status: 'approved', at, by: actor.name, note: actor.id === SYSTEM.id ? 'Within auto-approval rules' : opts.overrideCredit ? 'Approved with credit override' : undefined });
  log(r, done ? 'converted' : 'partly_converted', actor.name, done ? `Sales order ${order.number} created` : `Sales order ${order.number} created for the lines in stock; the rest stays open`);
  db.activity.unshift({ id: uid('act'), at, actor: actor.name, text: `converted request ${r.number} to order ${order.number}`, kind: 'approval' });
  notifyRequester(r, done ? `Order ${order.number} confirmed` : `Order ${order.number} confirmed (part)`, `Your request ${r.number} is now sales order ${order.number}.`);
  return r;
}

function submitDraft(r: SalesRequest, actor: ActorRef) {
  const db = getDb();
  const w = db.workflow;
  const cust = db.customers.find((c) => c.id === r.customerId)!;
  const cc = cust.type === 'B2B' ? creditCheck({ id: r.id, total: r.total }, cust, db.orders) : null;
  if (cc && (cc.over || cc.onHold) && creditMode(w, cust.id) === 'block') throw new Error(cc.onHold ? 'errors.requests.accountOnHold' : 'errors.requests.creditBlocked');
  r.credit = cc ? { over: cc.over, onHold: cc.onHold, exceededBy: cc.exceededBy, available: cc.available } : undefined;
  if (r.number.startsWith('DRAFT')) r.number = `SR-26-${String(db.seq.request++).padStart(5, '0')}`;
  const at = Date.now();
  r.expiresAt = w.requestExpiryDays ? new Date(at + w.requestExpiryDays * DAY).toISOString() : undefined;
  r.holdUntil = w.stockHoldHours ? new Date(at + w.stockHoldHours * 3600000).toISOString() : undefined;
  log(r, 'submitted', actor.name, r.source === 'offline' ? 'Synced from device' : 'Submitted for review');

  const auto = cust.type === 'B2C' ? w.b2cAutoConvert && r.paid
    : w.autoApprove.enabled && r.total <= w.autoApprove.maxTotal && !r.credit?.over && !r.credit?.onHold && cust.status === 'active';
  if (auto) {
    r.autoApproved = true;
    try { return convertNow(r, SYSTEM, { acceptPriceChange: true }); } catch { /* fall through to review (e.g. nothing in stock) */ }
  }
  const flag = r.credit?.over || r.credit?.onHold;
  pushNotification({ roles: ['SUPERVISOR'] }, 'approval_required', flag ? 'Credit check on new request' : 'New sales request', `${r.number} from ${r.customerName} – ${r.lines.length} items`, `/approvals?request=${r.id}`);
  return r;
}

export const requestService = {
  list: (q: RequestQuery = {}) =>
    source<SalesRequest[]>(() => {
      const s = q.search?.trim().toLowerCase() ?? '';
      const rows = getDb().requests.map(expire).filter((r) => inSite(r) &&
        (!q.customerId || r.customerId === q.customerId) && (!q.salesRepId || r.salesRepId === q.salesRepId) &&
        (!q.view || q.view === 'all' || (q.view === 'open' ? OPEN_REQUEST.includes(r.status) : q.view === 'review' ? REVIEWABLE_REQUEST.includes(r.status) : !OPEN_REQUEST.includes(r.status))) &&
        (!s || [r.number, r.customerName, r.poNumber ?? '', ...r.orderNumbers, ...r.lines.map((l) => l.name)].some((v) => v.toLowerCase().includes(s))));
      commit();
      return rows.sort((a, b) => b.date.localeCompare(a.date));
    }, () => http.get('/requests', q)),

  get: (id: string) => source<SalesRequest>(() => { const r = expire(find(id)); commit(); return r; }, () => http.get(`/requests/${id}`)),

  /** Submit from the cart. Returns the request (already converted when auto-approval applies). */
  submit: (input: SubmitInput) =>
    source<SalesRequest>(() => {
      const db = getDb();
      const cust = db.customers.find((c) => c.id === input.customerId)!;
      const items = input.items.map((i) => ({ product: db.products.find((p) => p.id === i.productId)!, quantity: i.quantity }))
        .filter((i) => i.product && i.quantity > 0).map((i) => ({ ...i, product: atSite(i.product) }));
      if (!items.length) throw new Error('errors.requests.empty');
      const totals = buildOrderTotals(items, cust, db.offers);
      const at = now();
      const r: SalesRequest = {
        id: `req_${uid('').slice(1)}`, number: input.offline ? `DRAFT-${uid('').slice(1, 7).toUpperCase()}` : `SR-26-${String(db.seq.request++).padStart(5, '0')}`,
        site: getCurrentSite() ?? undefined, customerId: cust.id, customerName: cust.name, salesRepId: cust.salesRepId, createdBy: input.actor,
        source: input.offline ? 'offline' : input.actor.role === 'SALES_REP' ? 'sales_app' : 'portal', date: at, status: 'draft',
        lines: totals.lines.map((l) => ({ ...l, convertedQty: 0 })), subtotal: totals.subtotal, discount: totals.discount, tax: totals.tax, total: totals.total,
        poNumber: input.poNumber, notes: input.notes, deliveryAddress: cust.address, billingAddress: cust.billingAddress,
        paid: cust.type === 'B2C' && !input.offline ? true : undefined, orderIds: [], orderNumbers: [], comments: [],
        timeline: [{ status: 'draft', at, by: input.actor.name, note: input.offline ? 'Saved on device – sent when back online' : undefined }],
      };
      if (!input.offline) submitDraft(r, input.actor);
      db.requests.unshift(r);
      cust.lastOrderDate = at;
      db.activity.unshift({ id: uid('act'), at, actor: input.actor.name, text: `submitted request ${r.number} for ${cust.name}`, kind: 'order' });
      commit();
      return r;
    }, () => http.post('/requests', input)),

  /** Send offline drafts. Each is checked exactly like an online submission. */
  syncDrafts: (actor: ActorRef) =>
    source<{ sent: number; blocked: number }>(() => {
      let sent = 0, blocked = 0;
      getDb().requests.filter((r) => r.status === 'draft' && r.source === 'offline').forEach((r) => {
        try { submitDraft(r, actor); sent++; } catch (e) { blocked++; r.comments.push({ by: 'System', at: now(), text: (e as Error).message }); }
      });
      commit();
      return { sent, blocked };
    }, () => http.post('/requests/sync')),

  preview: (id: string) => source<ConversionPreview>(() => preview(find(id)), () => http.get(`/requests/${id}/conversion-preview`)),

  convert: (id: string, actor: ActorRef, opts: ConvertOptions) =>
    source<SalesRequest>(() => {
      if (usedKeys.has(opts.idempotencyKey)) return find(usedKeys.get(opts.idempotencyKey)!);
      const r = convertNow(find(id), actor, opts);
      usedKeys.set(opts.idempotencyKey, id);
      commit();
      return r;
    }, () => http.post(`/requests/${id}/convert`, opts)),

  /** Send back for changes, or reject. A comment is required. */
  review: (id: string, decision: 'changes' | 'reject', actor: ActorRef, comment: string) =>
    source<SalesRequest>(() => {
      const r = find(id);
      if (!['submitted', 'approved', 'partly_converted'].includes(r.status)) throw new Error('errors.requests.notOpen');
      if (!comment.trim()) throw new Error('errors.requests.commentRequired');
      r.comments.push({ by: actor.name, at: now(), text: comment });
      log(r, decision === 'reject' ? 'rejected' : 'changes_requested', actor.name, comment);
      r.holdUntil = undefined;
      notifyRequester(r, decision === 'reject' ? `Request ${r.number} rejected` : `Changes requested on ${r.number}`, comment.slice(0, 90));
      commit();
      return r;
    }, () => http.post(`/requests/${id}/${decision === 'reject' ? 'reject' : 'request-changes'}`, { comment })),

  /** Withdraw a request (or the open remainder of a partly converted one). */
  cancel: (id: string, actor: ActorRef, note?: string) =>
    source<SalesRequest>(() => {
      const r = find(id);
      if (!OPEN_REQUEST.includes(r.status)) throw new Error('errors.requests.notOpen');
      log(r, r.orderIds.length ? 'converted' : 'cancelled', actor.name, note ?? 'Cancelled by requester');
      r.holdUntil = undefined;
      commit();
      return r;
    }, () => http.post(`/requests/${id}/cancel`, { note })),

  comment: (id: string, actor: ActorRef, text: string) =>
    source<SalesRequest>(() => { const r = find(id); r.comments.push({ by: actor.name, at: now(), text }); commit(); return r; }, () => http.post(`/requests/${id}/comments`, { text })),
};

/** Workflow rules (Admin and Supervisor). Backend: GET/PUT /settings/workflow */
export const workflowService = {
  get: () => source<WorkflowSettings>(() => getDb().workflow, () => http.get('/settings/workflow')),
  save: (next: WorkflowSettings, actor: ActorRef) =>
    source<WorkflowSettings>(() => {
      const db = getDb();
      db.workflow = { ...next, autoApprove: { ...next.autoApprove }, creditOverrides: { ...next.creditOverrides } };
      db.activity.unshift({ id: uid('act'), at: now(), actor: actor.name, text: 'updated workflow rules', kind: 'approval' });
      commit();
      return db.workflow;
    }, () => http.put('/settings/workflow', next)),
};
