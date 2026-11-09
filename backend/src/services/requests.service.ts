import { Injectable } from '@nestjs/common';
import { Erp } from './erp';
import { activity, assertCustomerInScope, customerScope, DAY, items as parseItems, notify, nowIso, r2, text, uid } from './common';
import { AppError, badRequest, notFound } from '../common/errors';
import { isCustomer, isRep, type Ctx } from '../common/ctx';
import type { Repos } from '../db/portal-db';
import { buildOrderTotals } from '@/lib/domain/pricing';
import { creditCheck } from '@/lib/domain/credit';
import {
  OPEN_REQUEST, REVIEWABLE_REQUEST,
  type ActorRef, type Customer, type Offer, type Product, type RequestLine, type RequestStatus, type SalesRequest, type WorkflowSettings,
} from '@/types/domain';

export const DEFAULT_WORKFLOW: WorkflowSettings = {
  creditMode: 'warn', creditOverrides: {}, autoApprove: { enabled: false, maxTotal: 25000 }, b2cAutoConvert: true, stockHoldHours: 0, requestExpiryDays: 14,
};
const SYSTEM: ActorRef = { id: 'system', name: 'Automatic approval', role: 'ADMIN' };
const OPEN_CONVERTIBLE: RequestStatus[] = ['submitted', 'approved', 'partly_converted'];

export interface SubmitInput {
  customerId: string; items: { productId: string; quantity: number }[]; notes?: string; poNumber?: string; offline?: boolean; consignmentId?: string; quoteId?: string;
  /** Taken offline on the device and sent now that it is back online (kept as source "offline"). */
  fromDevice?: boolean;
}
export interface ConvertOptions { overrideCredit?: boolean; overrideReason?: string; acceptPriceChange?: boolean; onlyAvailable?: boolean; idempotencyKey: string }
export interface ConversionPreview {
  lines: { productId: string; name: string; sku: string; uom: string; open: number; stock: number; priceThen: number; priceNow: number }[];
  totalThen: number; totalNow: number; priceChanged: boolean; shortLines: number; creditIssue: boolean;
}

function log(r: SalesRequest, status: RequestStatus, by: string, note?: string) { r.status = status; r.timeline.push({ status, at: nowIso(), by, note }); }

/** Totals for lines at agreed (quoted) prices. */
function fixedTotals(lines: { line: RequestLine; qty: number }[]) {
  const out = lines.map(({ line, qty }) => ({ ...line, quantity: qty, discountPct: 0, lineTotal: r2(line.unitPrice * qty) })).map(({ convertedQty, ...l }) => { void convertedQty; return l; });
  const subtotal = r2(out.reduce((s, l) => s + l.lineTotal, 0));
  const tax = r2(subtotal * 0.18);
  return { lines: out, subtotal, discount: 0, freeValue: 0, tax, total: r2(subtotal + tax) };
}

/**
 * Sales requests (request-first ordering). Nothing in the portal creates a
 * sales order directly: checkout, quick order, reorder, rep orders, accepted
 * quotes and consignment call-offs all become a request, and the sales order
 * is created in Sage X3 (web service) only when a request is converted.
 */
@Injectable()
export class RequestsService {
  constructor(private erp: Erp) {}

  async workflow(): Promise<WorkflowSettings> {
    return { ...DEFAULT_WORKFLOW, ...((await this.erp.db.repos.setting<WorkflowSettings>('workflow')) ?? {}) };
  }

  async saveWorkflow(ctx: Ctx, next: WorkflowSettings): Promise<WorkflowSettings> {
    const cur = await this.workflow();
    const w: WorkflowSettings = {
      creditMode: next.creditMode === 'block' ? 'block' : 'warn',
      creditOverrides: Object.fromEntries(Object.entries(next.creditOverrides ?? {}).filter(([, v]) => v === 'block' || v === 'warn')),
      autoApprove: { enabled: !!next.autoApprove?.enabled, maxTotal: Math.max(0, Number(next.autoApprove?.maxTotal ?? cur.autoApprove.maxTotal)) },
      b2cAutoConvert: !!next.b2cAutoConvert,
      stockHoldHours: Math.max(0, Number(next.stockHoldHours ?? 0)),
      requestExpiryDays: Math.max(0, Number(next.requestExpiryDays ?? 0)),
    };
    await this.erp.db.tx(async (r) => {
      await r.putSetting('workflow', w, ctx.user.name);
      await r.audit({ userId: ctx.user.id, userName: ctx.user.name, site: ctx.site, action: 'workflow.update', entity: 'settings', entityId: 'workflow', detail: { before: cur, after: w } });
      await activity(r, { actor: ctx.user.name, text: 'updated workflow rules', kind: 'approval', site: ctx.site });
    });
    return w;
  }

