import { source, http } from '@/lib/api/httpClient';
import { getDb, commit, uid, atSite, inSite } from '@/lib/data/mockDb';
import { getCurrentSite } from '@/lib/sites/current';
import { customerUnitPrice } from '@/lib/domain/pricing';
import { pushNotification } from './notificationService';
import { requestService } from './requestService';
import {
  OPEN_QUOTE,
  type ActorRef, type CollectionNote, type Delivery, type DeliveryStatus, type Invoice, type Order, type Payment, type PaymentMethod,
  type ProofOfDelivery, type Quote, type QuoteLine, type QuoteStatus, type SalesRequest,
} from '@/types/domain';

/**
 * Quotes, deliveries, payments and collections
 * -------------------------------------------
 * Quotes: a customer (or a rep for them) asks for prices; sales prices and
 * sends the quote; the customer accepts it, which raises a Sales Request at
 * the quoted prices – the normal approval and conversion follow.
 *
 * Deliveries: the ERP creates a delivery note when an order is dispatched;
 * the driver, rep, warehouse or the customer records proof of delivery.
 *
 * Payments: customers pay online (payment provider) or tell us about a bank
 * transfer or cheque; reps record what they collect. Anything not paid online
 * waits for finance to verify it against the bank before the ERP posts it.
 */
const now = () => new Date().toISOString();
const DAY = 86400000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const isStaff = (a: ActorRef) => a.role === 'SUPERVISOR' || a.role === 'ADMIN' || a.role === 'SALES_REP';
const isManager = (a: ActorRef) => a.role === 'SUPERVISOR' || a.role === 'ADMIN';
const customerUsers = (customerId: string) => getDb().users.filter((u) => u.customerId === customerId).map((u) => u.id);

/* ================================ quotes ================================ */

/** Reps may give up to this discount off the customer's normal price; more needs a supervisor. */
export const REP_MAX_DISCOUNT_PCT = 15;
export const DEFAULT_QUOTE_DAYS = 14;

function findQuote(id: string) { const q = getDb().quotes.find((x) => x.id === id); if (!q) throw new Error('errors.quotes.notFound'); return q; }
function logQuote(q: Quote, status: QuoteStatus, by: string, note?: string) { q.status = status; q.timeline.push({ status, at: now(), by, note }); }
function expireQuote(q: Quote) {
  if (q.status === 'sent' && q.validUntil && new Date(q.validUntil).getTime() < Date.now()) logQuote(q, 'expired', 'System', 'Validity ended');
  return q;
}
function totalsOf(q: Quote) {
  q.lines.forEach((l) => { l.lineTotal = r2(l.unitPrice * l.quantity); });
  q.subtotal = r2(q.lines.reduce((s, l) => s + l.lineTotal, 0));
  q.tax = r2(q.subtotal * 0.18);
  q.total = r2(q.subtotal + q.tax);
}
export const discountPct = (l: Pick<QuoteLine, 'listPrice' | 'unitPrice'>) => (l.listPrice > 0 ? Math.round((1 - l.unitPrice / l.listPrice) * 1000) / 10 : 0);
const notifyQuoteCustomer = (q: Quote, title: string, body: string) => pushNotification({ userIds: customerUsers(q.customerId) }, 'request_update', title, body, `/quotes/${q.id}`);
const notifyQuoteSales = (q: Quote, title: string, body: string) => pushNotification({ userIds: [q.salesRepId].filter(Boolean), roles: ['SUPERVISOR'] }, 'request_update', title, body, `/quotes/${q.id}`);

export interface QuoteQuery { customerId?: string; salesRepId?: string; view?: 'open' | 'closed' | 'all' }

