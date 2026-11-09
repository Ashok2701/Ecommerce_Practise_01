import { Injectable } from '@nestjs/common';
import { Erp } from './erp';
import { RequestsService } from './requests.service';
import { activity, customerScope, customerUserIds, items as parseItems, notify, nowIso, requireManager, text, uid } from './common';
import { badRequest, forbidden, notFound } from '../common/errors';
import { isCustomer, isManager, type Ctx } from '../common/ctx';
import type { ConsignmentAgreement } from '../db/portal-db';
import { stockStatus } from '@/lib/domain/pricing';
import {
  OPEN_TRANSFER,
  type Consignment, type ConsignmentLine, type ConsignmentMovement, type Order, type Product, type PurchaseOrder, type SalesRequest, type StockDetail, type StockPosition, type StockTransfer, type TransferStatus,
} from '@/types/domain';

const ALLOCATED: Order['status'][] = ['confirmed', 'processing', 'packed'];
const OPEN_REQ = ['submitted', 'changes_requested', 'approved', 'partly_converted'];
const openQty = (r: SalesRequest, productId: string) => r.lines.filter((l) => l.productId === productId).reduce((s, l) => s + l.quantity - l.convertedQty, 0);
function logTr(t: StockTransfer, status: TransferStatus, by: string, note?: string) { t.status = status; t.timeline.push({ status, at: nowIso(), by, note }); }

export interface StockMovement { at: string; kind: 'receipt' | 'transfer_in' | 'transfer_out' | 'sale' | 'consignment_in' | 'consignment_out'; quantity: number; ref: string; href: string; party: string }
export interface ConsignmentLineView extends ConsignmentLine { reserved: number; available: number; low: boolean }
export interface ConsignmentView extends Omit<Consignment, 'lines'> { lines: ConsignmentLineView[]; openCallOffs: { id: string; number: string; status: string; date: string }[] }

/**
 * Inventory: stock positions per site, customer consignment stock and
 * transfers between sites. Quantities come from Sage X3; the portal never
 * adjusts stock: every movement is an X3 document (web service).
 */
@Injectable()
export class InventoryService {
  constructor(private erp: Erp, private requests: RequestsService) {}

  /* ---------------- positions ---------------- */

  private async held(site: string) {
    const t = Date.now();
    return (await this.erp.db.repos.requests.find({ site, status: OPEN_REQ })).filter((r) => !r.consignmentId && r.holdUntil && new Date(r.holdUntil).getTime() > t);
  }

  /** Everything needed to explain the numbers at one site. */
  private async snapshot(site: string) {
    const [products, stock, orders, held, pos, transfers, agreements] = await Promise.all([
      this.erp.productsAt(site), this.erp.x3.stock(site), this.erp.orders({ site }), this.held(site), this.erp.purchaseOrders({ site }),
      this.erp.db.repos.transfers.find({ customer_id: site, status: 'initiated' }), this.erp.db.repos.consignments.find({ site }),
    ]);
    const locStock = agreements.length ? await this.erp.x3.locationStock({ site, locations: agreements.map((a) => a.location) }) : [];
    const sites = await this.erp.sites();
    return { site, products, stock: new Map(stock.map((s) => [s.productId, s])), orders: orders.filter((o) => ALLOCATED.includes(o.status)), held, pos, transfers, agreements, locStock, sites };
  }

  private async freeAt(sites: string[], productIds?: string[]) {
    const free = await this.erp.freeStock(sites, productIds);
    const out = new Map<string, number>();
    for (const s of sites) {
      const held = await this.held(s);
      for (const [key, v] of free) if (key.startsWith(`${s}|`)) {
        const pid = key.slice(s.length + 1);
        out.set(key, Math.max(0, v - held.reduce((a, r) => a + openQty(r, pid), 0)));
      }
    }
    return out;
  }

