import { Inject, Injectable } from '@nestjs/common';
import { PortalDb, nowIso, type CachedOffer, type DeliveryExt, type OrderExt, type PoExt, type Repos } from '../db/portal-db';
import { X3Reader, type CustomerRow, type DeliveryRow, type InvoiceRow, type OrderLineRow, type OrderRow, type PoRow, type ProductRow } from '../x3/x3-reader';
import { X3_GATEWAY, type X3Gateway } from '../x3/gateway';
import { allUsers } from '../common/users';
import { notFound } from '../common/errors';
import { offerStatus } from '@/lib/domain/pricing';
import type {
  Customer, Delivery, Invoice, Offer, Order, OrderLine, OrderStatus, Payment, Product, PurchaseOrder, Site, Supplier, User,
} from '@/types/domain';

const r2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 86400000;

export function invoiceStatus(i: Pick<Invoice, 'amount' | 'paid' | 'dueDate'>): Invoice['status'] {
  if (i.paid >= i.amount - 0.005) return 'paid';
  if (i.dueDate && new Date(i.dueDate).getTime() < Date.now()) return 'overdue';
  return i.paid > 0 ? 'partially_paid' : 'unpaid';
}

/**
 * ERP data in the API's shapes: Sage X3 records (through the NX_* views)
 * merged with the portal's own additions (comments, proof of delivery,
 * supplier pickup, offer presentation, product pictures).
 */
@Injectable()
export class Erp {
  constructor(public db: PortalDb, public x3: X3Reader, @Inject(X3_GATEWAY) public gateway: X3Gateway) {}

  /* ---------------- people ---------------- */

  async users(): Promise<User[]> { return allUsers(this.db.k); }

  /** X3 sales rep code <-> portal user id. */
  async repMaps() {
    const reps = (await this.users()).filter((u) => u.role === 'SALES_REP' && u.erpCode);
    return { byCode: new Map(reps.map((u) => [u.erpCode!, u.id])), byUser: new Map(reps.map((u) => [u.id, u.erpCode!])) };
  }

  /* ---------------- sites and products ---------------- */

  sites(): Promise<Site[]> { return this.x3.sites(); }

  private async productContent() {
    const rows = await this.db.repos.productContent.find();
    return new Map(rows.map((r) => [r.id, r]));
  }

  /** Products as seen from a site: that site's stock (free to promise before holds) and price list. */
  async productsAt(site: string, ids?: string[]): Promise<Product[]> {
    const [rows, stock, prices, content] = await Promise.all([this.x3.products(), this.x3.stock(site), this.x3.sitePrices(), this.productContent()]);
    const st = new Map(stock.map((s) => [s.productId, s]));
    return rows.filter((p) => !ids || ids.includes(p.id)).map((p) => this.toProduct(p, site, st.get(p.id), prices.get(`${site}|${p.id}`), content.get(p.id)));
  }

  private toProduct(p: ProductRow, _site: string, s: { free: number; leadTimeDays: number } | undefined, sitePrice: number | undefined, c?: { image?: string; description?: string; specs?: Record<string, string> }): Product {
    return {
      id: p.id, sku: p.sku, name: p.name, brand: p.brand, category: p.category, description: c?.description ?? '', image: c?.image ?? '',
      basePrice: sitePrice ?? p.basePrice, uom: p.uom, packSize: p.packSize, moq: p.moq, stock: Math.max(0, s?.free ?? 0), leadTimeDays: s?.leadTimeDays ?? 0,
      taxRatePct: p.taxRatePct, specs: c?.specs ?? {},
    };
  }

  async product(id: string, site: string): Promise<Product> {
    const [p] = await this.productsAt(site, [id]);
    if (!p) throw notFound();
    return p;
  }

  /** Free stock per site (before holds) for some products. */
  async freeStock(sites: string[], productIds?: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    for (const site of sites) for (const s of await this.x3.stock(site, productIds)) out.set(`${site}|${s.productId}`, Math.max(0, s.free));
    return out;
  }

  /* ---------------- customers ---------------- */