export const quoteService = {
  list: (q: QuoteQuery = {}) =>
    source<Quote[]>(() => {
      const rows = getDb().quotes.map(expireQuote).filter((x) => inSite(x) && (!q.customerId || x.customerId === q.customerId) && (!q.salesRepId || x.salesRepId === q.salesRepId) &&
        (!q.view || q.view === 'all' || (q.view === 'open' ? OPEN_QUOTE.includes(x.status) : !OPEN_QUOTE.includes(x.status))));
      commit();
      return rows.sort((a, b) => b.date.localeCompare(a.date));
    }, () => http.get('/quotes', q)),

  get: (id: string) => source<Quote>(() => { const q = expireQuote(findQuote(id)); commit(); return q; }, () => http.get(`/quotes/${id}`)),

  /** Customer asks for a quote (status requested); staff start one for a customer (status draft). */
  create: (input: { customerId: string; items: { productId: string; quantity: number; targetPrice?: number }[]; note?: string; actor: ActorRef }) =>
    source<Quote>(() => {
      const db = getDb();
      const cust = db.customers.find((c) => c.id === input.customerId)!;
      const site = getCurrentSite() ?? undefined;
      const lines: QuoteLine[] = input.items.filter((i) => i.quantity > 0).map((i) => {
        const p = atSite(db.products.find((x) => x.id === i.productId)!, site);
        const listPrice = customerUnitPrice(p, cust);
        return { productId: p.id, sku: p.sku, name: p.name, uom: p.uom, image: p.image, quantity: i.quantity, listPrice, unitPrice: listPrice, targetPrice: i.targetPrice || undefined, lineTotal: r2(listPrice * i.quantity) };
      });
      if (!lines.length) throw new Error('errors.quotes.empty');
      const n = db.seq.quote++;
      const status: QuoteStatus = isStaff(input.actor) ? 'draft' : 'requested';
      const q: Quote = {
        id: `quo_${n}`, number: `QT-26-${String(n).padStart(5, '0')}`, site, customerId: cust.id, customerName: cust.name, salesRepId: cust.salesRepId, createdBy: input.actor,
        date: now(), status, version: 1, lines, subtotal: 0, tax: 0, total: 0, customerNote: input.note?.trim() || undefined, comments: [],
        timeline: [{ status, at: now(), by: input.actor.name }],
      };
      totalsOf(q);
      db.quotes.unshift(q);
      if (status === 'requested') notifyQuoteSales(q, `Quote requested: ${q.number}`, `${cust.name} – ${lines.length} item(s)`);
      db.activity.unshift({ id: uid('act'), at: now(), actor: input.actor.name, text: `${status === 'requested' ? 'requested quote' : 'started quote'} ${q.number} for ${cust.name}`, kind: 'order' });
      commit();
      return q;
    }, () => http.post('/quotes', input)),

  /** Sales prices the quote. Editing a sent quote makes it a draft again (a new version is sent). */
  save: (id: string, actor: ActorRef, input: { lines: { productId: string; quantity: number; unitPrice: number }[]; validUntil?: string; terms?: string }) =>
    source<Quote>(() => {
      if (!isStaff(actor)) throw new Error('errors.forbidden');
      const q = expireQuote(findQuote(id));
      if (!OPEN_QUOTE.includes(q.status)) throw new Error('errors.quotes.notOpen');
      q.lines = q.lines.map((l) => { const x = input.lines.find((i) => i.productId === l.productId); return x ? { ...l, quantity: Math.max(0, x.quantity), unitPrice: Math.max(0, r2(x.unitPrice)) } : l; }).filter((l) => l.quantity > 0);
      if (!q.lines.length) throw new Error('errors.quotes.empty');
      q.validUntil = input.validUntil; q.terms = input.terms?.trim() || undefined;
      totalsOf(q);
      if (q.status !== 'draft') logQuote(q, 'draft', actor.name, q.status === 'sent' ? 'Revising' : undefined);
      commit(); return q;
    }, () => http.put(`/quotes/${id}`, input)),

  send: (id: string, actor: ActorRef) =>
    source<Quote>(() => {
      if (!isStaff(actor)) throw new Error('errors.forbidden');
      const q = findQuote(id);
      if (!['draft', 'requested'].includes(q.status)) throw new Error('errors.quotes.notOpen');
      if (!q.validUntil || new Date(q.validUntil).getTime() < Date.now()) throw new Error('errors.quotes.validity');
      if (actor.role === 'SALES_REP' && q.lines.some((l) => discountPct(l) > REP_MAX_DISCOUNT_PCT)) throw new Error('errors.quotes.discountNeedsApproval');
      const resend = q.timeline.some((e) => e.status === 'sent');
      if (resend) q.version++;
      q.pricedBy = actor.name;
      logQuote(q, 'sent', actor.name, resend ? `Version ${q.version}` : undefined);
      notifyQuoteCustomer(q, `Quote ${q.number} is ready`, `Valid until ${new Date(q.validUntil).toDateString()}`);
      commit(); return q;
    }, () => http.post(`/quotes/${id}/send`)),

  /** Customer (or their rep) accepts: a Sales Request is raised at the quoted prices. */
  accept: (id: string, actor: ActorRef, poNumber?: string) =>
    source<{ quote: Quote; request: SalesRequest }>(async () => {
      const q = expireQuote(findQuote(id));
      if (q.status !== 'sent') throw new Error(q.status === 'expired' ? 'errors.quotes.expired' : 'errors.quotes.notOpen');
      const request = await requestService.submit({ customerId: q.customerId, items: q.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })), poNumber, actor, quoteId: q.id, notes: `Accepted quote ${q.number} (v${q.version})` });
      const fresh = findQuote(id);
      fresh.requestId = request.id; fresh.requestNumber = request.number;
      logQuote(fresh, 'accepted', actor.name, request.number);
      notifyQuoteSales(fresh, `Quote ${fresh.number} accepted`, `${fresh.customerName} – request ${request.number}`);
      commit();
      return { quote: fresh, request };
    }, () => http.post(`/quotes/${id}/accept`, { poNumber })),

  decline: (id: string, actor: ActorRef, reason: string) =>
    source<Quote>(() => {
      const q = findQuote(id);
      if (q.status !== 'sent') throw new Error('errors.quotes.notOpen');
      if (!reason.trim()) throw new Error('errors.quotes.reasonRequired');
      q.declineReason = reason.trim();
      logQuote(q, 'declined', actor.name, reason.trim());
      notifyQuoteSales(q, `Quote ${q.number} declined`, reason.trim().slice(0, 90));
      commit(); return q;
    }, () => http.post(`/quotes/${id}/decline`, { reason })),

  /** Customer asks for different prices or quantities. */
  askRevision: (id: string, actor: ActorRef, comment: string) =>
    source<Quote>(() => {
      const q = findQuote(id);
      if (q.status !== 'sent') throw new Error('errors.quotes.notOpen');
      if (!comment.trim()) throw new Error('errors.requests.commentRequired');
      q.comments.push({ by: actor.name, at: now(), text: comment.trim() });
      logQuote(q, 'requested', actor.name, 'Revision requested');
      notifyQuoteSales(q, `Revision requested on ${q.number}`, comment.trim().slice(0, 90));
      commit(); return q;
    }, () => http.post(`/quotes/${id}/revision`, { comment })),

  cancel: (id: string, actor: ActorRef) =>
    source<Quote>(() => {
      const q = findQuote(id);
      if (!OPEN_QUOTE.includes(q.status)) throw new Error('errors.quotes.notOpen');
      logQuote(q, 'cancelled', actor.name);
      commit(); return q;
    }, () => http.post(`/quotes/${id}/cancel`)),

  comment: (id: string, actor: ActorRef, text: string) =>
    source<Quote>(() => { const q = findQuote(id); if (text.trim()) q.comments.push({ by: actor.name, at: now(), text: text.trim() }); commit(); return q; }, () => http.post(`/quotes/${id}/comments`, { text })),
};

