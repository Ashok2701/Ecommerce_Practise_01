import { Injectable } from '@nestjs/common';
import { Erp } from './erp';
import { RequestsService } from './requests.service';
import {
  activity, assertCustomerInScope, customerScope, customerUserIds, DAY, notify, nowIso, r2, requireManager, requireStaff, scopedCustomerIds, text, uid,
} from './common';
import { AppError, badRequest, forbidden, notFound } from '../common/errors';
import { isCustomer, isRep, isStaff, type Ctx } from '../common/ctx';
import { customerUnitPrice } from '@/lib/domain/pricing';
import {
  OPEN_QUOTE,
  type CollectionNote, type Delivery, type DeliveryStatus, type Invoice, type Payment, type PaymentMethod, type ProofOfDelivery, type Quote, type QuoteLine, type QuoteStatus, type SalesRequest,
} from '@/types/domain';

/** Reps may give up to this discount off the customer's normal price; more needs a supervisor. */
export const REP_MAX_DISCOUNT_PCT = 15;
const METHODS: PaymentMethod[] = ['NEFT', 'RTGS', 'Cheque', 'UPI', 'Card', 'Cash'];
const discountPct = (l: Pick<QuoteLine, 'listPrice' | 'unitPrice'>) => (l.listPrice > 0 ? Math.round((1 - l.unitPrice / l.listPrice) * 1000) / 10 : 0);

function logQuote(q: Quote, status: QuoteStatus, by: string, note?: string) { q.status = status; q.timeline.push({ status, at: nowIso(), by, note }); }
function totalsOf(q: Quote) {
  q.lines.forEach((l) => { l.lineTotal = r2(l.unitPrice * l.quantity); });
  q.subtotal = r2(q.lines.reduce((s, l) => s + l.lineTotal, 0));
  q.tax = r2(q.subtotal * 0.18);
  q.total = r2(q.subtotal + q.tax);
}
function logDel(d: { status: DeliveryStatus; timeline: Delivery['timeline'] }, status: DeliveryStatus, by: string, note?: string) { d.status = status; d.timeline.push({ status, at: nowIso(), by, note }); }

export interface AgingRow {
  customerId: string; customerName: string; customerCode: string; salesRepId: string; status: string;
  current: number; d1_30: number; d31_60: number; d61_90: number; d90: number; total: number; overdue: number;
  lastPayment?: { date: string; amount: number }; pendingVerification: number; openPromise?: CollectionNote; brokenPromises: number;
}

/** Quotes, deliveries with proof of delivery, payments and collections. */
@Injectable()
export class CommerceService {
  constructor(private erp: Erp, private requests: RequestsService) {}

  /* ================================ quotes ================================ */

  private async expireQuotes(list: Quote[]) {
    const due = list.filter((q) => q.status === 'sent' && q.validUntil && new Date(q.validUntil).getTime() < Date.now());
    if (due.length) await this.erp.db.tx(async (r) => { for (const q of due) { logQuote(q, 'expired', 'System', 'Validity ended'); await r.quotes.save(q); } });
  }

  async quotes(ctx: Ctx, q: { customerId?: string; salesRepId?: string; view?: string }): Promise<Quote[]> {
    const scope = await customerScope(ctx, this.erp);
    let rows = (await this.erp.db.repos.quotes.find()).filter((x) => !x.site || !ctx.site || x.site === ctx.site);
    if (scope) rows = rows.filter((x) => scope.includes(x.customerId) || (isRep(ctx) && x.salesRepId === ctx.user.id));
    await this.expireQuotes(rows);
    return rows.filter((x) => (!q.customerId || x.customerId === q.customerId) && (!q.salesRepId || x.salesRepId === q.salesRepId) &&
      (!q.view || q.view === 'all' || (q.view === 'open' ? OPEN_QUOTE.includes(x.status) : !OPEN_QUOTE.includes(x.status)))).sort((a, b) => b.date.localeCompare(a.date));
  }

  async quote(ctx: Ctx, id: string): Promise<Quote> {
    const q = await this.erp.db.repos.quotes.get(id);
    if (!q) throw notFound('errors.quotes.notFound');
    const scope = await customerScope(ctx, this.erp);
    if (scope && !scope.includes(q.customerId) && !(isRep(ctx) && q.salesRepId === ctx.user.id)) throw notFound('errors.quotes.notFound');
    await this.expireQuotes([q]);
    return q;
  }