  async customers(ids?: string[]): Promise<Customer[]> {
    const [rows, contract, maps] = await Promise.all([this.x3.customers(ids), this.x3.contractPrices(ids), this.repMaps()]);
    const now = Date.now();
    const cp = new Map<string, Record<string, number>>();
    for (const c of contract) {
      if (c.validFrom && new Date(c.validFrom).getTime() > now) continue;
      if (c.validTo && new Date(c.validTo).getTime() < now) continue;
      (cp.get(c.customerId) ?? cp.set(c.customerId, {}).get(c.customerId)!)[c.productId] = c.price;
    }
    const last = await this.lastOrders(rows.map((r) => r.id));
    return rows.map((r) => this.toCustomer(r, cp.get(r.id) ?? {}, maps.byCode.get(r.repCode) ?? '', last.get(r.id)));
  }

  private toCustomer(r: CustomerRow, contractPrices: Record<string, number>, salesRepId: string, last?: { date: string; total: number }): Customer {
    return {
      id: r.id, code: r.code, type: r.type, name: r.name, contactName: r.contactName, email: r.email, phone: r.phone, gstin: r.gstin, address: r.address, billingAddress: r.billingAddress,
      status: r.status, salesRepId, priceTier: r.tier, tierDiscountPct: r.type === 'B2C' ? 0 : r.tierDiscountPct, contractPrices, creditLimit: r.type === 'B2C' ? 0 : r.creditLimit,
      outstanding: r.type === 'B2C' ? 0 : r.outstanding, paymentTerms: r.paymentTerms, lastOrderDate: last?.date, lastOrderAmount: last?.total, since: r.since ?? '',
    };
  }

  /** Last order (or request) per customer, for the customer lists. */
  private async lastOrders(customerIds: string[]) {
    const out = new Map<string, { date: string; total: number }>();
    if (!customerIds.length) return out;
    const orders = await this.x3.orders({ customerIds });
    for (const o of orders) if (o.status !== 'cancelled' && o.date && (!out.has(o.customerId) || out.get(o.customerId)!.date < o.date)) out.set(o.customerId, { date: o.date, total: o.total });
    const reqs = await this.db.repos.requests.find({ customer_id: customerIds });
    for (const r of reqs) if (!out.has(r.customerId) || out.get(r.customerId)!.date < r.date) out.set(r.customerId, { date: r.date, total: out.get(r.customerId)?.total ?? r.total });
    return out;
  }

  async customer(id: string): Promise<Customer> {
    const [c] = await this.customers([id]);
    if (!c) throw notFound();
    return c;
  }

  /* ---------------- sales orders ---------------- */

  async orders(f: { ids?: string[]; site?: string; customerIds?: string[]; salesRepId?: string } = {}): Promise<Order[]> {
    const maps = await this.repMaps();
    const repCode = f.salesRepId ? maps.byUser.get(f.salesRepId) ?? '__none__' : undefined;
    const rows = await this.x3.orders({ ids: f.ids, site: f.site, customerIds: f.customerIds, repCode });
    return this.buildOrders(rows, maps.byCode);
  }