/* ============================== deliveries ============================== */

function findDel(id: string) { const d = getDb().deliveries.find((x) => x.id === id); if (!d) throw new Error('errors.deliveries.notFound'); return d; }
function logDel(d: Delivery, status: DeliveryStatus, by: string, note?: string) { d.status = status; d.timeline.push({ status, at: now(), by, note }); }

/** ERP side effect of dispatch: tax invoice and delivery note. Used by orderService (mock). */
export function onDispatch(o: Order, by: string) {
  const db = getDb();
  const cust = db.customers.find((c) => c.id === o.customerId)!;
  if (!o.invoiceId) {
    const n = db.seq.invoice++;
    const days = cust.type === 'B2C' ? 0 : cust.paymentTerms.match(/\d+/) ? Number(cust.paymentTerms.match(/\d+/)![0]) : 30;
    const inv: Invoice = {
      id: `inv_${n}`, number: `INV-26-${String(n).padStart(5, '0')}`, orderId: o.id, orderNumber: o.number, customerId: o.customerId, date: now(),
      dueDate: new Date(Date.now() + days * DAY).toISOString(), amount: o.total, paid: cust.type === 'B2C' ? o.total : 0, status: cust.type === 'B2C' ? 'paid' : 'unpaid',
    };
    db.invoices.unshift(inv); o.invoiceId = inv.id;
    if (cust.type === 'B2B') cust.outstanding = r2(cust.outstanding + inv.amount);
  }
  if (!o.deliveryId) {
    const n = db.seq.delivery++;
    const d: Delivery = {
      id: `del_${n}`, number: `DN-26-${String(n).padStart(5, '0')}`, orderId: o.id, orderNumber: o.number, customerId: o.customerId, customerName: o.customerName, site: o.site,
      address: o.deliveryAddress, status: 'scheduled', plannedDate: o.expectedDelivery, carrier: cust.type === 'B2C' ? 'BlueDart' : 'VRL Logistics', trackingRef: `VRL${4600000 + n}`,
      // one delivery line per product: free goods ship with the paid quantity of the same item
      lines: o.lines.reduce((acc, l) => { const e = acc.find((x) => x.productId === l.productId); if (e) e.quantity += l.quantity; else acc.push({ productId: l.productId, sku: l.sku, name: l.name, uom: l.uom, quantity: l.quantity }); return acc; }, [] as { productId: string; sku: string; name: string; uom: string; quantity: number }[]),
      timeline: [{ status: 'scheduled', at: now(), by, note: 'Delivery note created at dispatch' }],
    };
    db.deliveries.unshift(d); o.deliveryId = d.id;
  }
}

