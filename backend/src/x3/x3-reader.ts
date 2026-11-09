import * as fs from 'fs';
import * as path from 'path';
import type { Knex } from 'knex';
import type { Address, Site } from '@/types/domain';

/** Dates come back as Date (SQL Server) or text (simulation); the API always returns ISO-8601 UTC. */
export function toIso(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  // X3 "empty" date
  if (s.startsWith('1753-01-01') || s.startsWith('1900-01-01')) return undefined;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s);
  return isNaN(d.getTime()) ? s : d.toISOString();
}
const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

export interface ProductRow { id: string; sku: string; name: string; brand: string; category: string; packSize: string; uom: string; moq: number; basePrice: number; taxRatePct: number }
export interface StockRow { productId: string; site: string; physical: number; allocated: number; free: number; leadTimeDays: number }
export interface CustomerRow {
  id: string; code: string; name: string; type: 'B2B' | 'B2C'; status: 'active' | 'on_hold' | 'inactive'; repCode: string; tier: 'A' | 'B' | 'C';
  creditLimit: number; paymentTerms: string; contactName: string; gstin: string; since?: string; address: Address; billingAddress: Address;
  phone: string; email: string; outstanding: number; tierDiscountPct: number;
}
export interface OfferLineRow {
  code: string; title: string; description: string; erpRef: string; record: string; productId: string; customerId: string; site: string; tier: string; category: string;
  validFrom?: string; validTo?: string; minQty: number; discountPct: number; freeProductId: string; freeQty: number;
}
export interface OrderRow { id: string; customerId: string; site: string; date?: string; expectedDelivery?: string; poNumber: string; repCode: string; net: number; total: number; portalRef: string; status: string }
export interface OrderLineRow { orderId: string; lineNo: number; productId: string; name: string; quantity: number; deliveredQty: number; grossPrice: number; netPrice: number; discountPct: number; free: boolean; location: string }
export interface DeliveryRow { id: string; orderId: string; customerId: string; site: string; plannedDate?: string; shipDate?: string; validated: boolean; carrier: string; trackingRef: string }
export interface DeliveryLineRow { deliveryId: string; lineNo: number; productId: string; quantity: number }
export interface InvoiceRow { id: string; customerId: string; site: string; date?: string; amount: number; orderId: string; dueDate?: string; paid: number }
export interface ReceiptRow { id: string; customerId: string; date?: string; amount: number; method: string; reference: string; portalRef: string }
export interface ReceiptLineRow { receiptId: string; lineNo: number; invoiceId: string; amount: number }
export interface SupplierRow { id: string; code: string; name: string; contactName: string; paymentTerms: string; address: Address; phone: string; email: string }
export interface PoRow { id: string; supplierId: string; site: string; date?: string; expectedDate?: string; closed: boolean; portalRef: string }
export interface PoLineRow { orderId: string; lineNo: number; productId: string; quantity: number; receivedQty: number; unitCost: number }
export interface GrnRow { id: string; orderId: string; site: string; date?: string; createdBy: string; lineNo: number; productId: string; quantity: number }
export interface JournalRow { site: string; productId: string; at?: string; quantity: number; ref: string; party: string; location: string; kind: string }

const addr = (r: Record<string, unknown>, p = ''): Address => ({
  line1: str(r[`${p}line1`]), city: str(r[`${p}city`]), state: str(r[`${p}state`]), postalCode: str(r[`${p}postal_code`]), country: str(r[`${p}country`]),
});

/**
 * Reads Sage X3 through the NX_* views (x3/views.sql). Read-only: nothing in
 * the portal writes to the X3 database; changes go through the X3 gateway.
 */
export class X3Reader {
  private cache = new Map<string, { at: number; value: unknown }>();
  constructor(private k: Knex, private viewSchema: string, private cacheMs = 60_000) {}

  private v(name: string) { return this.viewSchema ? `${this.viewSchema}.${name}` : name; }
  private q(name: string) { return this.k(this.v(name)); }