  async buildOrders(rows: OrderRow[], repByCode?: Map<string, string>): Promise<Order[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const byCode = repByCode ?? (await this.repMaps()).byCode;
    const [lines, exts, dels, invs, custs, products, content] = await Promise.all([
      this.x3.orderLines(ids), this.extFor(ids), this.x3.deliveries({ orderIds: ids }), this.x3.invoices({ orderIds: ids }),
      this.x3.customers([...new Set(rows.map((r) => r.customerId))]), this.x3.products(), this.productContent(),
    ]);
    const prod = new Map(products.map((p) => [p.id, p]));
    const cust = new Map(custs.map((c) => [c.id, c]));
    const byOrder = new Map<string, OrderLineRow[]>();
    lines.forEach((l) => (byOrder.get(l.orderId) ?? byOrder.set(l.orderId, []).get(l.orderId)!).push(l));
    const del = new Map(dels.map((d) => [d.orderId, d.id]));
    const inv = new Map(invs.map((i) => [i.orderId, i.id]));
    const out: Order[] = [];
    for (const r of rows) {
      const ext = exts.get(r.id);
      const c = cust.get(r.customerId);
      const ol: OrderLine[] = (byOrder.get(r.id) ?? []).map((l) => {
        const x = ext?.lines?.find((e) => e.lineNo === l.lineNo);
        const p = prod.get(l.productId);
        return {
          productId: l.productId, sku: p?.sku ?? l.productId, name: l.name || p?.name || l.productId, uom: p?.uom ?? '', image: x?.image ?? content.get(l.productId)?.image ?? '',
          quantity: l.quantity, listPrice: x?.listPrice ?? (l.free ? p?.basePrice ?? 0 : l.grossPrice), unitPrice: l.grossPrice, discountPct: l.discountPct,
          lineTotal: r2(l.netPrice * l.quantity), ...(x?.offerId ? { offerId: x.offerId, offerCode: x.offerCode } : {}), ...(l.free ? { free: true, freeFor: x?.freeFor } : {}),
        };
      });
      const gross = r2(ol.filter((l) => !l.free).reduce((s, l) => s + l.unitPrice * l.quantity, 0));
      const net = r.net || r2(ol.reduce((s, l) => s + l.lineTotal, 0));
      const status = (ext?.deliveredAt ? 'delivered' : r.status) as OrderStatus;
      const timeline = [...(ext?.timeline ?? [{ status: 'confirmed' as OrderStatus, at: r.date ?? nowIso(), by: 'Sage X3' }])];
      if (!timeline.some((e) => e.status === status)) timeline.push({ status, at: nowIso(), by: 'Sage X3' });
      if (ext && ext.erpStatus !== r.status) this.recordErpStatus(r.id, r.status, status).catch(() => undefined);
      out.push({
        id: r.id, number: r.id, erpRef: r.id, requestId: ext?.requestId, requestNumber: ext?.requestNumber, site: r.site, customerId: r.customerId, customerName: c?.name ?? r.customerId,
        salesRepId: byCode.get(r.repCode) ?? '', createdBy: ext?.createdBy ?? { id: 'erp', name: 'Sage X3', role: 'ADMIN' }, source: ext?.source ?? 'portal',
        date: r.date ?? '', expectedDelivery: r.expectedDelivery ?? r.date ?? '', status, lines: ol, subtotal: gross, discount: r2(Math.max(0, gross - net)), tax: r2(r.total - net), total: r.total,
        poNumber: r.poNumber || undefined, notes: ext?.notes, deliveryAddress: c?.address ?? emptyAddress, billingAddress: c?.billingAddress ?? emptyAddress, timeline, comments: ext?.comments ?? [],
        invoiceId: inv.get(r.id), deliveryId: del.get(r.id), creditOverride: ext?.creditOverride,
      });
    }
    return out;
  }

  private async extFor(orderIds: string[]) {
    const out = new Map<string, OrderExt>();
    for (let i = 0; i < orderIds.length; i += 500) {
      const chunk = orderIds.slice(i, i + 500);
      const rows = await this.db.k('order_ext').whereIn('id', chunk).select('doc');
      rows.forEach((r: { doc: string }) => { const d = JSON.parse(r.doc) as OrderExt; out.set(d.id, d); });
    }
    return out;
  }

  /** The ERP moved an order on (allocated, delivered, ...): add it to the order's timeline once. */
  private async recordErpStatus(id: string, erpStatus: string, status: OrderStatus) {
    await this.db.tx(async (r) => {
      const ext = await r.orderExt.get(id);
      if (!ext || ext.erpStatus === erpStatus) return;
      ext.erpStatus = erpStatus;
      if (!ext.timeline.some((e) => e.status === status)) ext.timeline.push({ status, at: nowIso(), by: 'Sage X3' });
      await r.orderExt.save(ext);
    });
  }

  async order(id: string): Promise<Order> {
    const [o] = await this.orders({ ids: [id] });
    if (!o) throw notFound();
    return o;
  }

  /* ---------------- invoices and payments ---------------- */