export interface DeliveryQuery { customerId?: string; salesRepId?: string; view?: 'open' | 'closed' | 'all' }
export interface PodInput { receivedBy: string; signature?: string; photo?: string; notes?: string; lines: { productId: string; receivedQty: number; damagedQty: number }[]; location?: { lat: number; lng: number } }

export const deliveryService = {
  list: (q: DeliveryQuery = {}) =>
    source<Delivery[]>(() => getDb().deliveries.filter((d) => inSite(d) && (!q.customerId || d.customerId === q.customerId) &&
      (!q.salesRepId || getDb().customers.find((c) => c.id === d.customerId)?.salesRepId === q.salesRepId) &&
      (!q.view || q.view === 'all' || (q.view === 'open' ? ['scheduled', 'out_for_delivery', 'failed'].includes(d.status) : d.status === 'delivered')))
      .sort((a, b) => (a.status === 'delivered') === (b.status === 'delivered') ? a.plannedDate.localeCompare(b.plannedDate) * (a.status === 'delivered' ? -1 : 1) : a.status === 'delivered' ? 1 : -1),
    () => http.get('/deliveries', q)),

  get: (id: string) => source<Delivery>(() => findDel(id), () => http.get(`/deliveries/${id}`)),

  dispatch: (id: string, actor: ActorRef, driver?: string, vehicle?: string) =>
    source<Delivery>(() => {
      if (!isStaff(actor)) throw new Error('errors.forbidden');
      const d = findDel(id);
      if (!['scheduled', 'failed'].includes(d.status)) throw new Error('errors.deliveries.notOpen');
      if (driver) d.driver = driver; if (vehicle) d.vehicle = vehicle;
      logDel(d, 'out_for_delivery', actor.name, [d.driver, d.vehicle].filter(Boolean).join(' · ') || undefined);
      pushNotification({ userIds: customerUsers(d.customerId) }, 'order_dispatched', `Out for delivery: ${d.orderNumber}`, `${d.carrier}${d.driver ? ` · ${d.driver}` : ''}`, `/orders/${d.orderId}`);
      commit(); return d;
    }, () => http.post(`/deliveries/${id}/out-for-delivery`, { driver, vehicle })),

  /** Proof of delivery. Staff must capture a signature or a photo; customers confirm in their own login. */
  recordPod: (id: string, actor: ActorRef, input: PodInput) =>
    source<Delivery>(() => {
      const db = getDb();
      const d = findDel(id);
      const customer = actor.role === 'CUSTOMER_B2B' || actor.role === 'CUSTOMER_B2C';
      if (customer && db.users.find((u) => u.id === actor.id)?.customerId !== d.customerId) throw new Error('errors.forbidden');
      if (!['scheduled', 'out_for_delivery'].includes(d.status)) throw new Error('errors.deliveries.notOpen');
      if (!input.receivedBy.trim()) throw new Error('errors.deliveries.receivedBy');
      if (!customer && !input.signature && !input.photo) throw new Error('errors.deliveries.proof');
      d.lines.forEach((l) => {
        const x = input.lines.find((i) => i.productId === l.productId);
        l.receivedQty = Math.max(0, Math.min(l.quantity, x?.receivedQty ?? l.quantity));
        l.damagedQty = Math.max(0, Math.min(l.receivedQty, x?.damagedQty ?? 0));
      });
      const pod: ProofOfDelivery = { receivedBy: input.receivedBy.trim(), at: now(), signature: input.signature, photo: input.photo, notes: input.notes?.trim() || undefined, recordedBy: actor, location: input.location };
      d.pod = pod;
      const issues = d.lines.filter((l) => (l.receivedQty ?? 0) < l.quantity || (l.damagedQty ?? 0) > 0).length;
      logDel(d, 'delivered', actor.name, issues ? `${issues} line(s) short or damaged` : `Received by ${pod.receivedBy}`);
      const o = db.orders.find((x) => x.id === d.orderId);
      if (o && o.status !== 'delivered') { o.status = 'delivered'; o.timeline.push({ status: 'delivered', at: now(), by: actor.name, note: `${d.number} · received by ${pod.receivedBy}` }); }
      if (issues) pushNotification({ roles: ['SUPERVISOR'], userIds: [o?.salesRepId ?? ''].filter(Boolean) }, 'order_dispatched', `Delivery issue on ${d.orderNumber}`, `${issues} line(s) short or damaged – ${d.customerName}`, `/deliveries/${d.id}`);
      else if (!customer) pushNotification({ userIds: customerUsers(d.customerId) }, 'order_dispatched', `Delivered: ${d.orderNumber}`, `Received by ${pod.receivedBy}`, `/orders/${d.orderId}`);
      commit(); return d;
    }, () => http.post(`/deliveries/${id}/pod`, input)),

  fail: (id: string, actor: ActorRef, reason: string) =>
    source<Delivery>(() => {
      if (!isStaff(actor)) throw new Error('errors.forbidden');
      const d = findDel(id);
      if (d.status !== 'out_for_delivery') throw new Error('errors.deliveries.notOpen');
      if (!reason.trim()) throw new Error('errors.deliveries.reasonRequired');
      d.failReason = reason.trim();
      logDel(d, 'failed', actor.name, reason.trim());
      pushNotification({ userIds: customerUsers(d.customerId) }, 'order_dispatched', `Delivery attempt failed: ${d.orderNumber}`, reason.trim().slice(0, 90), `/orders/${d.orderId}`);
      commit(); return d;
    }, () => http.post(`/deliveries/${id}/fail`, { reason })),

  reschedule: (id: string, actor: ActorRef, date: string) =>
    source<Delivery>(() => {
      if (!isStaff(actor)) throw new Error('errors.forbidden');
      const d = findDel(id);
      if (d.status !== 'failed') throw new Error('errors.deliveries.notOpen');
      d.plannedDate = date; d.failReason = undefined;
      logDel(d, 'scheduled', actor.name, `Rescheduled to ${new Date(date).toDateString()}`);
      commit(); return d;
    }, () => http.post(`/deliveries/${id}/reschedule`, { date })),
};