  private detail(s: Awaited<ReturnType<InventoryService['snapshot']>>, productId: string, others: Map<string, number>): StockDetail {
    const allocated = s.orders.flatMap((o) => o.lines.filter((l) => l.productId === productId).map((l) => ({ orderId: o.id, number: o.number, customerName: o.customerName, quantity: l.quantity, status: o.status })));
    const held = s.held.map((r) => ({ requestId: r.id, number: r.number, customerName: r.customerName, quantity: openQty(r, productId), until: r.holdUntil! })).filter((h) => h.quantity > 0);
    const incoming = [
      ...s.pos.filter((o) => ['in_transit', 'partly_received'].includes(o.status)).flatMap((o) => o.lines.filter((l) => l.productId === productId && l.quantity > l.receivedQty)
        .map((l) => ({ kind: 'po' as const, id: o.id, number: o.number, from: o.supplierName, quantity: l.quantity - l.receivedQty, status: o.status, expected: o.expectedDate }))),
      ...s.transfers.flatMap((x) => x.lines.filter((l) => l.productId === productId).map((l) => ({ kind: 'transfer' as const, id: x.id, number: x.number, from: x.fromSite, quantity: l.quantity, status: x.status, expected: x.neededBy }))),
    ];
    const consignment = s.agreements.flatMap((a) => s.locStock.filter((x) => x.location === a.location && x.productId === productId && x.quantity > 0)
      .map((x) => ({ id: a.id, number: a.number, customerName: a.customerName, location: a.location, quantity: x.quantity })));
    const otherSites = s.sites.filter((x) => x.code !== s.site).map((x) => ({ site: x.code, available: others.get(`${x.code}|${productId}`) ?? 0 }));
    return { allocated, held, incoming, consignment, otherSites };
  }

  private position(s: Awaited<ReturnType<InventoryService['snapshot']>>, p: Product, d: StockDetail): StockPosition {
    const st = s.stock.get(p.id);
    const free = Math.max(0, st?.free ?? 0);
    const allocated = d.allocated.reduce((a, x) => a + x.quantity, 0);
    const held = d.held.reduce((a, x) => a + x.quantity, 0);
    const available = Math.max(0, free - held);
    return {
      product: p, onHand: free + allocated, allocated, held, available, incoming: d.incoming.reduce((a, x) => a + x.quantity, 0),
      consignment: d.consignment.reduce((a, x) => a + x.quantity, 0), low: stockStatus({ ...p, stock: available }) !== 'in_stock',
    };
  }

  async positions(ctx: Ctx, q: { search?: string; category?: string; filter?: string }): Promise<StockPosition[]> {
    const s = await this.snapshot(ctx.site);
    const others = await this.freeAt(s.sites.map((x) => x.code).filter((c) => c !== ctx.site));
    const term = q.search?.trim().toLowerCase() ?? '';
    return s.products.map((p) => this.position(s, p, this.detail(s, p.id, others))).filter((x) =>
      (!term || [x.product.name, x.product.sku, x.product.brand].some((v) => v.toLowerCase().includes(term))) &&
      (!q.category || x.product.category === q.category) &&
      (!q.filter || q.filter === 'all' || (q.filter === 'low' ? x.low : q.filter === 'reserved' ? x.allocated + x.held > 0 : q.filter === 'incoming' ? x.incoming > 0 : x.consignment > 0)))
      .sort((a, b) => Number(b.low) - Number(a.low) || a.product.name.localeCompare(b.product.name));
  }

  async detailOf(ctx: Ctx, productId: string) {
    const s = await this.snapshot(ctx.site);
    const p = s.products.find((x) => x.id === productId);
    if (!p) throw notFound();
    const others = await this.freeAt(s.sites.map((x) => x.code).filter((c) => c !== ctx.site), [productId]);
    const detail = this.detail(s, productId, others);
    return { position: this.position(s, p, detail), detail };
  }

  /** Stock journal at the site (X3), with links to the portal's documents. */
  async movements(ctx: Ctx, productId: string): Promise<StockMovement[]> {
    const rows = await this.erp.x3.journal({ site: ctx.site, productId, limit: 40 });
    const [transfers, agreements] = await Promise.all([this.erp.db.repos.transfers.find(), this.erp.db.repos.consignments.find({ site: ctx.site })]);
    const byErp = new Map(transfers.filter((t) => t.erpRef).map((t) => [t.erpRef!, t]));
    return rows.filter((r) => r.kind !== 'other').map((r) => {
      const kind = r.kind as StockMovement['kind'];
      const t = byErp.get(r.ref);
      const a = agreements.find((x) => x.location === r.location);
      const href = kind === 'receipt' ? `/purchase-orders?grn=${encodeURIComponent(r.ref)}` : kind.startsWith('transfer') ? (t ? `/transfers/${t.id}` : '/transfers')
        : kind === 'consignment_in' ? (a ? `/consignment/${a.id}` : '/consignment') : `/orders/${encodeURIComponent(r.ref)}`;
      return { at: r.at ?? '', kind, quantity: r.quantity, ref: kind.startsWith('transfer') && t ? t.number : kind === 'consignment_in' && a ? a.number : r.ref, href, party: r.party };
    });
  }