  toInvoice(i: InvoiceRow): Invoice {
    const inv = { id: i.id, number: i.id, orderId: i.orderId, orderNumber: i.orderId, customerId: i.customerId, date: i.date ?? '', dueDate: i.dueDate ?? i.date ?? '', amount: r2(i.amount), paid: r2(i.paid) } as Invoice;
    inv.status = invoiceStatus(inv);
    return inv;
  }

  async invoices(f: { ids?: string[]; customerIds?: string[]; orderIds?: string[] } = {}): Promise<Invoice[]> {
    return (await this.x3.invoices(f)).map((i) => this.toInvoice(i));
  }

  /** Portal payments (advice, collections, online) plus receipts entered directly in the ERP. */
  async payments(customerIds?: string[]): Promise<Payment[]> {
    const portal = await this.db.repos.payments.find(customerIds ? { customer_id: customerIds } : {});
    const known = new Set(portal.map((p) => (p as Payment & { erpRef?: string }).erpRef).filter(Boolean));
    const receipts = (await this.x3.receipts({ customerIds })).filter((r) => !known.has(r.id) && !portal.some((p) => p.id === r.portalRef));
    const lines = await this.x3.receiptLines(receipts.map((r) => r.id));
    const custs = new Map((await this.x3.customers(customerIds)).map((c) => [c.id, c.name]));
    const erp: Payment[] = receipts.map((r) => {
      const allocations = lines.filter((l) => l.receiptId === r.id).map((l) => ({ invoiceId: l.invoiceId, invoiceNumber: l.invoiceId, amount: r2(l.amount) }));
      return {
        id: r.id, number: r.id, customerId: r.customerId, customerName: custs.get(r.customerId), date: r.date ?? '', amount: r2(r.amount), method: (r.method || 'NEFT') as Payment['method'],
        reference: r.reference, invoiceNumbers: allocations.map((a) => a.invoiceNumber), status: 'posted', source: 'erp', allocations,
      };
    });
    return [...portal, ...erp].sort((a, b) => b.date.localeCompare(a.date));
  }

  /* ---------------- deliveries ---------------- */

  async deliveries(f: { ids?: string[]; orderIds?: string[]; site?: string; customerIds?: string[] } = {}): Promise<Delivery[]> {
    const rows = await this.x3.deliveries(f);
    return this.buildDeliveries(rows);
  }

  private async buildDeliveries(rows: DeliveryRow[]): Promise<Delivery[]> {
    if (!rows.length) return [];
    const ids = rows.map((d) => d.id);
    const [lines, custs, products, exts] = await Promise.all([
      this.x3.deliveryLines(ids), this.x3.customers([...new Set(rows.map((r) => r.customerId))]), this.x3.products(),
      this.db.k('delivery_ext').whereIn('id', ids).select('doc'),
    ]);
    const ext = new Map<string, DeliveryExt>(exts.map((r: { doc: string }) => { const d = JSON.parse(r.doc) as DeliveryExt; return [d.id, d]; }));
    const prod = new Map(products.map((p) => [p.id, p]));
    const cust = new Map(custs.map((c) => [c.id, c]));
    return rows.map((d) => {
      const x = ext.get(d.id);
      const c = cust.get(d.customerId);
      return {
        id: d.id, number: d.id, orderId: d.orderId, orderNumber: d.orderId, customerId: d.customerId, customerName: c?.name ?? d.customerId, site: d.site,
        address: c?.address ?? emptyAddress, status: x?.status ?? 'scheduled', plannedDate: x?.plannedDate ?? d.plannedDate ?? d.shipDate ?? '', carrier: d.carrier,
        vehicle: x?.vehicle, driver: x?.driver, trackingRef: d.trackingRef || undefined,
        lines: lines.filter((l) => l.deliveryId === d.id).map((l) => {
          const p = prod.get(l.productId);
          const xl = x?.lines?.find((e) => e.productId === l.productId);
          return { productId: l.productId, sku: p?.sku ?? l.productId, name: p?.name ?? l.productId, uom: p?.uom ?? '', quantity: l.quantity, receivedQty: xl?.receivedQty, damagedQty: xl?.damagedQty };
        }),
        pod: x?.pod, failReason: x?.failReason,
        timeline: x?.timeline ?? [{ status: 'scheduled', at: d.shipDate ?? d.plannedDate ?? '', by: 'Sage X3', note: 'Delivery note created at dispatch' }],
      } as Delivery;
    });
  }