  /** Master data changes rarely; keep it briefly. Documents (orders, stock, invoices) are always read live. */
  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.cacheMs) return hit.value as T;
    const value = await load();
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }
  invalidate() { this.cache.clear(); }

  /** Installs (or replaces) the NX_* views. Needs a login allowed to create views. */
  static async installViews(k: Knex, folderSchema: string, viewSchema: string) {
    const file = path.join(__dirname, 'views.sql');
    const sql = fs.readFileSync(file, 'utf8')
      .replace(/\{\{X3\}\}/g, folderSchema ? `${folderSchema}.` : '')
      .replace(/\{\{NX\}\}/g, viewSchema ? `${viewSchema}.` : '');
    const statements = sql.split(/^-- @@\s*$/m)
      .map((s) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').trim().replace(/;\s*$/, ''))
      .filter(Boolean);
    for (const s of statements) await k.raw(s);
    return statements.length;
  }

  async ping() { await this.q('NX_SITE').first(); return true; }

  sites(): Promise<Site[]> {
    return this.cached('sites', async () => (await this.q('NX_SITE').select()).map((r: Record<string, unknown>) => ({ code: str(r.code), name: str(r.name), city: str(r.city), kind: str(r.kind) as Site['kind'] }))
      .sort((a, b) => (a.code === 'MAIN' ? -1 : b.code === 'MAIN' ? 1 : 0)));
  }

  products(): Promise<ProductRow[]> {
    return this.cached('products', async () => (await this.q('NX_PRODUCT').select().orderBy('id')).map((r: Record<string, unknown>) => ({
      id: str(r.id), sku: str(r.sku), name: str(r.name), brand: str(r.brand), category: str(r.category), packSize: str(r.pack_size), uom: str(r.uom),
      moq: n(r.moq) || 1, basePrice: n(r.base_price), taxRatePct: n(r.tax_rate_pct),
    })));
  }

  sitePrices(): Promise<Map<string, number>> {
    return this.cached('sitePrices', async () => new Map((await this.q('NX_SITE_PRICE').select()).map((r: Record<string, unknown>) => [`${str(r.site)}|${str(r.product_id)}`, n(r.price)] as [string, number])));
  }

  async stock(site?: string, productIds?: string[]): Promise<StockRow[]> {
    let q = this.q('NX_STOCK').select();
    if (site) q = q.where('site', site);
    if (productIds) q = q.whereIn('product_id', productIds);
    return (await q).map((r: Record<string, unknown>) => ({ productId: str(r.product_id), site: str(r.site), physical: n(r.physical), allocated: n(r.allocated), free: n(r.free_qty), leadTimeDays: n(r.lead_time_days) }));
  }

  async customers(ids?: string[]): Promise<CustomerRow[]> {
    let q = this.q('NX_CUSTOMER').select().orderBy('id');
    if (ids) q = q.whereIn('id', ids);
    return (await q).map((r: Record<string, unknown>) => ({
      id: str(r.id), code: str(r.code), name: str(r.name), type: str(r.type) as 'B2B' | 'B2C', status: str(r.status) as CustomerRow['status'], repCode: str(r.rep_code),
      tier: (str(r.tier) || 'C') as 'A' | 'B' | 'C', creditLimit: n(r.credit_limit), paymentTerms: str(r.payment_terms), contactName: str(r.contact_name), gstin: str(r.gstin),
      since: toIso(r.since), address: addr(r), billingAddress: r.bill_line1 ? addr(r, 'bill_') : addr(r), phone: str(r.phone), email: str(r.email),
      outstanding: Math.round(n(r.outstanding) * 100) / 100, tierDiscountPct: n(r.tier_discount_pct),
    }));
  }

  contractPrices(customerIds?: string[]): Promise<{ customerId: string; productId: string; price: number; validFrom?: string; validTo?: string }[]> {
    return this.cached('contract', async () => (await this.q('NX_CONTRACT_PRICE').select()).map((r: Record<string, unknown>) => ({
      customerId: str(r.customer_id), productId: str(r.product_id), price: n(r.price), validFrom: toIso(r.valid_from), validTo: toIso(r.valid_to),
    }))).then((rows) => (customerIds ? rows.filter((x) => customerIds.includes(x.customerId)) : rows));
  }

  salesReps(): Promise<{ code: string; name: string }[]> {
    return this.cached('reps', async () => (await this.q('NX_SALES_REP').select()).map((r: Record<string, unknown>) => ({ code: str(r.code), name: str(r.name) })));
  }

  async offerLines(): Promise<OfferLineRow[]> {
    return (await this.q('NX_OFFER_LINE').select().orderBy(['code', 'record'])).map((r: Record<string, unknown>) => ({
      code: str(r.code), title: str(r.title), description: str(r.description), erpRef: str(r.erp_ref), record: str(r.record), productId: str(r.product_id), customerId: str(r.customer_id),
      site: str(r.site), tier: str(r.tier), category: str(r.category), validFrom: toIso(r.valid_from), validTo: toIso(r.valid_to), minQty: n(r.min_qty), discountPct: n(r.discount_pct),
      freeProductId: str(r.free_product_id), freeQty: n(r.free_qty),
    }));
  }

  async orders(f: { ids?: string[]; site?: string; customerIds?: string[]; repCode?: string; portalRef?: string } = {}): Promise<OrderRow[]> {
    let q = this.q('NX_ORDER').select();
    if (f.ids) q = q.whereIn('id', f.ids);
    if (f.site) q = q.where('site', f.site);
    if (f.customerIds) q = q.whereIn('customer_id', f.customerIds);
    if (f.repCode) q = q.where('rep_code', f.repCode);
    if (f.portalRef) q = q.where('portal_ref', f.portalRef);
    return (await q.orderBy('order_date', 'desc')).map((r: Record<string, unknown>) => ({
      id: str(r.id), customerId: str(r.customer_id), site: str(r.site), date: toIso(r.order_date), expectedDelivery: toIso(r.expected_delivery), poNumber: str(r.po_number),
      repCode: str(r.rep_code), net: n(r.net_amount), total: n(r.total), portalRef: str(r.portal_ref), status: str(r.status),
    }));
  }

  async orderLines(orderIds: string[]): Promise<OrderLineRow[]> {
    if (!orderIds.length) return [];
    const out: OrderLineRow[] = [];
    for (let i = 0; i < orderIds.length; i += 500) {
      const rows = await this.q('NX_ORDER_LINE').select().whereIn('order_id', orderIds.slice(i, i + 500)).orderBy(['order_id', 'line_no']);
      out.push(...rows.map((r: Record<string, unknown>) => ({
        orderId: str(r.order_id), lineNo: n(r.line_no), productId: str(r.product_id), name: str(r.name), quantity: n(r.quantity), deliveredQty: n(r.delivered_qty),
        grossPrice: n(r.gross_price), netPrice: n(r.net_price), discountPct: n(r.discount_pct), free: n(r.free) === 1, location: str(r.location),
      })));
    }
    return out;
  }

  async deliveries(f: { ids?: string[]; orderIds?: string[]; site?: string; customerIds?: string[] } = {}): Promise<DeliveryRow[]> {
    let q = this.q('NX_DELIVERY').select();
    if (f.ids) q = q.whereIn('id', f.ids);
    if (f.orderIds) q = q.whereIn('order_id', f.orderIds);
    if (f.site) q = q.where('site', f.site);
    if (f.customerIds) q = q.whereIn('customer_id', f.customerIds);
    return (await q).map((r: Record<string, unknown>) => ({
      id: str(r.id), orderId: str(r.order_id), customerId: str(r.customer_id), site: str(r.site), plannedDate: toIso(r.planned_date), shipDate: toIso(r.ship_date),
      validated: n(r.validated) === 1, carrier: str(r.carrier), trackingRef: str(r.tracking_ref),
    }));
  }

  async deliveryLines(ids: string[]): Promise<DeliveryLineRow[]> {
    if (!ids.length) return [];
    return (await this.q('NX_DELIVERY_LINE').select().whereIn('delivery_id', ids).orderBy(['delivery_id', 'line_no']))
      .map((r: Record<string, unknown>) => ({ deliveryId: str(r.delivery_id), lineNo: n(r.line_no), productId: str(r.product_id), quantity: n(r.quantity) }));
  }

  async invoices(f: { ids?: string[]; customerIds?: string[]; orderIds?: string[] } = {}): Promise<InvoiceRow[]> {
    let q = this.q('NX_INVOICE').select();
    if (f.ids) q = q.whereIn('id', f.ids);
    if (f.customerIds) q = q.whereIn('customer_id', f.customerIds);
    if (f.orderIds) q = q.whereIn('order_id', f.orderIds);
    return (await q.orderBy('invoice_date', 'desc')).map((r: Record<string, unknown>) => ({
      id: str(r.id), customerId: str(r.customer_id), site: str(r.site), date: toIso(r.invoice_date), amount: n(r.amount), orderId: str(r.order_id), dueDate: toIso(r.due_date), paid: n(r.paid),
    }));
  }

  async receipts(f: { ids?: string[]; customerIds?: string[]; portalRef?: string } = {}): Promise<ReceiptRow[]> {
    let q = this.q('NX_RECEIPT').select();
    if (f.ids) q = q.whereIn('id', f.ids);
    if (f.customerIds) q = q.whereIn('customer_id', f.customerIds);
    if (f.portalRef) q = q.where('portal_ref', f.portalRef);
    return (await q.orderBy('receipt_date', 'desc')).map((r: Record<string, unknown>) => ({
      id: str(r.id), customerId: str(r.customer_id), date: toIso(r.receipt_date), amount: n(r.amount), method: str(r.method), reference: str(r.reference), portalRef: str(r.portal_ref),
    }));
  }

  async receiptLines(receiptIds?: string[], invoiceIds?: string[]): Promise<ReceiptLineRow[]> {
    let q = this.q('NX_RECEIPT_LINE').select();
    if (receiptIds) q = q.whereIn('receipt_id', receiptIds);
    if (invoiceIds) q = q.whereIn('invoice_id', invoiceIds);
    return (await q.orderBy(['receipt_id', 'line_no'])).map((r: Record<string, unknown>) => ({ receiptId: str(r.receipt_id), lineNo: n(r.line_no), invoiceId: str(r.invoice_id), amount: n(r.amount) }));
  }

  suppliers(): Promise<SupplierRow[]> {
    return this.cached('suppliers', async () => (await this.q('NX_SUPPLIER').select().orderBy('id')).map((r: Record<string, unknown>) => ({
      id: str(r.id), code: str(r.code), name: str(r.name), contactName: str(r.contact_name), paymentTerms: str(r.payment_terms), address: addr(r), phone: str(r.phone), email: str(r.email),
    })));
  }

  supplierItems(): Promise<{ supplierId: string; productId: string; unitCost: number }[]> {
    return this.cached('supplierItems', async () => (await this.q('NX_SUPPLIER_ITEM').select()).map((r: Record<string, unknown>) => ({ supplierId: str(r.supplier_id), productId: str(r.product_id), unitCost: n(r.unit_cost) })));
  }

  async purchaseOrders(f: { ids?: string[]; site?: string; supplierId?: string; portalRef?: string } = {}): Promise<PoRow[]> {
    let q = this.q('NX_PURCHASE_ORDER').select();
    if (f.ids) q = q.whereIn('id', f.ids);
    if (f.site) q = q.where('site', f.site);
    if (f.supplierId) q = q.where('supplier_id', f.supplierId);
    if (f.portalRef) q = q.where('portal_ref', f.portalRef);
    return (await q.orderBy('order_date', 'desc')).map((r: Record<string, unknown>) => ({
      id: str(r.id), supplierId: str(r.supplier_id), site: str(r.site), date: toIso(r.order_date), expectedDate: toIso(r.expected_date), closed: n(r.closed) === 1, portalRef: str(r.portal_ref),
    }));
  }

  async purchaseOrderLines(ids: string[]): Promise<PoLineRow[]> {
    if (!ids.length) return [];
    return (await this.q('NX_PURCHASE_ORDER_LINE').select().whereIn('order_id', ids).orderBy(['order_id', 'line_no'])).map((r: Record<string, unknown>) => ({
      orderId: str(r.order_id), lineNo: n(r.line_no), productId: str(r.product_id), quantity: n(r.quantity), receivedQty: n(r.received_qty), unitCost: n(r.unit_cost),
    }));
  }

  async goodsReceipts(orderIds: string[]): Promise<GrnRow[]> {
    if (!orderIds.length) return [];
    return (await this.q('NX_GOODS_RECEIPT').select().whereIn('order_id', orderIds).orderBy(['receipt_date', 'id', 'line_no'])).map((r: Record<string, unknown>) => ({
      id: str(r.id), orderId: str(r.order_id), site: str(r.site), date: toIso(r.receipt_date), createdBy: str(r.created_by), lineNo: n(r.line_no), productId: str(r.product_id), quantity: n(r.quantity),
    }));
  }

  async locationStock(f: { site?: string; locations?: string[]; productId?: string } = {}): Promise<{ site: string; location: string; productId: string; quantity: number }[]> {
    let q = this.q('NX_LOCATION_STOCK').select();
    if (f.site) q = q.where('site', f.site);
    if (f.locations) q = q.whereIn('location', f.locations);
    if (f.productId) q = q.where('product_id', f.productId);
    return (await q).map((r: Record<string, unknown>) => ({ site: str(r.site), location: str(r.location), productId: str(r.product_id), quantity: n(r.quantity) }));
  }

  async journal(f: { site: string; productId?: string; location?: string; limit?: number }): Promise<JournalRow[]> {
    let q = this.q('NX_STOCK_JOURNAL').select().where('site', f.site);
    if (f.productId) q = q.where('product_id', f.productId);
    if (f.location) q = q.where('location', f.location);
    q = q.orderBy('moved_at', 'desc');
    if (f.limit) q = q.limit(f.limit);
    return (await q).map((r: Record<string, unknown>) => ({
      site: str(r.site), productId: str(r.product_id), at: toIso(r.moved_at), quantity: n(r.quantity), ref: str(r.ref), party: str(r.party), location: str(r.location), kind: str(r.kind),
    }));
  }
}