  async availableAt(ctx: Ctx, productId: string, site: string): Promise<number> {
    if (!(ctx.user.allowedSites ?? []).includes(site) && !isManager(ctx)) throw forbidden();
    return (await this.freeAt([site], [productId])).get(`${site}|${productId}`) ?? 0;
  }

  async availability(ctx: Ctx, sites: string[]): Promise<Record<string, Record<string, number>>> {
    const all = (await this.erp.sites()).map((s) => s.code);
    const ss = sites.filter((s) => all.includes(s));
    const free = await this.freeAt(ss);
    const products = await this.erp.x3.products();
    return Object.fromEntries(products.map((p) => [p.id, Object.fromEntries(ss.map((s) => [s, free.get(`${s}|${p.id}`) ?? 0]))]));
  }

  /* ---------------- consignment ---------------- */

  private async view(a: ConsignmentAgreement): Promise<ConsignmentView> {
    const [stock, products, open, journal] = await Promise.all([
      this.erp.x3.locationStock({ site: a.site, locations: [a.location] }), this.erp.x3.products(),
      this.erp.db.repos.requests.find({ customer_id: a.customerId, status: OPEN_REQ }), this.erp.x3.journal({ site: a.site, location: a.location, limit: 50 }),
    ]);
    const prod = new Map(products.map((p) => [p.id, p]));
    const calls = open.filter((r) => r.consignmentId === a.id);
    const ids = [...new Set([...Object.keys(a.minQty), ...stock.map((s) => s.productId)])];
    const lines: ConsignmentLineView[] = ids.map((pid) => {
      const p = prod.get(pid);
      const quantity = stock.find((s) => s.productId === pid)?.quantity ?? 0;
      const reserved = calls.reduce((s, r) => s + openQty(r, pid), 0);
      const minQty = a.minQty[pid] ?? 0;
      return { productId: pid, sku: p?.sku ?? pid, name: p?.name ?? pid, uom: p?.uom ?? '', quantity, minQty, reserved, available: Math.max(0, quantity - reserved), low: quantity < minQty };
    });
    const movements: ConsignmentMovement[] = journal.filter((j) => j.kind === 'consignment_in' || j.kind === 'consignment_out').map((j, i) => ({
      id: `${a.id}_m${i}`, at: j.at ?? '', by: j.party, kind: j.kind === 'consignment_in' ? 'top_up' : 'call_off', productId: j.productId,
      quantity: j.kind === 'consignment_in' ? Math.abs(j.quantity) : -Math.abs(j.quantity), ref: j.kind === 'consignment_out' ? j.ref : undefined,
    }));
    return { id: a.id, number: a.number, customerId: a.customerId, customerName: a.customerName, site: a.site, location: a.location, lines, movements, openCallOffs: calls.map((r) => ({ id: r.id, number: r.number, status: r.status, date: r.date })) };
  }

  private async agreement(ctx: Ctx, id: string) {
    const a = await this.erp.db.repos.consignments.get(id);
    if (!a) throw notFound('errors.consignment.notFound');
    const scope = await customerScope(ctx, this.erp);
    if (scope && !scope.includes(a.customerId)) throw notFound('errors.consignment.notFound');
    return a;
  }

  async consignments(ctx: Ctx, q: { customerId?: string }): Promise<ConsignmentView[]> {
    const scope = await customerScope(ctx, this.erp);
    const rows = (await this.erp.db.repos.consignments.find()).filter((a) => (isCustomer(ctx) || !ctx.site || a.site === ctx.site) && (!scope || scope.includes(a.customerId)) && (!q.customerId || a.customerId === q.customerId));
    return Promise.all(rows.map((a) => this.view(a)));
  }

  async consignment(ctx: Ctx, id: string): Promise<ConsignmentView> { return this.view(await this.agreement(ctx, id)); }

  /** Customer (or their rep) calls stock off: a Sales Request against the consignment. */
  async callOff(ctx: Ctx, id: string, input: { items: { productId: string; quantity: number }[]; poNumber?: string; notes?: string }): Promise<SalesRequest> {
    const a = await this.agreement(ctx, id);
    return this.requests.submitFor({ ...ctx, site: a.site }, { customerId: a.customerId, items: parseItems(input?.items), poNumber: input.poNumber, notes: input.notes, consignmentId: a.id });
  }

