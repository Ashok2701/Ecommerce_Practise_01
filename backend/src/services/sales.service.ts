import { Injectable } from '@nestjs/common';
import { Erp } from './erp';
import { assertCustomerInScope, customerScope, DAY, nowIso, scopedCustomerIds, text } from './common';
import { badRequest, notFound } from '../common/errors';
import { isCustomer, isManager, type Ctx } from '../common/ctx';
import { stockStatus } from '@/lib/domain/pricing';
import { creditCheck } from '@/lib/domain/credit';
import type { Customer, Delivery, Invoice, Order, Paginated, Payment, Product, Site } from '@/types/domain';

const OPEN_ORDER = ['pending_sync', 'pending_approval', 'changes_requested', 'confirmed', 'processing', 'packed', 'dispatched'];

/** Catalogue, customers, sales orders and invoices: read from Sage X3, scoped to the caller. */
@Injectable()
export class SalesService {
  constructor(private erp: Erp) {}

  /* ---------------- sites ---------------- */
  async sites(): Promise<Site[]> { return this.erp.sites(); }

  /* ---------------- catalogue ---------------- */

  async products(ctx: Ctx, q: { search?: string; category?: string; brands?: string; stock?: string; sort?: string; page?: string; pageSize?: string }): Promise<Paginated<Product>> {
    const s = q.search?.trim().toLowerCase() ?? '';
    const brands = q.brands ? q.brands.split(',').map((b) => b.trim()).filter(Boolean) : [];
    let items = (await this.erp.productsAt(ctx.site)).filter((p) =>
      (!s || [p.name, p.sku, p.brand, p.description, p.category].some((v) => (v ?? '').toLowerCase().includes(s))) &&
      (!q.category || q.category === 'all' || p.category === q.category) &&
      (!brands.length || brands.includes(p.brand)) &&
      (!q.stock || q.stock === 'all' || stockStatus(p) === q.stock));
    if (q.sort === 'price_asc') items = items.sort((a, b) => a.basePrice - b.basePrice);
    if (q.sort === 'price_desc') items = items.sort((a, b) => b.basePrice - a.basePrice);
    if (q.sort === 'name') items = items.sort((a, b) => a.name.localeCompare(b.name));
    const page = Math.max(1, Number(q.page) || 1), pageSize = Math.min(1000, Math.max(1, Number(q.pageSize) || 12));
    return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize };
  }

  async product(ctx: Ctx, id: string): Promise<Product> {
    const p = await this.erp.product(id, ctx.site);
    const others = (ctx.user.allowedSites ?? []).filter((s) => s !== ctx.site);
    const free = await this.erp.freeStock(others, [id]);
    p.otherSites = others.map((site) => ({ site, stock: free.get(`${site}|${id}`) ?? 0 }));
    return p;
  }

  /* ---------------- customers ---------------- */

  async customers(ctx: Ctx, q: { search?: string; status?: string; salesRepId?: string }): Promise<Customer[]> {
    const scope = await customerScope(ctx, this.erp);
    const s = q.search?.toLowerCase() ?? '';
    return (await this.erp.customers(scope)).filter((c) =>
      (!s || [c.name, c.code, c.contactName, c.address.city].some((v) => (v ?? '').toLowerCase().includes(s))) &&
      (!q.status || q.status === 'all' || c.status === q.status) && (!q.salesRepId || c.salesRepId === q.salesRepId));
  }

  async customer(ctx: Ctx, id: string): Promise<Customer> {
    await assertCustomerInScope(ctx, this.erp, id);
    return this.erp.customer(id);
  }

  async account(ctx: Ctx, customerId: string) {
    await assertCustomerInScope(ctx, this.erp, customerId);
    const [c, invoices, payments] = await Promise.all([this.erp.customer(customerId), this.erp.invoices({ customerIds: [customerId] }), this.erp.payments([customerId])]);
    invoices.sort((a, b) => b.date.localeCompare(a.date));
    const open = invoices.filter((i) => i.status !== 'paid');
    const overdue = open.filter((i) => i.status === 'overdue').reduce((s, i) => s + i.amount - i.paid, 0);
    const in7 = Date.now() + 7 * DAY;
    const dueSoon = open.filter((i) => i.status !== 'overdue' && new Date(i.dueDate).getTime() < in7).reduce((s, i) => s + i.amount - i.paid, 0);
    return { creditLimit: c.creditLimit, outstanding: c.outstanding, available: Math.max(0, c.creditLimit - c.outstanding), overdue, dueSoon, invoices, paymentTerms: c.paymentTerms, payments };
  }

  /* ---------------- sales orders ---------------- */

  async orders(ctx: Ctx, q: { customerId?: string; salesRepId?: string; status?: string; search?: string }): Promise<Order[]> {
    const customerIds = await scopedCustomerIds(ctx, this.erp, q.customerId);
    const rows = await this.erp.orders({ site: ctx.site || undefined, customerIds, salesRepId: q.salesRepId });
    const s = q.search?.toLowerCase() ?? '';
    return rows.filter((o) =>
      (!q.status || q.status === 'all' || (q.status === 'open' ? OPEN_ORDER.includes(o.status) : o.status === q.status)) &&
      (!s || [o.number, o.customerName, o.poNumber ?? '', ...o.lines.map((l) => l.name)].some((v) => v.toLowerCase().includes(s))))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async order(ctx: Ctx, id: string): Promise<Order> {
    const o = await this.erp.order(id).catch(() => { throw notFound(); });
    await assertCustomerInScope(ctx, this.erp, o.customerId);
    return o;
  }

  async creditCheck(ctx: Ctx, id: string) {
    const o = await this.order(ctx, id);
    const c = await this.erp.customer(o.customerId);
    return creditCheck(o, c, await this.erp.orders({ customerIds: [c.id] }));
  }

  async comment(ctx: Ctx, id: string, body: string): Promise<Order> {
    const o = await this.order(ctx, id);
    const t = text(body).trim();
    if (!t) return o;
    await this.erp.db.tx(async (r) => {
      const ext = (await r.orderExt.get(id)) ?? { id, site: o.site, customerId: o.customerId, timeline: o.timeline, comments: [], at: o.date };
      ext.comments.push({ by: ctx.user.name, at: nowIso(), text: t });
      await r.orderExt.save(ext);
    });
    return this.erp.order(id);
  }

  /** Cancel in X3 while nothing has been delivered (X3 refuses otherwise). */
  async cancel(ctx: Ctx, id: string): Promise<Order> {
    const o = await this.order(ctx, id);
    if (!['confirmed', 'processing', 'packed'].includes(o.status)) throw badRequest('errors.orders.cannotCancel');
    if (isCustomer(ctx) && o.createdBy.id !== ctx.user.id && !isManager(ctx)) throw badRequest('errors.orders.cannotCancel');
    await this.erp.gateway.cancelSalesOrder(id, `${id}/cancel`);
    await this.erp.db.tx(async (r) => {
      const ext = (await r.orderExt.get(id)) ?? { id, site: o.site, customerId: o.customerId, timeline: o.timeline, comments: [], at: o.date };
      ext.timeline.push({ status: 'cancelled', at: nowIso(), by: ctx.user.name, note: 'Cancelled by user' });
      ext.erpStatus = 'cancelled';
      await r.orderExt.save(ext);
      await r.audit({ userId: ctx.user.id, userName: ctx.user.name, site: ctx.site, action: 'order.cancel', entity: 'order', entityId: id });
    });
    return this.erp.order(id);
  }

  /* ---------------- invoices ---------------- */

  async invoices(ctx: Ctx, customerId?: string): Promise<Invoice[]> {
    const customerIds = await scopedCustomerIds(ctx, this.erp, customerId);
    return (await this.erp.invoices({ customerIds })).sort((a, b) => b.date.localeCompare(a.date));
  }

  async invoice(ctx: Ctx, id: string): Promise<{ invoice: Invoice; order?: Order; delivery?: Delivery; customer: Customer; payments: { payment: Payment; amount: number }[]; pending: Payment[]; daysOverdue: number }> {
    const [invoice] = await this.erp.invoices({ ids: [id] });
    if (!invoice) throw notFound();
    await assertCustomerInScope(ctx, this.erp, invoice.customerId);
    const [order, customer, all] = await Promise.all([
      invoice.orderId ? this.erp.orders({ ids: [invoice.orderId] }).then((x) => x[0]) : undefined, this.erp.customer(invoice.customerId), this.erp.payments([invoice.customerId]),
    ]);
    const payments = all.flatMap((p) => {
      const a = p.allocations?.find((x) => x.invoiceId === id) ?? (!p.allocations && p.invoiceNumbers.includes(invoice.number) ? { amount: p.amount } : undefined);
      return a && (p.status ?? 'posted') === 'posted' ? [{ payment: p, amount: a.amount }] : [];
    });
    const pending = all.filter((p) => p.status === 'pending_verification' && p.invoiceNumbers.includes(invoice.number));
    const delivery = order?.deliveryId ? (await this.erp.deliveries({ ids: [order.deliveryId] }))[0] : undefined;
    return { invoice, order, customer, delivery, payments, pending, daysOverdue: invoice.status === 'paid' ? 0 : Math.max(0, Math.floor((Date.now() - new Date(invoice.dueDate).getTime()) / DAY)) };
  }
}