/* ========================= payments & collections ======================== */

function invoiceStatus(i: Invoice): Invoice['status'] {
  if (i.paid >= i.amount - 0.005) return 'paid';
  if (new Date(i.dueDate).getTime() < Date.now()) return 'overdue';
  return i.paid > 0 ? 'partially_paid' : 'unpaid';
}

/** Apply an amount to invoices, oldest due first. Returns the allocations. */
function allocate(customerId: string, invoiceIds: string[], amount: number) {
  const db = getDb();
  const cust = db.customers.find((c) => c.id === customerId)!;
  let left = r2(amount);
  const allocations: NonNullable<Payment['allocations']> = [];
  const targets = db.invoices.filter((i) => i.customerId === customerId && invoiceIds.includes(i.id) && i.status !== 'paid').sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  for (const i of targets) {
    if (left <= 0) break;
    const take = r2(Math.min(left, i.amount - i.paid));
    i.paid = r2(i.paid + take); i.status = invoiceStatus(i);
    allocations.push({ invoiceId: i.id, invoiceNumber: i.number, amount: take });
    left = r2(left - take);
  }
  cust.outstanding = r2(Math.max(0, cust.outstanding - (amount - left)));
  return { allocations, unallocated: left };
}

function nextPaymentNumber() { const db = getDb(); return `RCP-26-${String(db.seq.payment++).padStart(5, '0')}`; }