  /** Warehouse moves free stock into the consignment location (X3 location transfer). */
  async topUp(ctx: Ctx, id: string, rawItems: unknown): Promise<ConsignmentView> {
    requireManager(ctx);
    const a = await this.agreement(ctx, id);
    const take = parseItems(rawItems).filter((i) => i.quantity > 0);
    if (!take.length) throw badRequest('errors.consignment.empty');
    const free = await this.freeAt([a.site], take.map((i) => i.productId));
    for (const i of take) if ((free.get(`${a.site}|${i.productId}`) ?? 0) < i.quantity) throw badRequest('errors.consignment.noFreeStock');
    await this.erp.gateway.moveToLocation({ ref: `${a.number}/${uid('t')}`, site: a.site, location: a.location, customerId: a.customerId, lines: take });
    await this.erp.db.tx(async (r) => {
      await notify(r, { userIds: await customerUserIds(r, a.customerId) }, 'stock_update', `Consignment ${a.number} topped up`, `${take.length} item(s) added at ${a.location}`, `/consignment/${a.id}`);
      await r.audit({ userId: ctx.user.id, userName: ctx.user.name, site: ctx.site, action: 'consignment.topUp', entity: 'consignment', entityId: id, detail: take });
    });
    return this.view(a);
  }

  /* ---------------- transfers ---------------- */

  private async transfer(ctx: Ctx, id: string) {
    const t = await this.erp.db.repos.transfers.get(id);
    if (!t) throw notFound('errors.transfers.notFound');
    const sites = ctx.user.allowedSites ?? [];
    if (!isManager(ctx) && !sites.includes(t.fromSite) && !sites.includes(t.toSite) && t.createdBy.id !== ctx.user.id) throw notFound('errors.transfers.notFound');
    return t;
  }

  async transfers(ctx: Ctx, q: { view?: string; direction?: string }): Promise<StockTransfer[]> {
    const site = ctx.site;
    return (await this.erp.db.repos.transfers.find()).filter((t) =>
      (!site || (q.direction === 'in' ? t.toSite === site : q.direction === 'out' ? t.fromSite === site : t.toSite === site || t.fromSite === site)) &&
      (!q.view || q.view === 'all' || (q.view === 'open' ? OPEN_TRANSFER.includes(t.status) : !OPEN_TRANSFER.includes(t.status))));
  }

  getTransfer(ctx: Ctx, id: string) { return this.transfer(ctx, id); }

  private notifyManagers(r: Parameters<typeof notify>[0], title: string, body: string, href: string) { return notify(r, { roles: ['SUPERVISOR'] }, 'stock_update', title, body, href); }

  async createTransfer(ctx: Ctx, input: { fromSite: string; toSite: string; items: { productId: string; quantity: number }[]; reason: string; neededBy?: string }): Promise<StockTransfer> {
    if (!isManager(ctx) && ctx.user.role !== 'SALES_REP') throw forbidden();
    const sites = (await this.erp.sites()).map((s) => s.code);
    const fromSite = text(input?.fromSite, 20), toSite = text(input?.toSite, 20);
    if (!sites.includes(fromSite) || !sites.includes(toSite)) throw badRequest('errors.transfers.sameSite');
    if (fromSite === toSite) throw badRequest('errors.transfers.sameSite');
    const reason = text(input.reason).trim();
    if (!reason) throw badRequest('errors.transfers.reasonRequired');
    const products = new Map((await this.erp.x3.products()).map((p) => [p.id, p]));
    const lines = parseItems(input.items).filter((i) => i.quantity > 0 && products.has(i.productId)).map((i) => {
      const p = products.get(i.productId)!;
      return { productId: p.id, sku: p.sku, name: p.name, uom: p.uom, quantity: i.quantity, receivedQty: 0 };
    });
    if (!lines.length) throw badRequest('errors.transfers.empty');
    return this.erp.db.tx(async (r) => {
      const n = await r.next('transfer', 2210);
      const at = nowIso();
      const t: StockTransfer = {
        id: uid('tr'), number: `TR-26-${String(n).padStart(5, '0')}`, fromSite, toSite, status: 'pending', lines, reason, neededBy: input.neededBy || undefined, createdBy: ctx.actor, date: at, comments: [],
        timeline: [{ status: 'pending', at, by: ctx.user.name }],
      };
      await r.transfers.insert(t);
      await this.notifyManagers(r, `Transfer request ${t.number}`, `${fromSite} → ${toSite}: ${lines.length} item(s)`, `/transfers/${t.id}`);
      await activity(r, { actor: ctx.user.name, text: `requested transfer ${t.number} (${fromSite} → ${toSite})`, kind: 'order', site: ctx.site });
      return t;
    });
  }