  /* ---------------- reading ---------------- */

  /** Requests past their expiry date are closed when read, so lists are always current. */
  private async expire(list: SalesRequest[]) {
    const t = Date.now();
    const due = list.filter((r) => r.expiresAt && ['submitted', 'changes_requested', 'approved'].includes(r.status) && new Date(r.expiresAt).getTime() < t);
    if (!due.length) return;
    await this.erp.db.tx(async (rp) => {
      for (const r of due) { log(r, 'expired', 'System', 'Not converted before the expiry date'); await rp.requests.save(r); }
    });
  }

  private async visible(ctx: Ctx, r: SalesRequest): Promise<boolean> {
    if (r.site && ctx.site && r.site !== ctx.site) return false;
    const scope = await customerScope(ctx, this.erp);
    if (!scope) return true;
    return scope.includes(r.customerId) || (isRep(ctx) && (r.salesRepId === ctx.user.id || r.createdBy.id === ctx.user.id));
  }

  async list(ctx: Ctx, q: { customerId?: string; salesRepId?: string; view?: string; search?: string }): Promise<SalesRequest[]> {
    const scope = await customerScope(ctx, this.erp);
    let rows = await this.erp.db.repos.requests.find({ site: undefined });
    rows = rows.filter((r) => !r.site || !ctx.site || r.site === ctx.site);
    if (scope) rows = rows.filter((r) => scope.includes(r.customerId) || (isRep(ctx) && (r.salesRepId === ctx.user.id || r.createdBy.id === ctx.user.id)));
    await this.expire(rows);
    const s = q.search?.trim().toLowerCase() ?? '';
    return rows.filter((r) =>
      (!q.customerId || r.customerId === q.customerId) && (!q.salesRepId || r.salesRepId === q.salesRepId) &&
      (!q.view || q.view === 'all' || (q.view === 'open' ? OPEN_REQUEST.includes(r.status) : q.view === 'review' ? REVIEWABLE_REQUEST.includes(r.status) : !OPEN_REQUEST.includes(r.status))) &&
      (!s || [r.number, r.customerName, r.poNumber ?? '', ...r.orderNumbers, ...r.lines.map((l) => l.name)].some((v) => v.toLowerCase().includes(s))))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async find(ctx: Ctx, id: string): Promise<SalesRequest> {
    const r = await this.erp.db.repos.requests.get(id);
    if (!r || !(await this.visible(ctx, r))) throw notFound('errors.requests.notFound');
    await this.expire([r]);
    return r;
  }

  /* ---------------- pricing helpers ---------------- */

  private async pricing(site: string) {
    const [products, offers] = await Promise.all([this.erp.productsAt(site), this.erp.offers()]);
    return { products, offers, byId: new Map(products.map((p) => [p.id, p])) };
  }

  /** Remaining (not yet converted) lines priced today at the request's site (quoted prices for an accepted quote). */
  private priceNow(r: SalesRequest, cust: Customer, ctx: { products: Product[]; byId: Map<string, Product>; offers: Offer[] }) {
    if (r.quoteId) return fixedTotals(r.lines.filter((l) => !l.free && l.quantity > l.convertedQty).map((l) => ({ line: l, qty: l.quantity - l.convertedQty })));
    const items = r.lines.filter((l) => !l.free && l.quantity > l.convertedQty && ctx.byId.has(l.productId)).map((l) => ({ product: ctx.byId.get(l.productId)!, quantity: l.quantity - l.convertedQty }));
    return buildOrderTotals(items, cust, r.consignmentId ? [] : ctx.offers, { products: ctx.products, site: r.site });
  }

  private async stockFor(r: SalesRequest): Promise<Map<string, number>> {
    if (r.consignmentId) {
      const c = await this.erp.db.repos.consignments.get(r.consignmentId);
      const rows = c ? await this.erp.x3.locationStock({ site: c.site, locations: [c.location] }) : [];
      return new Map(rows.map((x) => [x.productId, x.quantity]));
    }
    const free = await this.erp.freeStock([r.site!], r.lines.map((l) => l.productId));
    return new Map(r.lines.map((l) => [l.productId, free.get(`${r.site}|${l.productId}`) ?? 0]));
  }

  private async previewOf(r: SalesRequest) {
    const [cust, pc, stock] = await Promise.all([this.erp.customer(r.customerId), this.pricing(r.site!), this.stockFor(r)]);
    const now = this.priceNow(r, cust, pc);
    const lines = r.lines.filter((l) => !l.free && l.quantity > l.convertedQty).map((l) => {
      const pn = now.lines.find((x) => x.productId === l.productId && !x.free);
      return { productId: l.productId, name: l.name, sku: l.sku, uom: l.uom, open: l.quantity - l.convertedQty, stock: stock.get(l.productId) ?? 0, priceThen: l.unitPrice, priceNow: pn?.unitPrice ?? l.unitPrice };
    });
    const allLines = r.lines.reduce((s, l) => s + l.lineTotal, 0);
    const open = r.lines.reduce((s, l) => s + (l.lineTotal * (l.quantity - l.convertedQty)) / (l.quantity || 1), 0);
    const totalThen = open * (allLines ? (allLines + r.tax) / allLines : 1);
    const preview: ConversionPreview = {
      lines, totalThen: r2(totalThen), totalNow: now.total, priceChanged: lines.some((l) => Math.abs(l.priceNow - l.priceThen) > 0.009),
      shortLines: lines.filter((l) => l.stock < l.open).length, creditIssue: !!r.credit && (r.credit.over || r.credit.onHold) && !r.creditOverride,
    };
    return { preview, cust, pc };
  }

  async preview(ctx: Ctx, id: string): Promise<ConversionPreview> {
    return (await this.previewOf(await this.find(ctx, id))).preview;
  }

  /* ---------------- conversion: the only way a sales order is created ---------------- */

  private async convertNow(r: SalesRequest, actor: ActorRef, opts: Omit<ConvertOptions, 'idempotencyKey'>, ref: string, rp?: Repos): Promise<SalesRequest> {
    if (!OPEN_CONVERTIBLE.includes(r.status)) throw badRequest('errors.requests.notOpen');
    const { preview: p, cust, pc } = await this.previewOf(r);
    if (p.creditIssue && !opts.overrideCredit) throw badRequest('errors.requests.creditOverrideNeeded');
    if (p.priceChanged && !opts.acceptPriceChange) throw new AppError('errors.requests.priceChanged', 409);
    const at = nowIso();
    if (p.creditIssue && opts.overrideCredit) r.creditOverride = { by: actor.name, at, reason: opts.overrideReason ?? '' };

    const take = p.lines.map((l) => ({ ...l, qty: opts.onlyAvailable ? Math.min(l.open, Math.max(0, l.stock)) : l.open })).filter((l) => l.qty > 0);
    if (!take.length) throw badRequest('errors.requests.nothingInStock');
    const totals = r.quoteId
      ? fixedTotals(take.map((l) => ({ line: r.lines.find((x) => x.productId === l.productId && !x.free)!, qty: l.qty })))
      : buildOrderTotals(take.map((l) => ({ product: pc.byId.get(l.productId)!, quantity: l.qty })), cust, r.consignmentId ? [] : pc.offers, { products: pc.products, site: r.site });

    const cons = r.consignmentId ? await this.erp.db.repos.consignments.get(r.consignmentId) : undefined;
    // a retry with the same key finds the order the first call created in X3
    const existing = (await this.erp.x3.orders({ portalRef: ref }))[0];
    const net = r2(totals.lines.reduce((s, l) => s + l.lineTotal, 0));
    const orderId = existing?.id ?? (await this.erp.gateway.createSalesOrder({
      ref, customerId: r.customerId, site: r.site!, poNumber: r.poNumber, expectedDelivery: new Date(Date.now() + 4 * DAY).toISOString(),
      repCode: (await this.erp.repMaps()).byUser.get(r.salesRepId),
      lines: totals.lines.map((l) => ({
        productId: l.productId, name: l.name, quantity: l.quantity, grossPrice: l.free ? 0 : l.unitPrice, netPrice: l.quantity ? r2(l.lineTotal / l.quantity) : 0,
        discountPct: l.discountPct, free: !!l.free, location: cons?.location,
      })),
      net, total: totals.total,
    })).id;

    take.forEach((l) => { const line = r.lines.find((x) => x.productId === l.productId && !x.free)!; line.convertedQty += l.qty; });
    r.orderIds.push(orderId); r.orderNumbers.push(orderId);
    r.holdUntil = undefined;
    const done = r.lines.filter((l) => !l.free).every((l) => l.convertedQty >= l.quantity);
    if (done) r.lines.filter((l) => l.free).forEach((l) => { l.convertedQty = l.quantity; });
    if (r.status === 'submitted') r.timeline.push({ status: 'approved', at, by: actor.name, note: actor.id === SYSTEM.id ? 'Within auto-approval rules' : opts.overrideCredit ? 'Approved with credit override' : undefined });
    log(r, done ? 'converted' : 'partly_converted', actor.name, done ? `Sales order ${orderId} created` : `Sales order ${orderId} created for the lines in stock; the rest stays open`);

    const save = async (x: Repos) => {
      await x.orderExt.save({
        id: orderId, site: r.site, customerId: r.customerId, requestId: r.id, requestNumber: r.number, createdBy: r.createdBy, source: r.source, notes: r.notes,
        lines: totals.lines.map((l, i) => ({ lineNo: (i + 1) * 1000, productId: l.productId, listPrice: l.listPrice, offerId: l.offerId, offerCode: l.offerCode, free: l.free, freeFor: l.freeFor, image: l.image })),
        timeline: [{ status: 'confirmed', at, by: actor.name, note: `Created from request ${r.number} in Sage X3` }], comments: [],
        creditOverride: r.creditOverride ? { by: r.creditOverride.by, at: r.creditOverride.at, exceededBy: r.credit?.exceededBy ?? 0, reason: r.creditOverride.reason } : undefined,
        erpStatus: 'confirmed', at,
      });
      await x.requests.save(r);
      await activity(x, { actor: actor.name, text: `converted request ${r.number} to order ${orderId}`, kind: 'approval', site: r.site });
      await notify(x, { userIds: [r.createdBy.id, r.salesRepId] }, 'request_update', done ? `Order ${orderId} confirmed` : `Order ${orderId} confirmed (part)`, `Your request ${r.number} is now sales order ${orderId}.`, `/requests/${r.id}`);
    };
    if (rp) await save(rp); else await this.erp.db.tx(save);
    return r;
  }

  async convert(ctx: Ctx, id: string, opts: ConvertOptions): Promise<SalesRequest> {
    const key = text(opts?.idempotencyKey, 100);
    if (!key) throw badRequest('errors.requests.idempotencyKey');
    const prior = await this.erp.db.k('idempotency').where({ key: `convert:${key}` }).first();
    if (prior) return this.find(ctx, prior.result_id);
    const r = await this.find(ctx, id);
    const out = await this.convertNow(r, ctx.actor, opts, `${r.number}/${key}`);
    await this.erp.db.k('idempotency').insert({ key: `convert:${key}`, scope: 'request.convert', result_id: id, created_at: nowIso() }).catch(() => undefined);
    await this.erp.db.repos.audit({ userId: ctx.user.id, userName: ctx.user.name, site: ctx.site, action: 'request.convert', entity: 'sales_request', entityId: id, detail: { orders: out.orderNumbers, opts } });
    return out;
  }

  /* ---------------- submitting ---------------- */

  private creditMode(w: WorkflowSettings, customerId: string) { return w.creditOverrides[customerId] ?? w.creditMode; }

  /** Credit check, numbering, hold/expiry, then auto-approval or review. Saves the request. */
  private async submitDraft(r: SalesRequest, actor: ActorRef, cust: Customer): Promise<SalesRequest> {
    const w = await this.workflow();
    const orders = cust.type === 'B2B' ? await this.erp.orders({ customerIds: [cust.id] }) : [];
    const cc = cust.type === 'B2B' ? creditCheck({ id: r.id, total: r.total }, cust, orders) : null;
    if (cc && (cc.over || cc.onHold) && this.creditMode(w, cust.id) === 'block') throw badRequest(cc.onHold ? 'errors.requests.accountOnHold' : 'errors.requests.creditBlocked');
    r.credit = cc ? { over: cc.over, onHold: cc.onHold, exceededBy: cc.exceededBy, available: cc.available } : undefined;
    if (r.number.startsWith('DRAFT')) r.number = await this.erp.db.tx((x) => x.next('request', 1040)).then((n) => `SR-26-${String(n).padStart(5, '0')}`);
    const at = Date.now();
    r.expiresAt = w.requestExpiryDays ? new Date(at + w.requestExpiryDays * DAY).toISOString() : undefined;
    // consignment stock is already set aside for the customer, so no hold is needed
    r.holdUntil = w.stockHoldHours && !r.consignmentId ? new Date(at + w.stockHoldHours * 3600000).toISOString() : undefined;
    log(r, 'submitted', actor.name, r.source === 'offline' ? 'Synced from device' : 'Submitted for review');
    await this.erp.db.tx((x) => x.requests.save(r));

    const auto = cust.type === 'B2C' ? w.b2cAutoConvert && r.paid
      : w.autoApprove.enabled && r.total <= w.autoApprove.maxTotal && !r.credit?.over && !r.credit?.onHold && cust.status === 'active';
    if (auto) {
      r.autoApproved = true;
      try { return await this.convertNow(r, SYSTEM, { acceptPriceChange: true }, `${r.number}/auto`); } catch { /* falls through to review (for example nothing in stock) */ }
      r.autoApproved = undefined;
    }
    const flag = r.credit?.over || r.credit?.onHold;
    await this.erp.db.tx(async (x) => {
      await x.requests.save(r);
      await notify(x, { roles: ['SUPERVISOR'] }, 'approval_required', flag ? 'Credit check on new request' : 'New sales request', `${r.number} from ${r.customerName} – ${r.lines.length} items`, `/approvals?request=${r.id}`);
    });
    return r;
  }

  async submit(ctx: Ctx, input: SubmitInput): Promise<SalesRequest> {
    const customerId = isCustomer(ctx) ? ctx.user.customerId! : text(input?.customerId, 40);
    if (!customerId) throw badRequest('errors.requests.empty');
    await assertCustomerInScope(ctx, this.erp, customerId);
    const cust = await this.erp.customer(customerId);
    const cons = input.consignmentId ? await this.erp.db.repos.consignments.get(input.consignmentId) : undefined;
    if (input.consignmentId && (!cons || cons.customerId !== cust.id)) throw notFound('errors.consignment.notFound');
    const quote = input.quoteId ? await this.erp.db.repos.quotes.get(input.quoteId) : undefined;
    if (input.quoteId && (!quote || quote.customerId !== cust.id)) throw notFound('errors.quotes.notFound');
    const site = cons?.site ?? quote?.site ?? ctx.site;
    const pc = await this.pricing(site);
    const its = parseItems(input.items).filter((i) => i.quantity > 0 && pc.byId.has(i.productId)).map((i) => ({ product: pc.byId.get(i.productId)!, quantity: i.quantity }));
    if (!its.length) throw badRequest('errors.requests.empty');
    if (cons) {
      const open = (await this.erp.db.repos.requests.find({ status: ['submitted', 'changes_requested', 'approved', 'partly_converted'] })).filter((x) => x.consignmentId === cons.id);
      const stock = new Map((await this.erp.x3.locationStock({ site: cons.site, locations: [cons.location] })).map((x) => [x.productId, x.quantity]));
      for (const i of its) {
        const reserved = open.reduce((s, x) => s + x.lines.filter((l) => l.productId === i.product.id && !l.free).reduce((a, l) => a + l.quantity - l.convertedQty, 0), 0);
        if (!stock.has(i.product.id) || (stock.get(i.product.id) ?? 0) - reserved < i.quantity) throw badRequest('errors.consignment.notEnough');
      }
    }
    const totals = quote
      ? fixedTotals(quote.lines.map((l) => ({ line: { productId: l.productId, sku: l.sku, name: l.name, uom: l.uom, image: l.image, quantity: l.quantity, listPrice: l.listPrice, unitPrice: l.unitPrice, discountPct: 0, lineTotal: l.lineTotal, convertedQty: 0 }, qty: l.quantity })))
      // consignment stock is already the customer's: offers don't apply to call-offs
      : buildOrderTotals(its, cust, cons ? [] : pc.offers, { products: pc.products, site });
    const at = nowIso();
    const offline = !!input.offline;
    const number = offline ? `DRAFT-${uid('').slice(1, 7).toUpperCase()}` : `SR-26-${String(await this.erp.db.tx((x) => x.next('request', 1040))).padStart(5, '0')}`;
    const r: SalesRequest = {
      id: uid('req'), number, site, consignmentId: cons?.id, quoteId: quote?.id, quoteNumber: quote?.number, customerId: cust.id, customerName: cust.name, salesRepId: cust.salesRepId,
      createdBy: ctx.actor, source: offline || input.fromDevice ? 'offline' : ctx.user.role === 'SALES_REP' ? 'sales_app' : 'portal', date: at, status: 'draft',
      lines: totals.lines.map((l) => ({ ...l, convertedQty: 0 })), subtotal: totals.subtotal, discount: totals.discount, tax: totals.tax, total: totals.total,
      poNumber: text(input.poNumber, 60) || undefined, notes: text(input.notes, 2000) || undefined, deliveryAddress: cust.address, billingAddress: cust.billingAddress,
      paid: cust.type === 'B2C' && !offline ? true : undefined, orderIds: [], orderNumbers: [], comments: [],
      timeline: [{ status: 'draft', at, by: ctx.user.name, note: offline ? 'Saved on device – sent when back online' : undefined }],
    };
    await this.erp.db.tx(async (x) => {
      await x.requests.insert(r);
      await activity(x, { actor: ctx.user.name, text: `submitted request ${r.number} for ${cust.name}`, kind: 'order', site });
    });
    if (offline) return r;
    try {
      return await this.submitDraft(r, ctx.actor, cust);
    } catch (e) {
      // a blocked submission leaves nothing behind
      await this.erp.db.repos.requests.remove(r.id);
      throw e;
    }
  }

  /** Send the caller's offline drafts. Each is checked exactly like an online submission. */
  async syncDrafts(ctx: Ctx): Promise<{ sent: number; blocked: number }> {
    const drafts = (await this.erp.db.repos.requests.find({ status: 'draft' })).filter((r) => r.source === 'offline' && r.createdBy.id === ctx.user.id);
    let sent = 0, blocked = 0;
    for (const r of drafts) {
      try { await this.submitDraft(r, ctx.actor, await this.erp.customer(r.customerId)); sent++; } catch (e) {
        blocked++;
        const fresh = (await this.erp.db.repos.requests.get(r.id))!;
        fresh.comments.push({ by: 'System', at: nowIso(), text: (e as AppError).code ?? (e as Error).message });
        await this.erp.db.tx((x) => x.requests.save(fresh));
      }
    }
    return { sent, blocked };
  }

  /* ---------------- review ---------------- */

  async review(ctx: Ctx, id: string, decision: 'changes' | 'reject', comment: string): Promise<SalesRequest> {
    const r = await this.find(ctx, id);
    if (!OPEN_CONVERTIBLE.includes(r.status)) throw badRequest('errors.requests.notOpen');
    const c = text(comment).trim();
    if (!c) throw badRequest('errors.requests.commentRequired');
    r.comments.push({ by: ctx.user.name, at: nowIso(), text: c });
    log(r, decision === 'reject' ? 'rejected' : 'changes_requested', ctx.user.name, c);
    r.holdUntil = undefined;
    await this.erp.db.tx(async (x) => {
      await x.requests.save(r);
      await notify(x, { userIds: [r.createdBy.id, r.salesRepId] }, 'request_update', decision === 'reject' ? `Request ${r.number} rejected` : `Changes requested on ${r.number}`, c.slice(0, 90), `/requests/${r.id}`);
      await x.audit({ userId: ctx.user.id, userName: ctx.user.name, site: ctx.site, action: `request.${decision}`, entity: 'sales_request', entityId: id, detail: { comment: c } });
    });
    return r;
  }

  /** Withdraw a request (or the open remainder of a partly converted one). */
  async cancel(ctx: Ctx, id: string, note?: string): Promise<SalesRequest> {
    const r = await this.find(ctx, id);
    if (!OPEN_REQUEST.includes(r.status)) throw badRequest('errors.requests.notOpen');
    log(r, r.orderIds.length ? 'converted' : 'cancelled', ctx.user.name, text(note) || 'Cancelled by requester');
    r.holdUntil = undefined;
    await this.erp.db.tx((x) => x.requests.save(r));
    return r;
  }

  async comment(ctx: Ctx, id: string, body: string): Promise<SalesRequest> {
    const r = await this.find(ctx, id);
    const t = text(body).trim();
    if (t) r.comments.push({ by: ctx.user.name, at: nowIso(), text: t });
    await this.erp.db.tx((x) => x.requests.save(r));
    return r;
  }

  /** Used by quotes and consignment call-offs: same rules as the cart. */
  submitFor(ctx: Ctx, input: SubmitInput) { return this.submit(ctx, input); }
}
