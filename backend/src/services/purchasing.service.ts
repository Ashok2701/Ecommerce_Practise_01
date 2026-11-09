import { Injectable } from '@nestjs/common';
import { Erp } from './erp';
import { activity, DAY, items as parseItems, notify, nowIso, r2, requireManager, supplierUserIds, text, uid } from './common';
import { badRequest, forbidden, notFound } from '../common/errors';
import { isManager, isSupplier, type Ctx } from '../common/ctx';
import type { Repos } from '../db/portal-db';
import { stockStatus } from '@/lib/domain/pricing';
import type { Product, PurchaseLine, PurchaseOrder, PurchaseOrderStatus, PurchaseRequest, PurchaseRequestStatus, Supplier } from '@/types/domain';

const OPEN_PR: PurchaseRequestStatus[] = ['submitted', 'changes_requested'];
const OPEN_PO: PurchaseOrderStatus[] = ['issued', 'acknowledged', 'pickup_confirmed', 'in_transit', 'partly_received'];
function logPr(r: PurchaseRequest, status: PurchaseRequestStatus, by: string, note?: string) { r.status = status; r.timeline.push({ status, at: nowIso(), by, note }); }

export interface CatalogItem { product: Product; unitCost: number; low: boolean }

/**
 * Purchasing: supplier pickup offers and internal purchase requests become
 * purchase orders in Sage X3 on conversion; suppliers acknowledge, confirm
 * pickup and dispatch; the warehouse receives (X3 purchase receipt).
 * Supplier logins only ever see their own supplier's documents.
 */
@Injectable()
export class PurchasingService {
  constructor(private erp: Erp) {}

  /** A supplier login is pinned to its own supplier; buyers may pick any. */
  private supplierFor(ctx: Ctx, requested?: string): string | undefined {
    if (isSupplier(ctx)) return ctx.user.supplierId ?? '__none__';
    return requested || undefined;
  }
  private assertSupplier(ctx: Ctx, supplierId: string) {
    if (isSupplier(ctx) && ctx.user.supplierId !== supplierId) throw notFound('errors.purchasing.notFound');
  }
  private requireBuyer(ctx: Ctx) { if (!isManager(ctx)) throw forbidden(); }

  async suppliers(ctx: Ctx): Promise<Supplier[]> {
    const all = await this.erp.suppliers();
    return isSupplier(ctx) ? all.filter((s) => s.id === ctx.user.supplierId) : all;
  }

  async supplier(ctx: Ctx, id: string): Promise<Supplier> { this.assertSupplier(ctx, id); return this.erp.supplier(id); }

  /** Products a supplier can deliver, with our stock at the current site. */
  async catalog(ctx: Ctx, supplierId: string): Promise<CatalogItem[]> {
    this.assertSupplier(ctx, supplierId);
    const items = (await this.erp.x3.supplierItems()).filter((i) => i.supplierId === supplierId);
    const products = await this.erp.productsAt(ctx.site, items.map((i) => i.productId));
    return products.map((p) => ({ product: p, unitCost: items.find((i) => i.productId === p.id)!.unitCost, low: stockStatus(p) !== 'in_stock' })).sort((a, b) => Number(b.low) - Number(a.low));
  }

  async reorderSuggestions(ctx: Ctx, supplierId: string) {
    this.requireBuyer(ctx);
    return (await this.catalog(ctx, supplierId)).filter((c) => c.low).map((c) => ({ productId: c.product.id, suggested: Math.max(c.product.moq * 10, 50) }));
  }

  async summary(ctx: Ctx, id: string) {
    this.assertSupplier(ctx, id);
    const supplier = await this.erp.supplier(id);
    const pos = await this.erp.purchaseOrders({ supplierId: id, site: ctx.site || undefined });
    const open = pos.filter((o) => OPEN_PO.includes(o.status));
    const received = pos.filter((o) => o.status === 'received');
    const onTime = received.filter((o) => { const last = o.receipts.at(-1); return last && new Date(last.at).getTime() <= new Date(o.expectedDate).getTime() + DAY; }).length;
    const prs = (await this.erp.db.repos.purchaseRequests.find({ party_id: id })).filter((r) => (!r.site || r.site === ctx.site) && OPEN_PR.includes(r.status));
    const users = (await this.erp.users()).filter((u) => u.supplierId === id).map((u) => ({ id: u.id, name: u.name, email: u.email, status: u.status }));
    return {
      supplier, openPos: open.length, openPoValue: Math.round(open.reduce((s, o) => s + o.total, 0)), receivedValue: Math.round(received.reduce((s, o) => s + o.total, 0)),
      openRequests: prs.length, onTimePct: received.length ? Math.round((onTime / received.length) * 100) : undefined, users: isSupplier(ctx) ? [] : users,
    };
  }