  /** Portal record for a delivery (created the first time the portal changes it). */
  async deliveryExt(r: Repos, d: Delivery): Promise<DeliveryExt> {
    return (await r.deliveryExt.get(d.id)) ?? {
      id: d.id, orderId: d.orderId, customerId: d.customerId, site: d.site, status: d.status, plannedDate: d.plannedDate, timeline: d.timeline, at: nowIso(),
    };
  }

  /* ---------------- suppliers and purchase orders ---------------- */

  async suppliers(): Promise<Supplier[]> {
    const [rows, items] = await Promise.all([this.x3.suppliers(), this.x3.supplierItems()]);
    return rows.map((s) => ({
      id: s.id, code: s.code, name: s.name, contactName: s.contactName, email: s.email, phone: s.phone, address: s.address, paymentTerms: s.paymentTerms,
      productIds: items.filter((i) => i.supplierId === s.id).map((i) => i.productId),
    }));
  }

  async supplier(id: string): Promise<Supplier> {
    const s = (await this.suppliers()).find((x) => x.id === id);
    if (!s) throw notFound('errors.purchasing.notFound');
    return s;
  }

  async purchaseOrders(f: { ids?: string[]; site?: string; supplierId?: string } = {}): Promise<PurchaseOrder[]> {
    const rows = await this.x3.purchaseOrders(f);
    return this.buildPurchaseOrders(rows);
  }

  private async buildPurchaseOrders(rows: PoRow[]): Promise<PurchaseOrder[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [lines, grns, sups, products, exts] = await Promise.all([
      this.x3.purchaseOrderLines(ids), this.x3.goodsReceipts(ids), this.x3.suppliers(), this.x3.products(), this.db.k('po_ext').whereIn('id', ids).select('doc'),
    ]);
    const ext = new Map<string, PoExt>(exts.map((r: { doc: string }) => { const d = JSON.parse(r.doc) as PoExt; return [d.id, d]; }));
    const prod = new Map(products.map((p) => [p.id, p]));
    const sup = new Map(sups.map((s) => [s.id, s]));
    return rows.map((o) => {
      const x = ext.get(o.id);
      const ls = lines.filter((l) => l.orderId === o.id).map((l) => {
        const p = prod.get(l.productId);
        return { productId: l.productId, sku: p?.sku ?? l.productId, name: p?.name ?? l.productId, uom: p?.uom ?? '', quantity: l.quantity, unitCost: l.unitCost, lineTotal: r2(l.unitCost * l.quantity), receivedQty: l.receivedQty };
      });
      const receipts = [...new Set(grns.filter((g) => g.orderId === o.id).map((g) => g.id))].map((gid) => {
        const g = grns.filter((x2) => x2.id === gid);
        return { id: gid, number: gid, at: g[0].date ?? '', by: x?.receiptsBy?.[gid] ?? g[0].createdBy, lines: g.map((l) => ({ productId: l.productId, quantity: l.quantity })) };
      });
      const allIn = ls.length > 0 && ls.every((l) => l.receivedQty >= l.quantity);
      const someIn = ls.some((l) => l.receivedQty > 0);
      const status: PurchaseOrder['status'] = x?.status === 'cancelled' || (o.closed && !someIn) ? 'cancelled' : allIn ? 'received' : someIn ? 'partly_received' : x?.status ?? 'issued';
      return {
        id: o.id, number: o.id, erpRef: o.id, site: o.site, supplierId: o.supplierId, supplierName: sup.get(o.supplierId)?.name ?? o.supplierId, requestId: x?.requestId, requestNumber: x?.requestNumber,
        date: o.date ?? '', expectedDate: o.expectedDate ?? '', status, lines: ls, total: r2(ls.reduce((s, l) => s + l.lineTotal, 0)), pickup: x?.pickup, receipts,
        timeline: x?.timeline ?? [{ status: 'issued', at: o.date ?? '', by: 'Sage X3' }],
      };
    });
  }