export interface AgingRow {
  customerId: string; customerName: string; customerCode: string; salesRepId: string; status: string;
  current: number; d1_30: number; d31_60: number; d61_90: number; d90: number; total: number; overdue: number;
  lastPayment?: { date: string; amount: number }; pendingVerification: number; openPromise?: CollectionNote; brokenPromises: number;
}

function promiseOutcome(n: CollectionNote): CollectionNote['outcome'] {
  if (n.kind !== 'promise' || !n.promiseDate) return undefined;
  const paid = getDb().payments.filter((p) => p.customerId === n.customerId && (p.status ?? 'posted') !== 'rejected' && p.date >= n.at && p.date <= new Date(new Date(n.promiseDate!).getTime() + DAY).toISOString())
    .reduce((s, p) => s + p.amount, 0);
  if (paid >= (n.promiseAmount ?? 0) && paid > 0) return 'kept';
  return new Date(n.promiseDate).getTime() + DAY < Date.now() ? 'broken' : 'open';
}

export const paymentService = {
  list: (q: { customerId?: string; status?: Payment['status'] | 'all' } = {}) =>
    source<Payment[]>(() => getDb().payments.filter((p) => (!q.customerId || p.customerId === q.customerId) && (!q.status || q.status === 'all' || (p.status ?? 'posted') === q.status))
      .sort((a, b) => b.date.localeCompare(a.date)), () => http.get('/payments', q)),

  /** Receipt with the invoices it was allocated to. Backend: GET /payments/{id} */
  get: (id: string) =>
    source<{ payment: Payment; invoices: Invoice[] }>(() => {
      const db = getDb();
      const payment = db.payments.find((p) => p.id === id);
      if (!payment) throw new Error('errors.payments.notFound');
      const nums = payment.allocations?.map((a) => a.invoiceNumber) ?? payment.invoiceNumbers;
      return { payment: { ...payment, customerName: payment.customerName ?? db.customers.find((c) => c.id === payment.customerId)?.name }, invoices: db.invoices.filter((i) => nums.includes(i.number)) };
    }, () => http.get(`/payments/${id}`)),

  /**
   * Online payment. In production the portal creates a payment session with
   * the provider configured for the client (Razorpay, Stripe, …) and the
   * backend posts the receipt when the provider's webhook confirms it.
   */
  payOnline: (input: { customerId: string; invoiceIds: string[]; method: PaymentMethod; actor: ActorRef }) =>
    source<Payment>(() => {
      const db = getDb();
      const inv = db.invoices.filter((i) => i.customerId === input.customerId && input.invoiceIds.includes(i.id) && i.status !== 'paid');
      if (!inv.length) throw new Error('errors.payments.noInvoices');
      const amount = r2(inv.reduce((s, i) => s + i.amount - i.paid, 0));
      const { allocations } = allocate(input.customerId, inv.map((i) => i.id), amount);
      const cust = db.customers.find((c) => c.id === input.customerId)!;
      const p: Payment = {
        id: uid('pay'), number: nextPaymentNumber(), customerId: cust.id, customerName: cust.name, date: now(), amount, method: input.method, reference: `PG${Date.now().toString().slice(-9)}`,
        invoiceNumbers: allocations.map((a) => a.invoiceNumber), status: 'posted', source: 'online', allocations, enteredBy: input.actor, verifiedBy: 'Payment provider', verifiedAt: now(),
      };
      db.payments.unshift(p);
      pushNotification({ userIds: [cust.salesRepId].filter(Boolean) }, 'message', `${cust.name} paid online`, `${p.number} · ${allocations.length} invoice(s)`, `/collections?customer=${cust.id}`);
      db.activity.unshift({ id: uid('act'), at: now(), actor: input.actor.name, text: `paid ${allocations.length} invoice(s) online (${p.number})`, kind: 'payment' });
      commit(); return p;
    }, () => http.post('/payments/online', input)),

  /** Customer remittance advice or a rep's collection. Waits for finance to match it to the bank. */
  record: (input: { customerId: string; invoiceIds: string[]; amount: number; method: PaymentMethod; reference: string; date: string; note?: string; actor: ActorRef }) =>
    source<Payment>(() => {
      const db = getDb();
      if (!(input.amount > 0)) throw new Error('errors.payments.amount');
      if (!input.reference.trim() && input.method !== 'Cash') throw new Error('errors.payments.reference');
      const cust = db.customers.find((c) => c.id === input.customerId)!;
      const inv = db.invoices.filter((i) => i.customerId === cust.id && input.invoiceIds.includes(i.id));
      const staff = isStaff(input.actor);
      const p: Payment = {
        id: uid('pay'), number: nextPaymentNumber(), customerId: cust.id, customerName: cust.name, date: input.date, amount: r2(input.amount), method: input.method,
        reference: input.reference.trim() || 'CASH', invoiceNumbers: inv.map((i) => i.number), status: 'pending_verification', source: staff ? 'collection' : 'advice',
        enteredBy: input.actor, note: input.note?.trim() || undefined,
      };
      db.payments.unshift(p);
      pushNotification({ roles: ['SUPERVISOR'] }, 'message', `Payment to verify: ${cust.name}`, `${p.number} · ${p.method} ${p.reference}`, `/collections?tab=verify`);
      commit(); return p;
    }, () => http.post('/payments', input)),

  /** Finance confirms the money is in the bank; the ERP posts the receipt and allocates it. */
  verify: (id: string, actor: ActorRef) =>
    source<Payment>(() => {
      if (!isManager(actor)) throw new Error('errors.forbidden');
      const db = getDb();
      const p = db.payments.find((x) => x.id === id);
      if (!p) throw new Error('errors.payments.notFound');
      if (p.status !== 'pending_verification') throw new Error('errors.payments.notPending');
      const ids = db.invoices.filter((i) => p.invoiceNumbers.includes(i.number)).map((i) => i.id);
      // anything not covered by the named invoices goes to the oldest other open invoices
      const others = db.invoices.filter((i) => i.customerId === p.customerId && !ids.includes(i.id) && i.status !== 'paid').map((i) => i.id);
      const a = allocate(p.customerId, ids, p.amount);
      const b = a.unallocated > 0 ? allocate(p.customerId, others, a.unallocated) : { allocations: [], unallocated: 0 };
      p.allocations = [...a.allocations, ...b.allocations];
      p.invoiceNumbers = p.allocations.map((x) => x.invoiceNumber);
      p.status = 'posted'; p.verifiedBy = actor.name; p.verifiedAt = now();
      if (b.unallocated > 0) p.note = [p.note, `On account: ${b.unallocated}`].filter(Boolean).join(' · ');
      pushNotification({ userIds: customerUsers(p.customerId) }, 'message', `Payment received: ${p.number}`, `${p.method} ${p.reference}`, '/account');
      commit(); return p;
    }, () => http.post(`/payments/${id}/verify`)),

  reject: (id: string, actor: ActorRef, reason: string) =>
    source<Payment>(() => {
      if (!isManager(actor)) throw new Error('errors.forbidden');
      const p = getDb().payments.find((x) => x.id === id);
      if (!p) throw new Error('errors.payments.notFound');
      if (p.status !== 'pending_verification') throw new Error('errors.payments.notPending');
      if (!reason.trim()) throw new Error('errors.payments.reasonRequired');
      p.status = 'rejected'; p.verifiedBy = actor.name; p.verifiedAt = now(); p.note = reason.trim();
      pushNotification({ userIds: [...customerUsers(p.customerId), p.enteredBy?.id ?? ''].filter(Boolean) }, 'message', `Payment not found: ${p.number}`, reason.trim().slice(0, 90), '/account');
      commit(); return p;
    }, () => http.post(`/payments/${id}/reject`, { reason })),

  /** Receivables aging per customer. Reps see their own customers. */
  aging: (q: { salesRepId?: string } = {}) =>
    source<AgingRow[]>(() => {
      const db = getDb();
      const t = Date.now();
      return db.customers.filter((c) => c.type === 'B2B' && (!q.salesRepId || c.salesRepId === q.salesRepId)).map((c) => {
        const row: AgingRow = { customerId: c.id, customerName: c.name, customerCode: c.code, salesRepId: c.salesRepId, status: c.status, current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0, total: 0, overdue: 0, pendingVerification: 0, brokenPromises: 0 };
        db.invoices.filter((i) => i.customerId === c.id && i.status !== 'paid').forEach((i) => {
          const bal = i.amount - i.paid; const days = Math.floor((t - new Date(i.dueDate).getTime()) / DAY);
          if (days <= 0) row.current += bal; else if (days <= 30) row.d1_30 += bal; else if (days <= 60) row.d31_60 += bal; else if (days <= 90) row.d61_90 += bal; else row.d90 += bal;
        });
        (['current', 'd1_30', 'd31_60', 'd61_90', 'd90'] as const).forEach((k) => { row[k] = r2(row[k]); });
        row.overdue = r2(row.d1_30 + row.d31_60 + row.d61_90 + row.d90); row.total = r2(row.current + row.overdue);
        const pays = db.payments.filter((p) => p.customerId === c.id);
        const last = pays.filter((p) => (p.status ?? 'posted') === 'posted').sort((a, b) => b.date.localeCompare(a.date))[0];
        row.lastPayment = last && { date: last.date, amount: last.amount };
        row.pendingVerification = r2(pays.filter((p) => p.status === 'pending_verification').reduce((s, p) => s + p.amount, 0));
        const promises = db.collectionNotes.filter((n) => n.customerId === c.id && n.kind === 'promise').map((n) => ({ ...n, outcome: promiseOutcome(n) }));
        row.openPromise = promises.filter((n) => n.outcome === 'open').sort((a, b) => b.at.localeCompare(a.at))[0];
        row.brokenPromises = promises.filter((n) => n.outcome === 'broken').length;
        return row;
      }).filter((r) => r.total > 0 || r.pendingVerification > 0).sort((a, b) => b.overdue - a.overdue || b.total - a.total);
    }, () => http.get('/collections/aging', q)),

  notes: (customerId: string) =>
    source<CollectionNote[]>(() => getDb().collectionNotes.filter((n) => n.customerId === customerId).map((n) => ({ ...n, outcome: promiseOutcome(n) })).sort((a, b) => b.at.localeCompare(a.at)),
      () => http.get(`/collections/${customerId}/notes`)),

  addNote: (customerId: string, actor: ActorRef, input: { kind: 'promise' | 'note'; text: string; promiseDate?: string; promiseAmount?: number }) =>
    source<CollectionNote>(() => {
      if (!isStaff(actor)) throw new Error('errors.forbidden');
      if (!input.text.trim()) throw new Error('errors.requests.commentRequired');
      if (input.kind === 'promise' && (!input.promiseDate || !(input.promiseAmount! > 0))) throw new Error('errors.payments.promiseDetails');
      const n: CollectionNote = { id: uid('cn'), customerId, at: now(), by: actor, kind: input.kind, text: input.text.trim(), promiseDate: input.promiseDate, promiseAmount: input.promiseAmount };
      getDb().collectionNotes.unshift(n);
      commit(); return n;
    }, () => http.post(`/collections/${customerId}/notes`, input)),

  /** Sends the customer a reminder with their overdue invoices. */
  remind: (customerId: string, actor: ActorRef) =>
    source<CollectionNote>(() => {
      if (!isStaff(actor)) throw new Error('errors.forbidden');
      const db = getDb();
      const overdue = db.invoices.filter((i) => i.customerId === customerId && i.status === 'overdue');
      const amount = r2(overdue.reduce((s, i) => s + i.amount - i.paid, 0));
      pushNotification({ userIds: customerUsers(customerId) }, 'message', 'Payment reminder', `${overdue.length} overdue invoice(s): ${overdue.map((i) => i.number).join(', ')}`, '/account');
      const n: CollectionNote = { id: uid('cn'), customerId, at: now(), by: actor, kind: 'reminder', text: `Reminder sent for ${overdue.length} overdue invoice(s), ${amount}` };
      db.collectionNotes.unshift(n);
      commit(); return n;
    }, () => http.post(`/collections/${customerId}/reminders`)),
};