  /* ---------------- purchase requests ---------------- */

  async requests(ctx: Ctx, q: { supplierId?: string; view?: string }): Promise<PurchaseRequest[]> {
    const sup = this.supplierFor(ctx, q.supplierId);
    return (await this.erp.db.repos.purchaseRequests.find(sup ? { party_id: sup } : {})).filter((r) => (!r.site || !ctx.site || r.site === ctx.site) &&
      (!q.view || q.view === 'all' || (q.view === 'open' ? OPEN_PR.includes(r.status) : !OPEN_PR.includes(r.status))));
  }

  async request(ctx: Ctx, id: string): Promise<PurchaseRequest> {
    const r = await this.erp.db.repos.purchaseRequests.get(id);
    if (!r) throw notFound('errors.purchasing.notFound');
    this.assertSupplier(ctx, r.supplierId);
    return r;
  }

  async createRequest(ctx: Ctx, input: { supplierId: string; source: 'pickup' | 'internal'; items: { productId: string; quantity: number }[]; proposedDate?: string; notes?: string }): Promise<PurchaseRequest> {
    const source = isSupplier(ctx) ? 'pickup' : 'internal';
    if (!isSupplier(ctx)) this.requireBuyer(ctx);
    const supplierId = this.supplierFor(ctx, text(input?.supplierId, 40))!;
    const sup = await this.erp.supplier(supplierId);
    const costs = new Map((await this.erp.x3.supplierItems()).filter((i) => i.supplierId === sup.id).map((i) => [i.productId, i.unitCost]));
    const products = new Map((await this.erp.x3.products()).map((p) => [p.id, p]));
    const lines: PurchaseLine[] = parseItems(input.items).filter((i) => i.quantity > 0 && costs.has(i.productId) && products.has(i.productId)).map((i) => {
      const p = products.get(i.productId)!; const c = costs.get(i.productId)!;
      return { productId: p.id, sku: p.sku, name: p.name, uom: p.uom, quantity: i.quantity, unitCost: c, lineTotal: r2(c * i.quantity) };
    });
    if (!lines.length) throw badRequest('errors.purchasing.empty');
    return this.erp.db.tx(async (r) => {
      const n = await r.next('pr', 310);
      const at = nowIso();
      const pr: PurchaseRequest = {
        id: uid('pr'), number: `PR-26-${String(n).padStart(5, '0')}`, site: ctx.site, supplierId: sup.id, supplierName: sup.name, source, createdBy: ctx.actor, date: at, status: 'submitted',
        lines, total: r2(lines.reduce((s, l) => s + l.lineTotal, 0)), proposedDate: input.proposedDate || undefined, notes: text(input.notes).trim() || undefined, comments: [],
        timeline: [{ status: 'submitted', at, by: ctx.user.name, note: source === 'pickup' ? 'Pickup offered by supplier' : undefined }],
      };
      await r.purchaseRequests.insert(pr);
      await activity(r, { actor: ctx.user.name, text: `${source === 'pickup' ? 'offered pickup' : 'raised purchase request'} ${pr.number} (${sup.name})`, kind: 'order', site: ctx.site });
      if (source === 'pickup') await notify(r, { roles: ['SUPERVISOR'] }, 'purchase_update', `Pickup offered by ${sup.name}`, `${pr.number} – ${lines.length} items`, `/purchase-requests/${pr.id}`);
      return pr;
    });
  }