  private async notifyQuoteCustomer(q: Quote, title: string, body: string) {
    await this.erp.db.tx(async (r) => notify(r, { userIds: await customerUserIds(r, q.customerId) }, 'request_update', title, body, `/quotes/${q.id}`));
  }

  async createQuote(ctx: Ctx, input: { customerId: string; items: { productId: string; quantity: number; targetPrice?: number }[]; note?: string }): Promise<Quote> {
    const customerId = isCustomer(ctx) ? ctx.user.customerId! : text(input?.customerId, 40);
    await assertCustomerInScope(ctx, this.erp, customerId);
    const cust = await this.erp.customer(customerId);
    const products = new Map((await this.erp.productsAt(ctx.site)).map((p) => [p.id, p]));
    const lines: QuoteLine[] = (Array.isArray(input.items) ? input.items : []).filter((i) => Number(i.quantity) > 0 && products.has(i.productId)).map((i) => {
      const p = products.get(i.productId)!;
      const listPrice = customerUnitPrice(p, cust);
      return { productId: p.id, sku: p.sku, name: p.name, uom: p.uom, image: p.image, quantity: Number(i.quantity), listPrice, unitPrice: listPrice, targetPrice: Number(i.targetPrice) || undefined, lineTotal: r2(listPrice * Number(i.quantity)) };
    });
    if (!lines.length) throw badRequest('errors.quotes.empty');
    const status: QuoteStatus = isStaff(ctx) ? 'draft' : 'requested';
    const q = await this.erp.db.tx(async (r) => {
      const n = await r.next('quote', 640);
      const at = nowIso();
      const quote: Quote = {
        id: uid('quo'), number: `QT-26-${String(n).padStart(5, '0')}`, site: ctx.site, customerId: cust.id, customerName: cust.name, salesRepId: cust.salesRepId, createdBy: ctx.actor,
        date: at, status, version: 1, lines, subtotal: 0, tax: 0, total: 0, customerNote: text(input.note).trim() || undefined, comments: [], timeline: [{ status, at, by: ctx.user.name }],
      };
      totalsOf(quote);
      await r.quotes.insert(quote);
      if (status === 'requested') await notify(r, { userIds: [quote.salesRepId], roles: ['SUPERVISOR'] }, 'request_update', `Quote requested: ${quote.number}`, `${cust.name} – ${lines.length} item(s)`, `/quotes/${quote.id}`);
      await activity(r, { actor: ctx.user.name, text: `${status === 'requested' ? 'requested quote' : 'started quote'} ${quote.number} for ${cust.name}`, kind: 'order', site: ctx.site });
      return quote;
    });
    return q;
  }

  async saveQuote(ctx: Ctx, id: string, input: { lines: { productId: string; quantity: number; unitPrice: number }[]; validUntil?: string; terms?: string }): Promise<Quote> {
    requireStaff(ctx);
    const q = await this.quote(ctx, id);
    if (!OPEN_QUOTE.includes(q.status)) throw badRequest('errors.quotes.notOpen');
    const ls = Array.isArray(input?.lines) ? input.lines : [];
    q.lines = q.lines.map((l) => { const x = ls.find((i) => i.productId === l.productId); return x ? { ...l, quantity: Math.max(0, Number(x.quantity)), unitPrice: Math.max(0, r2(Number(x.unitPrice))) } : l; }).filter((l) => l.quantity > 0);
    if (!q.lines.length) throw badRequest('errors.quotes.empty');
    q.validUntil = input.validUntil || undefined; q.terms = text(input.terms).trim() || undefined;
    totalsOf(q);
    if (q.status !== 'draft') logQuote(q, 'draft', ctx.user.name, q.status === 'sent' ? 'Revising' : undefined);
    await this.erp.db.tx((r) => r.quotes.save(q));
    return q;
  }

  async sendQuote(ctx: Ctx, id: string): Promise<Quote> {
    requireStaff(ctx);
    const q = await this.quote(ctx, id);
    if (!['draft', 'requested'].includes(q.status)) throw badRequest('errors.quotes.notOpen');
    if (!q.validUntil || new Date(q.validUntil).getTime() < Date.now()) throw badRequest('errors.quotes.validity');
    if (isRep(ctx) && q.lines.some((l) => discountPct(l) > REP_MAX_DISCOUNT_PCT)) throw badRequest('errors.quotes.discountNeedsApproval');
    const resend = q.timeline.some((e) => e.status === 'sent');
    if (resend) q.version++;
    q.pricedBy = ctx.user.name;
    logQuote(q, 'sent', ctx.user.name, resend ? `Version ${q.version}` : undefined);
    await this.erp.db.tx((r) => r.quotes.save(q));
    await this.notifyQuoteCustomer(q, `Quote ${q.number} is ready`, `Valid until ${new Date(q.validUntil).toDateString()}`);
    return q;
  }