  async purchaseOrder(id: string): Promise<PurchaseOrder> {
    const [o] = await this.purchaseOrders({ ids: [id] });
    if (!o) throw notFound('errors.purchasing.notFound');
    return o;
  }

  async poExt(r: Repos, o: PurchaseOrder): Promise<PoExt> {
    return (await r.poExt.get(o.id)) ?? { id: o.id, site: o.site, supplierId: o.supplierId, status: 'issued', timeline: o.timeline, at: nowIso() };
  }

  /* ---------------- offers ---------------- */

  /** Offers as the portal shows them: ERP terms (last sync) + portal presentation; status from the dates. */
  async offers(): Promise<Offer[]> {
    const [cached, pres] = await Promise.all([this.db.repos.offers.find(), this.db.repos.presentations.find()]);
    const p = new Map(pres.map((x) => [x.id, x.presentation]));
    return cached.map(({ syncedAt, ...o }) => { void syncedAt; return { ...o, presentation: p.get(o.id) ?? {}, status: offerStatus(o) } as Offer; });
  }

  /** Read offers from the ERP now (price lists flagged for the portal) and replace the cached copy. */
  async syncOffers(): Promise<string> {
    const lines = await this.x3.offerLines();
    const at = nowIso();
    const groups = new Map<string, typeof lines>();
    lines.forEach((l) => (groups.get(l.code) ?? groups.set(l.code, []).get(l.code)!).push(l));
    const offers: CachedOffer[] = [...groups.entries()].map(([code, ls]) => {
      const uniq = <T,>(a: T[]) => [...new Set(a.filter(Boolean))];
      const free = ls.find((l) => l.freeQty > 0);
      const tiers = uniq(ls.filter((l) => l.minQty > 0 && l.discountPct > 0).map((l) => `${l.minQty}|${l.discountPct}`)).map((s) => { const [a, b] = s.split('|').map(Number); return { minQty: a, discountPct: b }; }).sort((a, b) => a.minQty - b.minQty);
      const kind: Offer['kind'] = free ? 'free_goods' : tiers.length ? 'tier' : 'percent';
      const customerIds = uniq(ls.map((l) => l.customerId));
      const tier = uniq(ls.map((l) => l.tier))[0];
      const from = ls.map((l) => l.validFrom).filter(Boolean).sort()[0];
      const to = ls.map((l) => l.validTo).filter(Boolean).sort().reverse()[0];
      return {
        id: code, code, erpRef: ls[0].erpRef || undefined, kind, title: ls[0].title, description: ls[0].description,
        productIds: uniq(ls.map((l) => l.productId)), categories: uniq(ls.map((l) => l.category)).length ? uniq(ls.map((l) => l.category)) : undefined,
        discountPct: kind === 'percent' ? Math.max(...ls.map((l) => l.discountPct)) : undefined, tiers: kind === 'tier' ? tiers : undefined,
        buyQty: free ? free.minQty : undefined, freeQty: free ? free.freeQty : undefined, freeProductId: free?.freeProductId || undefined,
        validFrom: from ?? at, validTo: to ?? new Date(Date.now() + 3650 * DAY).toISOString(),
        audience: customerIds.length ? 'customers' : tier ? (`tier_${tier}` as Offer['audience']) : 'all', customerIds: customerIds.length ? customerIds : undefined,
        sites: uniq(ls.map((l) => l.site)).length ? uniq(ls.map((l) => l.site)) : undefined, syncedAt: at,
      };
    });
    await this.db.tx(async (r) => {
      await r.k('offers').delete();
      for (const o of offers) await r.offers.insert(o);
      await r.putSetting('offersSyncedAt', at);
    });
    return at;
  }

  async offersSyncedAt(): Promise<string> {
    return (await this.db.repos.setting<string>('offersSyncedAt')) ?? '';
  }
}

const emptyAddress = { line1: '', city: '', state: '', postalCode: '', country: '' };