  async approveTransfer(ctx: Ctx, id: string) {
    requireManager(ctx);
    const t = await this.transfer(ctx, id);
    if (t.status !== 'pending') throw badRequest('errors.transfers.notOpen');
    logTr(t, 'approved', ctx.user.name);
    await this.erp.db.tx(async (r) => { await r.transfers.save(t); await notify(r, { userIds: [t.createdBy.id] }, 'stock_update', `Transfer ${t.number} approved`, `${t.fromSite} will ship to ${t.toSite}.`, `/transfers/${t.id}`); });
    return t;
  }

  async rejectTransfer(ctx: Ctx, id: string, comment: string) {
    requireManager(ctx);
    const t = await this.transfer(ctx, id);
    if (!['pending', 'approved'].includes(t.status)) throw badRequest('errors.transfers.notOpen');
    const c = text(comment).trim();
    if (!c) throw badRequest('errors.requests.commentRequired');
    logTr(t, 'rejected', ctx.user.name, c);
    await this.erp.db.tx(async (r) => { await r.transfers.save(t); await notify(r, { userIds: [t.createdBy.id] }, 'stock_update', `Transfer ${t.number} rejected`, c.slice(0, 90), `/transfers/${t.id}`); });
    return t;
  }

  /** Source site ships: X3 inter-site transfer, stock leaves the source. */
  async initiateTransfer(ctx: Ctx, id: string) {
    requireManager(ctx);
    const t = await this.transfer(ctx, id);
    if (t.status !== 'approved') throw badRequest('errors.transfers.notOpen');
    const free = await this.freeAt([t.fromSite], t.lines.map((l) => l.productId));
    for (const l of t.lines) if ((free.get(`${t.fromSite}|${l.productId}`) ?? 0) < l.quantity) throw badRequest('errors.transfers.noStock');
    const { id: erpRef } = await this.erp.gateway.shipTransfer({ ref: t.number, fromSite: t.fromSite, toSite: t.toSite, lines: t.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })) });
    t.erpRef = erpRef;
    logTr(t, 'initiated', ctx.user.name, erpRef);
    await this.erp.db.tx(async (r) => { await r.transfers.save(t); await this.notifyManagers(r, `Transfer ${t.number} on the way`, `${t.fromSite} → ${t.toSite}`, `/transfers/${t.id}`); });
    return t;
  }

  /** Destination receives. Short receipts are recorded; the difference stays with the source for investigation. */
  async receiveTransfer(ctx: Ctx, id: string, raw: unknown) {
    requireManager(ctx);
    const t = await this.transfer(ctx, id);
    if (t.status !== 'initiated') throw badRequest('errors.transfers.notOpen');
    const got = parseItems(raw);
    t.lines.forEach((l) => { l.receivedQty = Math.max(0, Math.min(l.quantity, got.find((x) => x.productId === l.productId)?.quantity ?? l.quantity)); });
    await this.erp.gateway.receiveTransfer({ ref: `${t.number}/rcp`, erpRef: t.erpRef!, fromSite: t.fromSite, toSite: t.toSite, lines: t.lines.map((l) => ({ productId: l.productId, quantity: l.receivedQty })) });
    const short = t.lines.filter((l) => l.receivedQty < l.quantity).length;
    logTr(t, 'transferred', ctx.user.name, short ? `${short} line(s) short` : undefined);
    await this.erp.db.tx(async (r) => { await r.transfers.save(t); await notify(r, { userIds: [t.createdBy.id] }, 'stock_update', `Transfer ${t.number} received at ${t.toSite}`, short ? `${short} line(s) arrived short` : 'All quantities received', `/transfers/${t.id}`); });
    return t;
  }

  async completeTransfer(ctx: Ctx, id: string) {
    requireManager(ctx);
    const t = await this.transfer(ctx, id);
    if (t.status !== 'transferred') throw badRequest('errors.transfers.notOpen');
    logTr(t, 'completed', ctx.user.name);
    await this.erp.db.tx((r) => r.transfers.save(t));
    return t;
  }

  async cancelTransfer(ctx: Ctx, id: string) {
    const t = await this.transfer(ctx, id);
    if (!['pending', 'approved'].includes(t.status)) throw badRequest('errors.transfers.notOpen');
    if (t.createdBy.id !== ctx.user.id && !isManager(ctx)) throw forbidden();
    logTr(t, 'cancelled', ctx.user.name);
    await this.erp.db.tx((r) => r.transfers.save(t));
    return t;
  }

  async commentTransfer(ctx: Ctx, id: string, body: string) {
    const t = await this.transfer(ctx, id);
    const c = text(body).trim();
    if (c) { t.comments.push({ by: ctx.user.name, at: nowIso(), text: c }); await this.erp.db.tx((r) => r.transfers.save(t)); }
    return t;
  }
}

export type { PurchaseOrder };