  /** Customer (or their rep) accepts: a Sales Request is raised at the quoted prices. */
  async acceptQuote(ctx: Ctx, id: string, poNumber?: string): Promise<{ quote: Quote; request: SalesRequest }> {
    const q = await this.quote(ctx, id);
    if (q.status !== 'sent') throw badRequest(q.status === 'expired' ? 'errors.quotes.expired' : 'errors.quotes.notOpen');
    if (!isCustomer(ctx) && !isRep(ctx) && ctx.user.role !== 'SUPERVISOR') throw forbidden();
    const request = await this.requests.submitFor({ ...ctx, site: q.site ?? ctx.site }, {
      customerId: q.customerId, items: q.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })), poNumber: text(poNumber, 60) || undefined, quoteId: q.id, notes: `Accepted quote ${q.number} (v${q.version})`,
    });
    const fresh = (await this.erp.db.repos.quotes.get(id))!;
    fresh.requestId = request.id; fresh.requestNumber = request.number;
    logQuote(fresh, 'accepted', ctx.user.name, request.number);
    await this.erp.db.tx(async (r) => {
      await r.quotes.save(fresh);
      await notify(r, { userIds: [fresh.salesRepId], roles: ['SUPERVISOR'] }, 'request_update', `Quote ${fresh.number} accepted`, `${fresh.customerName} – request ${request.number}`, `/quotes/${fresh.id}`);
    });
    return { quote: fresh, request };
  }

  async declineQuote(ctx: Ctx, id: string, reason: string): Promise<Quote> {
    const q = await this.quote(ctx, id);
    if (q.status !== 'sent') throw badRequest('errors.quotes.notOpen');
    const why = text(reason).trim();
    if (!why) throw badRequest('errors.quotes.reasonRequired');
    q.declineReason = why;
    logQuote(q, 'declined', ctx.user.name, why);
    await this.erp.db.tx(async (r) => { await r.quotes.save(q); await notify(r, { userIds: [q.salesRepId], roles: ['SUPERVISOR'] }, 'request_update', `Quote ${q.number} declined`, why.slice(0, 90), `/quotes/${q.id}`); });
    return q;
  }

  async reviseQuote(ctx: Ctx, id: string, comment: string): Promise<Quote> {
    const q = await this.quote(ctx, id);
    if (q.status !== 'sent') throw badRequest('errors.quotes.notOpen');
    const c = text(comment).trim();
    if (!c) throw badRequest('errors.requests.commentRequired');
    q.comments.push({ by: ctx.user.name, at: nowIso(), text: c });
    logQuote(q, 'requested', ctx.user.name, 'Revision requested');
    await this.erp.db.tx(async (r) => { await r.quotes.save(q); await notify(r, { userIds: [q.salesRepId], roles: ['SUPERVISOR'] }, 'request_update', `Revision requested on ${q.number}`, c.slice(0, 90), `/quotes/${q.id}`); });
    return q;
  }

  async cancelQuote(ctx: Ctx, id: string): Promise<Quote> {
    requireStaff(ctx);
    const q = await this.quote(ctx, id);
    if (!OPEN_QUOTE.includes(q.status)) throw badRequest('errors.quotes.notOpen');
    logQuote(q, 'cancelled', ctx.user.name);
    await this.erp.db.tx((r) => r.quotes.save(q));
    return q;
  }

  async commentQuote(ctx: Ctx, id: string, body: string): Promise<Quote> {
    const q = await this.quote(ctx, id);
    const t = text(body).trim();
    if (t) { q.comments.push({ by: ctx.user.name, at: nowIso(), text: t }); await this.erp.db.tx((r) => r.quotes.save(q)); }
    return q;
  }

  /* ============================== deliveries ============================== */

  async deliveries(ctx: Ctx, q: { customerId?: string; salesRepId?: string; view?: string }): Promise<Delivery[]> {
    const customerIds = await scopedCustomerIds(ctx, this.erp, q.customerId);
    let rows = await this.erp.deliveries({ site: ctx.site || undefined, customerIds });
    if (q.salesRepId) { const mine = new Set((await this.erp.customers()).filter((c) => c.salesRepId === q.salesRepId).map((c) => c.id)); rows = rows.filter((d) => mine.has(d.customerId)); }
    return rows.filter((d) => !q.view || q.view === 'all' || (q.view === 'open' ? ['scheduled', 'out_for_delivery', 'failed'].includes(d.status) : d.status === 'delivered'))
      .sort((a, b) => (a.status === 'delivered') === (b.status === 'delivered') ? a.plannedDate.localeCompare(b.plannedDate) * (a.status === 'delivered' ? -1 : 1) : a.status === 'delivered' ? 1 : -1);
  }

  async delivery(ctx: Ctx, id: string): Promise<Delivery> {
    const [d] = await this.erp.deliveries({ ids: [id] });
    if (!d) throw notFound('errors.deliveries.notFound');
    await assertCustomerInScope(ctx, this.erp, d.customerId, 'errors.deliveries.notFound');
    return d;
  }

  async outForDelivery(ctx: Ctx, id: string, driver?: string, vehicle?: string): Promise<Delivery> {
    requireStaff(ctx);
    const d = await this.delivery(ctx, id);
    if (!['scheduled', 'failed'].includes(d.status)) throw badRequest('errors.deliveries.notOpen');
    await this.erp.db.tx(async (r) => {
      const x = await this.erp.deliveryExt(r, d);
      if (text(driver)) x.driver = text(driver, 120); if (text(vehicle)) x.vehicle = text(vehicle, 60);
      logDel(x, 'out_for_delivery', ctx.user.name, [x.driver, x.vehicle].filter(Boolean).join(' · ') || undefined);
      await r.deliveryExt.save(x);
      await notify(r, { userIds: await customerUserIds(r, d.customerId) }, 'order_dispatched', `Out for delivery: ${d.orderNumber}`, `${d.carrier}${x.driver ? ` · ${x.driver}` : ''}`, `/orders/${d.orderId}`);
    });
    return this.delivery(ctx, id);
  }

  /** Proof of delivery. Staff must capture a signature or a photo; customers confirm in their own login. */
  async pod(ctx: Ctx, id: string, input: { receivedBy: string; signature?: string; photo?: string; notes?: string; lines?: { productId: string; receivedQty: number; damagedQty: number }[]; location?: { lat: number; lng: number } }): Promise<Delivery> {
    const d = await this.delivery(ctx, id);
    const customer = isCustomer(ctx);
    if (!customer && !isStaff(ctx)) throw forbidden();
    if (!['scheduled', 'out_for_delivery'].includes(d.status)) throw badRequest('errors.deliveries.notOpen');
    const receivedBy = text(input?.receivedBy, 200).trim();
    if (!receivedBy) throw badRequest('errors.deliveries.receivedBy');
    const signature = text(input.signature, 2_000_000) || undefined, photo = text(input.photo, 4_000_000) || undefined;
    if (!customer && !signature && !photo) throw badRequest('errors.deliveries.proof');
    const ls = Array.isArray(input.lines) ? input.lines : [];
    const lines = d.lines.map((l) => {
      const x = ls.find((i) => i.productId === l.productId);
      const receivedQty = Math.max(0, Math.min(l.quantity, x ? Number(x.receivedQty) : l.quantity));
      return { productId: l.productId, quantity: l.quantity, receivedQty, damagedQty: Math.max(0, Math.min(receivedQty, Number(x?.damagedQty ?? 0))) };
    });
    const at = nowIso();
    const pod: ProofOfDelivery = { receivedBy, at, signature, photo, notes: text(input.notes).trim() || undefined, recordedBy: ctx.actor, location: input.location && Number.isFinite(input.location.lat) ? { lat: Number(input.location.lat), lng: Number(input.location.lng) } : undefined };
    const issues = lines.filter((l) => l.receivedQty < l.quantity || l.damagedQty > 0).length;
    const order = await this.erp.orders({ ids: [d.orderId] }).then((x) => x[0]);
    await this.erp.db.tx(async (r) => {
      const x = await this.erp.deliveryExt(r, d);
      x.lines = lines.map(({ productId, receivedQty, damagedQty }) => ({ productId, receivedQty, damagedQty }));
      x.pod = pod;
      logDel(x, 'delivered', ctx.user.name, issues ? `${issues} line(s) short or damaged` : `Received by ${receivedBy}`);
      await r.deliveryExt.save(x);
      const ext = (await r.orderExt.get(d.orderId)) ?? { id: d.orderId, site: d.site, customerId: d.customerId, timeline: order?.timeline ?? [], comments: [], at };
      ext.deliveredAt = at;
      if (!ext.timeline.some((e) => e.status === 'delivered')) ext.timeline.push({ status: 'delivered', at, by: ctx.user.name, note: `${d.number} · received by ${receivedBy}` });
      await r.orderExt.save(ext);
      if (issues) await notify(r, { roles: ['SUPERVISOR'], userIds: [order?.salesRepId ?? ''] }, 'order_dispatched', `Delivery issue on ${d.orderNumber}`, `${issues} line(s) short or damaged – ${d.customerName}`, `/deliveries/${d.id}`);
      else if (!customer) await notify(r, { userIds: await customerUserIds(r, d.customerId) }, 'order_dispatched', `Delivered: ${d.orderNumber}`, `Received by ${receivedBy}`, `/orders/${d.orderId}`);
      await r.audit({ userId: ctx.user.id, userName: ctx.user.name, site: ctx.site, action: 'delivery.pod', entity: 'delivery', entityId: id, detail: { receivedBy, issues } });
    });
    return this.delivery(ctx, id);
  }

  async failDelivery(ctx: Ctx, id: string, reason: string): Promise<Delivery> {
    requireStaff(ctx);
    const d = await this.delivery(ctx, id);
    if (d.status !== 'out_for_delivery') throw badRequest('errors.deliveries.notOpen');
    const why = text(reason).trim();
    if (!why) throw badRequest('errors.deliveries.reasonRequired');
    await this.erp.db.tx(async (r) => {
      const x = await this.erp.deliveryExt(r, d);
      x.failReason = why;
      logDel(x, 'failed', ctx.user.name, why);
      await r.deliveryExt.save(x);
      await notify(r, { userIds: await customerUserIds(r, d.customerId) }, 'order_dispatched', `Delivery attempt failed: ${d.orderNumber}`, why.slice(0, 90), `/orders/${d.orderId}`);
    });
    return this.delivery(ctx, id);
  }

  async rescheduleDelivery(ctx: Ctx, id: string, date: string): Promise<Delivery> {
    requireStaff(ctx);
    const d = await this.delivery(ctx, id);
    if (d.status !== 'failed') throw badRequest('errors.deliveries.notOpen');
    if (!date || isNaN(new Date(date).getTime())) throw badRequest('errors.deliveries.date');
    await this.erp.db.tx(async (r) => {
      const x = await this.erp.deliveryExt(r, d);
      x.plannedDate = new Date(date).toISOString(); x.failReason = undefined;
      logDel(x, 'scheduled', ctx.user.name, `Rescheduled to ${new Date(date).toDateString()}`);
      await r.deliveryExt.save(x);
    });
    return this.delivery(ctx, id);
  }

  /* ========================= payments & collections ======================== */

  async payments(ctx: Ctx, q: { customerId?: string; status?: string }): Promise<Payment[]> {
    const customerIds = await scopedCustomerIds(ctx, this.erp, q.customerId);
    return (await this.erp.payments(customerIds)).filter((p) => !q.status || q.status === 'all' || (p.status ?? 'posted') === q.status);
  }

  async payment(ctx: Ctx, id: string): Promise<{ payment: Payment; invoices: Invoice[] }> {
    const portal = await this.erp.db.repos.payments.get(id);
    let payment: Payment | undefined = portal;
    if (!payment) {
      const [rc] = await this.erp.x3.receipts({ ids: [id] });
      if (rc) payment = (await this.erp.payments([rc.customerId])).find((p) => p.id === id);
    }
    if (!payment) throw notFound('errors.payments.notFound');
    await assertCustomerInScope(ctx, this.erp, payment.customerId, 'errors.payments.notFound');
    const nums = payment.allocations?.map((a) => a.invoiceId) ?? payment.invoiceNumbers;
    return { payment, invoices: nums.length ? await this.erp.invoices({ ids: nums }) : [] };
  }

  /** Allocation plan: named invoices first (oldest due first); anything left to the oldest other open invoices. */
  private plan(invoices: Invoice[], namedIds: string[], amount: number, others: boolean) {
    let left = r2(amount);
    const allocations: NonNullable<Payment['allocations']> = [];
    const open = invoices.filter((i) => i.status !== 'paid').sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const groups = [open.filter((i) => namedIds.includes(i.id)), others ? open.filter((i) => !namedIds.includes(i.id)) : []];
    for (const g of groups) for (const i of g) {
      if (left <= 0) break;
      const take = r2(Math.min(left, i.amount - i.paid));
      if (take <= 0) continue;
      allocations.push({ invoiceId: i.id, invoiceNumber: i.number, amount: take });
      left = r2(left - take);
    }
    return { allocations, unallocated: left };
  }

  /**
   * Online payment. Production: the portal creates a session with the client's
   * payment provider and the provider's webhook posts the receipt. Until a
   * provider is configured this posts the receipt straight away.
   */
  async payOnline(ctx: Ctx, input: { customerId: string; invoiceIds: string[]; method: PaymentMethod }): Promise<Payment> {
    const customerId = isCustomer(ctx) ? ctx.user.customerId! : text(input?.customerId, 40);
    await assertCustomerInScope(ctx, this.erp, customerId);
    const ids = Array.isArray(input.invoiceIds) ? input.invoiceIds.map(String) : [];
    const inv = (await this.erp.invoices({ customerIds: [customerId] })).filter((i) => ids.includes(i.id) && i.status !== 'paid');
    if (!inv.length) throw badRequest('errors.payments.noInvoices');
    const amount = r2(inv.reduce((s, i) => s + i.amount - i.paid, 0));
    const { allocations } = this.plan(inv, inv.map((i) => i.id), amount, false);
    const cust = await this.erp.customer(customerId);
    const id = uid('pay');
    const method = METHODS.includes(input.method) ? input.method : 'UPI';
    const reference = `PG${Date.now().toString().slice(-9)}`;
    const rc = await this.erp.gateway.postCustomerReceipt({ ref: id, customerId, site: ctx.site, date: nowIso(), amount, method, reference, allocations: allocations.map((a) => ({ invoiceId: a.invoiceId, amount: a.amount })) });
    const p: Payment & { erpRef: string } = {
      id, number: rc.id, erpRef: rc.id, customerId, customerName: cust.name, date: nowIso(), amount, method, reference, invoiceNumbers: allocations.map((a) => a.invoiceNumber),
      status: 'posted', source: 'online', allocations, enteredBy: ctx.actor, verifiedBy: 'Payment provider', verifiedAt: nowIso(),
    };
    await this.erp.db.tx(async (r) => {
      await r.payments.insert(p);
      await notify(r, { userIds: [cust.salesRepId] }, 'message', `${cust.name} paid online`, `${p.number} · ${allocations.length} invoice(s)`, `/collections?customer=${cust.id}`);
      await activity(r, { actor: ctx.user.name, text: `paid ${allocations.length} invoice(s) online (${p.number})`, kind: 'payment', site: ctx.site });
    });
    return p;
  }

  /** Customer remittance advice or a rep's collection. Waits for finance to match it to the bank. */
  async record(ctx: Ctx, input: { customerId: string; invoiceIds: string[]; amount: number; method: PaymentMethod; reference: string; date: string; note?: string }): Promise<Payment> {
    const customerId = isCustomer(ctx) ? ctx.user.customerId! : text(input?.customerId, 40);
    await assertCustomerInScope(ctx, this.erp, customerId);
    const amount = Number(input.amount);
    if (!(amount > 0)) throw badRequest('errors.payments.amount');
    const method = METHODS.includes(input.method) ? input.method : 'NEFT';
    const ref = text(input.reference, 120).trim();
    if (!ref && method !== 'Cash') throw badRequest('errors.payments.reference');
    const cust = await this.erp.customer(customerId);
    const ids = Array.isArray(input.invoiceIds) ? input.invoiceIds.map(String) : [];
    const inv = (await this.erp.invoices({ customerIds: [customerId] })).filter((i) => ids.includes(i.id));
    const p = await this.erp.db.tx(async (r) => {
      const n = await r.next('payment', 900);
      const pay: Payment = {
        id: uid('pay'), number: `ADV-26-${String(n).padStart(5, '0')}`, customerId, customerName: cust.name, date: input.date && !isNaN(new Date(input.date).getTime()) ? new Date(input.date).toISOString() : nowIso(),
        amount: r2(amount), method, reference: ref || 'CASH', invoiceNumbers: inv.map((i) => i.number), status: 'pending_verification', source: isStaff(ctx) ? 'collection' : 'advice',
        enteredBy: ctx.actor, note: text(input.note).trim() || undefined,
      };
      await r.payments.insert(pay);
      await notify(r, { roles: ['SUPERVISOR'] }, 'message', `Payment to verify: ${cust.name}`, `${pay.number} · ${pay.method} ${pay.reference}`, '/collections?tab=verify');
      return pay;
    });
    return p;
  }

  /** Finance confirms the money is in the bank; X3 posts the receipt and allocates it. */
  async verify(ctx: Ctx, id: string): Promise<Payment> {
    requireManager(ctx);
    const p = await this.erp.db.repos.payments.get(id) as (Payment & { erpRef?: string }) | undefined;
    if (!p) throw notFound('errors.payments.notFound');
    if (p.status !== 'pending_verification') throw badRequest('errors.payments.notPending');
    const invoices = await this.erp.invoices({ customerIds: [p.customerId] });
    const named = invoices.filter((i) => p.invoiceNumbers.includes(i.number)).map((i) => i.id);
    const { allocations, unallocated } = this.plan(invoices, named, p.amount, true);
    // a retry finds the receipt the first call posted
    const existing = (await this.erp.x3.receipts({ portalRef: p.id }))[0];
    const rc = existing ?? await this.erp.gateway.postCustomerReceipt({ ref: p.id, customerId: p.customerId, site: ctx.site, date: p.date, amount: p.amount, method: p.method, reference: p.reference, allocations: allocations.map((a) => ({ invoiceId: a.invoiceId, amount: a.amount })) });
    p.erpRef = rc.id;
    p.allocations = allocations; p.invoiceNumbers = allocations.map((a) => a.invoiceNumber);
    p.status = 'posted'; p.verifiedBy = ctx.user.name; p.verifiedAt = nowIso();
    if (unallocated > 0) p.note = [p.note, `On account: ${unallocated}`].filter(Boolean).join(' · ');
    await this.erp.db.tx(async (r) => {
      await r.payments.save(p);
      await notify(r, { userIds: await customerUserIds(r, p.customerId) }, 'message', `Payment received: ${p.number}`, `${p.method} ${p.reference}`, '/account');
      await r.audit({ userId: ctx.user.id, userName: ctx.user.name, site: ctx.site, action: 'payment.verify', entity: 'payment', entityId: id, detail: { erpRef: rc.id, allocations } });
    });
    return p;
  }

  async rejectPayment(ctx: Ctx, id: string, reason: string): Promise<Payment> {
    requireManager(ctx);
    const p = await this.erp.db.repos.payments.get(id);
    if (!p) throw notFound('errors.payments.notFound');
    if (p.status !== 'pending_verification') throw badRequest('errors.payments.notPending');
    const why = text(reason).trim();
    if (!why) throw badRequest('errors.payments.reasonRequired');
    p.status = 'rejected'; p.verifiedBy = ctx.user.name; p.verifiedAt = nowIso(); p.note = why;
    await this.erp.db.tx(async (r) => {
      await r.payments.save(p);
      await notify(r, { userIds: [...(await customerUserIds(r, p.customerId)), p.enteredBy?.id ?? ''] }, 'message', `Payment not found: ${p.number}`, why.slice(0, 90), '/account');
      await r.audit({ userId: ctx.user.id, userName: ctx.user.name, site: ctx.site, action: 'payment.reject', entity: 'payment', entityId: id, detail: { reason: why } });
    });
    return p;
  }

  private promiseOutcome(n: CollectionNote, payments: Payment[]): CollectionNote['outcome'] {
    if (n.kind !== 'promise' || !n.promiseDate) return undefined;
    const until = new Date(new Date(n.promiseDate).getTime() + DAY).toISOString();
    const paid = payments.filter((p) => p.customerId === n.customerId && (p.status ?? 'posted') !== 'rejected' && p.date >= n.at && p.date <= until).reduce((s, p) => s + p.amount, 0);
    if (paid >= (n.promiseAmount ?? 0) && paid > 0) return 'kept';
    return new Date(n.promiseDate).getTime() + DAY < Date.now() ? 'broken' : 'open';
  }

  /** Receivables aging per customer. Reps see their own customers. */
  async aging(ctx: Ctx, q: { salesRepId?: string }): Promise<AgingRow[]> {
    requireStaff(ctx);
    const scope = await customerScope(ctx, this.erp);
    const custs = (await this.erp.customers(scope)).filter((c) => c.type === 'B2B' && (!q.salesRepId || c.salesRepId === q.salesRepId));
    const ids = custs.map((c) => c.id);
    const [invoices, payments, notes] = await Promise.all([this.erp.invoices({ customerIds: ids }), this.erp.payments(ids), this.erp.db.repos.collectionNotes.find({ customer_id: ids })]);
    const t = Date.now();
    return custs.map((c) => {
      const row: AgingRow = { customerId: c.id, customerName: c.name, customerCode: c.code, salesRepId: c.salesRepId, status: c.status, current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0, total: 0, overdue: 0, pendingVerification: 0, brokenPromises: 0 };
      invoices.filter((i) => i.customerId === c.id && i.status !== 'paid').forEach((i) => {
        const bal = i.amount - i.paid; const days = Math.floor((t - new Date(i.dueDate).getTime()) / DAY);
        if (days <= 0) row.current += bal; else if (days <= 30) row.d1_30 += bal; else if (days <= 60) row.d31_60 += bal; else if (days <= 90) row.d61_90 += bal; else row.d90 += bal;
      });
      (['current', 'd1_30', 'd31_60', 'd61_90', 'd90'] as const).forEach((k) => { row[k] = r2(row[k]); });
      row.overdue = r2(row.d1_30 + row.d31_60 + row.d61_90 + row.d90); row.total = r2(row.current + row.overdue);
      const pays = payments.filter((p) => p.customerId === c.id);
      const last = pays.filter((p) => (p.status ?? 'posted') === 'posted').sort((a, b) => b.date.localeCompare(a.date))[0];
      row.lastPayment = last && { date: last.date, amount: last.amount };
      row.pendingVerification = r2(pays.filter((p) => p.status === 'pending_verification').reduce((s, p) => s + p.amount, 0));
      const promises = notes.filter((n) => n.customerId === c.id && n.kind === 'promise').map((n) => ({ ...n, outcome: this.promiseOutcome(n, payments) }));
      row.openPromise = promises.filter((n) => n.outcome === 'open').sort((a, b) => b.at.localeCompare(a.at))[0];
      row.brokenPromises = promises.filter((n) => n.outcome === 'broken').length;
      return row;
    }).filter((r) => r.total > 0 || r.pendingVerification > 0).sort((a, b) => b.overdue - a.overdue || b.total - a.total);
  }

  async notes(ctx: Ctx, customerId: string): Promise<CollectionNote[]> {
    requireStaff(ctx);
    await assertCustomerInScope(ctx, this.erp, customerId);
    const [notes, payments] = await Promise.all([this.erp.db.repos.collectionNotes.find({ customer_id: customerId }), this.erp.payments([customerId])]);
    return notes.map((n) => ({ ...n, outcome: this.promiseOutcome(n, payments) })).sort((a, b) => b.at.localeCompare(a.at));
  }

  async addNote(ctx: Ctx, customerId: string, input: { kind: 'promise' | 'note'; text: string; promiseDate?: string; promiseAmount?: number }): Promise<CollectionNote> {
    requireStaff(ctx);
    await assertCustomerInScope(ctx, this.erp, customerId);
    const t = text(input?.text).trim();
    if (!t) throw badRequest('errors.requests.commentRequired');
    const kind = input.kind === 'promise' ? 'promise' : 'note';
    if (kind === 'promise' && (!input.promiseDate || !(Number(input.promiseAmount) > 0))) throw badRequest('errors.payments.promiseDetails');
    const n: CollectionNote = { id: uid('cn'), customerId, at: nowIso(), by: ctx.actor, kind, text: t, promiseDate: kind === 'promise' ? input.promiseDate : undefined, promiseAmount: kind === 'promise' ? Number(input.promiseAmount) : undefined };
    await this.erp.db.tx((r) => r.collectionNotes.insert(n));
    return n;
  }

  /** Sends the customer a reminder with their overdue invoices. */
  async remind(ctx: Ctx, customerId: string): Promise<CollectionNote> {
    requireStaff(ctx);
    await assertCustomerInScope(ctx, this.erp, customerId);
    const overdue = (await this.erp.invoices({ customerIds: [customerId] })).filter((i) => i.status === 'overdue');
    const amount = r2(overdue.reduce((s, i) => s + i.amount - i.paid, 0));
    const n: CollectionNote = { id: uid('cn'), customerId, at: nowIso(), by: ctx.actor, kind: 'reminder', text: `Reminder sent for ${overdue.length} overdue invoice(s), ${amount}` };
    await this.erp.db.tx(async (r) => {
      await notify(r, { userIds: await customerUserIds(r, customerId) }, 'message', 'Payment reminder', `${overdue.length} overdue invoice(s): ${overdue.map((i) => i.number).join(', ')}`, '/account');
      await r.collectionNotes.insert(n);
    });
    return n;
  }
}

export { AppError };