  /** Convert to a purchase order in X3. Idempotent: a converted request returns its existing PO. */
  async convert(ctx: Ctx, id: string, expectedDate: string): Promise<PurchaseRequest> {
    this.requireBuyer(ctx);
    const pr = await this.request(ctx, id);
    if (pr.status === 'converted') return pr;
    if (!OPEN_PR.includes(pr.status)) throw badRequest('errors.purchasing.notOpen');
    const expected = expectedDate && !isNaN(new Date(expectedDate).getTime()) ? new Date(expectedDate).toISOString() : new Date(Date.now() + 5 * DAY).toISOString();
    const existing = (await this.erp.x3.purchaseOrders({ portalRef: pr.number }))[0];
    const poId = existing?.id ?? (await this.erp.gateway.createPurchaseOrder({ ref: pr.number, supplierId: pr.supplierId, site: pr.site!, expectedDate: expected, lines: pr.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitCost: l.unitCost })) })).id;
    const at = nowIso();
    pr.orderId = poId; pr.orderNumber = poId;
    logPr(pr, 'converted', ctx.user.name, `Purchase order ${poId} created`);
    await this.erp.db.tx(async (r) => {
      const timeline: PurchaseOrder['timeline'] = [{ status: 'issued', at, by: ctx.user.name, note: `Created from ${pr.number} in Sage X3` }];
      // a supplier's own pickup offer needs no separate acknowledgement
      if (pr.source === 'pickup') timeline.push({ status: 'acknowledged', at, by: pr.createdBy.name, note: 'Offered by the supplier' });
      await r.poExt.save({ id: poId, site: pr.site, supplierId: pr.supplierId, status: pr.source === 'pickup' ? 'acknowledged' : 'issued', requestId: pr.id, requestNumber: pr.number, timeline, at });
      await r.purchaseRequests.save(pr);
      await notify(r, { userIds: await supplierUserIds(r, pr.supplierId) }, 'purchase_update', `Purchase order ${poId}`, pr.source === 'pickup' ? `Your pickup ${pr.number} is accepted. Confirm the pickup details.` : 'New purchase order from us. Please acknowledge it.', `/purchase-orders/${poId}`);
      await activity(r, { actor: ctx.user.name, text: `converted ${pr.number} to ${poId}`, kind: 'approval', site: pr.site });
    });
    return pr;
  }

  async review(ctx: Ctx, id: string, decision: 'changes' | 'reject', comment: string): Promise<PurchaseRequest> {
    this.requireBuyer(ctx);
    const pr = await this.request(ctx, id);
    if (!OPEN_PR.includes(pr.status)) throw badRequest('errors.purchasing.notOpen');
    const c = text(comment).trim();
    if (!c) throw badRequest('errors.requests.commentRequired');
    pr.comments.push({ by: ctx.user.name, at: nowIso(), text: c });
    logPr(pr, decision === 'reject' ? 'rejected' : 'changes_requested', ctx.user.name, c);
    await this.erp.db.tx(async (r) => {
      await r.purchaseRequests.save(pr);
      if (pr.source === 'pickup') await notify(r, { userIds: await supplierUserIds(r, pr.supplierId) }, 'purchase_update', decision === 'reject' ? `Pickup ${pr.number} declined` : `Changes requested on ${pr.number}`, c.slice(0, 90), `/purchase-requests/${pr.id}`);
    });
    return pr;
  }

  async cancelRequest(ctx: Ctx, id: string): Promise<PurchaseRequest> {
    const pr = await this.request(ctx, id);
    if (!OPEN_PR.includes(pr.status)) throw badRequest('errors.purchasing.notOpen');
    if (pr.createdBy.id !== ctx.user.id && !isManager(ctx)) throw forbidden();
    logPr(pr, 'cancelled', ctx.user.name);
    await this.erp.db.tx((r) => r.purchaseRequests.save(pr));
    return pr;
  }

  async commentRequest(ctx: Ctx, id: string, body: string): Promise<PurchaseRequest> {
    const pr = await this.request(ctx, id);
    const c = text(body).trim();
    if (c) { pr.comments.push({ by: ctx.user.name, at: nowIso(), text: c }); await this.erp.db.tx((r) => r.purchaseRequests.save(pr)); }
    return pr;
  }

  /* ---------------- purchase orders ---------------- */

  async orders(ctx: Ctx, q: { supplierId?: string; view?: string }): Promise<PurchaseOrder[]> {
    const sup = this.supplierFor(ctx, q.supplierId);
    return (await this.erp.purchaseOrders({ supplierId: sup, site: isSupplier(ctx) ? undefined : ctx.site || undefined }))
      .filter((o) => (!isSupplier(ctx) || !ctx.site || o.site === ctx.site) && (!q.view || q.view === 'all' || (q.view === 'open' ? OPEN_PO.includes(o.status) : !OPEN_PO.includes(o.status))))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async order(ctx: Ctx, id: string): Promise<PurchaseOrder> {
    const o = await this.erp.purchaseOrder(id);
    this.assertSupplier(ctx, o.supplierId);
    return o;
  }

  private async move(ctx: Ctx, id: string, allowed: PurchaseOrder['status'][], change: (o: PurchaseOrder, x: Awaited<ReturnType<Erp['poExt']>>, r: Repos) => Promise<void>) {
    const o = await this.order(ctx, id);
    if (!allowed.includes(o.status)) throw badRequest('errors.purchasing.notOpen');
    await this.erp.db.tx(async (r) => { const x = await this.erp.poExt(r, o); await change(o, x, r); await r.poExt.save(x); });
    return this.order(ctx, id);
  }

  private log(x: { status: string; timeline: PurchaseOrder['timeline'] }, status: PurchaseOrder['status'], by: string, note?: string) {
    if (status !== 'partly_received' && status !== 'received') x.status = status as typeof x.status;
    x.timeline.push({ status, at: nowIso(), by, note });
  }

  acknowledge(ctx: Ctx, id: string) {
    if (!isSupplier(ctx)) throw forbidden();
    return this.move(ctx, id, ['issued'], async (o, x, r) => {
      this.log(x, 'acknowledged', ctx.user.name);
      await notify(r, { roles: ['SUPERVISOR'] }, 'purchase_update', `${o.number} acknowledged`, `${o.supplierName} accepted the order`, `/purchase-orders/${o.id}`);
    });
  }

  pickup(ctx: Ctx, id: string, p: { date: string; vehicle: string; driver?: string; documents?: string }) {
    if (!isSupplier(ctx)) throw forbidden();
    if (!p?.date || isNaN(new Date(p.date).getTime()) || !text(p.vehicle).trim()) throw badRequest('errors.purchasing.pickupDetails');
    const pickup = { date: p.date, vehicle: text(p.vehicle, 60).trim(), driver: text(p.driver, 120).trim() || undefined, documents: text(p.documents, 500).trim() || undefined };
    return this.move(ctx, id, ['acknowledged', 'pickup_confirmed'], async (o, x, r) => {
      x.pickup = pickup;
      if (x.status !== 'pickup_confirmed') this.log(x, 'pickup_confirmed', ctx.user.name, `${pickup.vehicle}${pickup.driver ? ` · ${pickup.driver}` : ''}`);
      await notify(r, { roles: ['SUPERVISOR'] }, 'purchase_update', `Pickup confirmed for ${o.number}`, `${o.supplierName}: ${new Date(pickup.date).toDateString()}, ${pickup.vehicle}`, `/purchase-orders/${o.id}`);
    });
  }

  dispatch(ctx: Ctx, id: string) {
    if (!isSupplier(ctx)) throw forbidden();
    return this.move(ctx, id, ['pickup_confirmed'], async (o, x, r) => {
      this.log(x, 'in_transit', ctx.user.name);
      await notify(r, { roles: ['SUPERVISOR'] }, 'purchase_update', `${o.number} in transit`, `${o.supplierName} dispatched the goods`, `/purchase-orders/${o.id}`);
    });
  }

  /** Warehouse goods receipt: X3 purchase receipt adds the stock at the PO's site. Partial receipts keep the order open. */
  async receive(ctx: Ctx, id: string, raw: unknown) {
    requireManager(ctx);
    const o = await this.order(ctx, id);
    if (!['in_transit', 'partly_received'].includes(o.status)) throw badRequest('errors.purchasing.notOpen');
    const take = parseItems(raw).map((l) => {
      const line = o.lines.find((x) => x.productId === l.productId);
      return { productId: l.productId, quantity: line ? Math.max(0, Math.min(l.quantity, line.quantity - line.receivedQty)) : 0 };
    }).filter((l) => l.quantity > 0);
    if (!take.length) throw badRequest('errors.purchasing.nothingToReceive');
    const grn = await this.erp.gateway.postGoodsReceipt({ ref: `${o.number}/${uid('g')}`, orderId: o.id, supplierId: o.supplierId, site: o.site!, user: ctx.user.name, lines: take });
    const fresh = await this.erp.purchaseOrder(id);
    const done = fresh.lines.every((l) => l.receivedQty >= l.quantity);
    await this.erp.db.tx(async (r) => {
      const x = await this.erp.poExt(r, o);
      x.receiptsBy = { ...(x.receiptsBy ?? {}), [grn.id]: ctx.user.name };
      this.log(x, done ? 'received' : 'partly_received', ctx.user.name, grn.id);
      await r.poExt.save(x);
      await notify(r, { userIds: await supplierUserIds(r, o.supplierId) }, 'purchase_update', `Goods received for ${o.number}`, `${grn.id}${done ? '' : ' (part)'}`, `/purchase-orders/${o.id}`);
      await activity(r, { actor: ctx.user.name, text: `received ${grn.id} for ${o.number}`, kind: 'order', site: o.site });
    });
    return this.order(ctx, id);
  }

  async cancel(ctx: Ctx, id: string, reason: string) {
    this.requireBuyer(ctx);
    const o = await this.order(ctx, id);
    if (!['issued', 'acknowledged'].includes(o.status)) throw badRequest('errors.purchasing.notOpen');
    await this.erp.gateway.closePurchaseOrder(o.id, `${o.number}/cancel`);
    await this.erp.db.tx(async (r) => {
      const x = await this.erp.poExt(r, o);
      this.log(x, 'cancelled', ctx.user.name, text(reason).trim() || undefined);
      await r.poExt.save(x);
      await notify(r, { userIds: await supplierUserIds(r, o.supplierId) }, 'purchase_update', `${o.number} cancelled`, text(reason).slice(0, 90), `/purchase-orders/${o.id}`);
    });
    return this.order(ctx, id);
  }
}
