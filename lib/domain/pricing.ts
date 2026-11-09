import type { Customer, Offer, OrderLine, Product } from '@/types/domain';

/**
 * Pricing – mirrors how Sage X3 prices a sales order line:
 * 1. Contract price for the customer/product, else base price less the
 *    customer's tier discount.
 * 2. ERP offers on top (offers are maintained in X3, the portal only reads them):
 *    - percent:    a discount on the line
 *    - tier:       quantity breaks on the line quantity
 *    - free_goods: for every N bought, M free (same or another product),
 *                  added as separate zero-priced lines
 *    When several discounts apply to a line, the best one wins.
 * The backend runs the same rules (or asks X3); the frontend copy exists so
 * the cart can show prices and nudges instantly, and the order is always
 * re-priced by the backend on submission.
 */
export function customerUnitPrice(product: Product, customer?: Customer | null): number {
  if (!customer) return product.basePrice;
  const contract = customer.contractPrices?.[product.id];
  if (contract) return contract;
  return Math.round(product.basePrice * (1 - customer.tierDiscountPct / 100) * 100) / 100;
}

export interface PriceContext { customer?: Customer | null; site?: string | null; at?: Date }

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Status from the dates, as X3 would decide it. */
export function offerStatus(o: Pick<Offer, 'validFrom' | 'validTo'>, at = new Date()): Offer['status'] {
  const t = at.getTime();
  if (t < new Date(o.validFrom).getTime()) return 'scheduled';
  if (t > new Date(o.validTo).getTime()) return 'expired';
  return 'active';
}

/** Does the offer apply to this customer and site right now? */
export function offerAppliesTo(o: Offer, ctx: PriceContext): boolean {
  if (offerStatus(o, ctx.at) !== 'active') return false;
  if (o.sites?.length && ctx.site && !o.sites.includes(ctx.site)) return false;
  if (o.audience === 'all') return true;
  if (!ctx.customer) return false;
  if (o.audience === 'customers') return !!o.customerIds?.includes(ctx.customer.id);
  return o.audience === `tier_${ctx.customer.priceTier}`;
}

export const offerCovers = (o: Offer, p: Pick<Product, 'id' | 'category'>) => o.productIds.includes(p.id) || !!o.categories?.includes(p.category);

/** Offers that apply to a product for this customer/site (all kinds). */
export function offersFor(p: Pick<Product, 'id' | 'category'>, ctx: PriceContext, offers: Offer[]): Offer[] {
  return offers.filter((o) => offerCovers(o, p) && offerAppliesTo(o, ctx));
}

/** Discount % an offer gives at a quantity (0 for free goods). */
export function discountAt(o: Offer, qty: number): number {
  if (o.kind === 'percent') return o.discountPct ?? 0;
  if (o.kind === 'tier') return [...(o.tiers ?? [])].sort((a, b) => b.minQty - a.minQty).find((t) => qty >= t.minQty)?.discountPct ?? 0;
  return 0;
}

/** Best line discount at a quantity, and the offer giving it. */
export function bestDiscount(p: Pick<Product, 'id' | 'category'>, qty: number, ctx: PriceContext, offers: Offer[]) {
  let best: { offer: Offer; pct: number } | undefined;
  for (const o of offersFor(p, ctx, offers)) {
    const pct = discountAt(o, qty);
    if (pct > 0 && (!best || pct > best.pct)) best = { offer: o, pct };
  }
  return best;
}

/** Back-compat: the main offer to badge a product with (best discount at MOQ, else any free-goods offer). */
export function offerFor(productId: string, customer: Customer | null | undefined, offers: Offer[], category?: string): Offer | undefined {
  const list = offersFor({ id: productId, category: category ?? '' }, { customer }, offers);
  return list.find((o) => o.kind !== 'free_goods' && discountAt(o, Number.MAX_SAFE_INTEGER) > 0) ?? list[0];
}

export function stockStatus(p: Product) {
  if (p.stock <= 0) return 'out_of_stock' as const;
  if (p.stock < p.moq * 5 || p.stock < 20) return 'low_stock' as const;
  return 'in_stock' as const;
}

export function buildLine(product: Product, quantity: number, customer: Customer | null | undefined, offers: Offer[], site?: string | null): OrderLine {
  const unitPrice = customerUnitPrice(product, customer);
  const best = bestDiscount(product, quantity, { customer, site }, offers);
  const discountPct = best?.pct ?? 0;
  const lineTotal = r2(unitPrice * quantity * (1 - discountPct / 100));
  return {
    productId: product.id, sku: product.sku, name: product.name, uom: product.uom, image: product.image, quantity,
    listPrice: product.basePrice, unitPrice, discountPct, lineTotal, offerId: best?.offer.id, offerCode: best?.offer.code,
  };
}

/** Zero-priced lines earned by free-goods offers. */
export function freeLines(items: { product: Product; quantity: number }[], customer: Customer | null | undefined, offers: Offer[], products: Product[], site?: string | null): OrderLine[] {
  const out: OrderLine[] = [];
  for (const i of items) {
    for (const o of offersFor(i.product, { customer, site }, offers).filter((x) => x.kind === 'free_goods' && x.buyQty && x.freeQty)) {
      const n = Math.floor(i.quantity / o.buyQty!) * o.freeQty!;
      if (n <= 0) continue;
      const fp = o.freeProductId ? products.find((p) => p.id === o.freeProductId) : i.product;
      if (!fp) continue;
      out.push({
        productId: fp.id, sku: fp.sku, name: fp.name, uom: fp.uom, image: fp.image, quantity: n, listPrice: fp.basePrice,
        unitPrice: 0, discountPct: 100, lineTotal: 0, offerId: o.id, offerCode: o.code, free: true, freeFor: i.product.id,
      });
    }
  }
  return out;
}

/**
 * Lines and totals for a cart / request / order. Free-goods lines follow the
 * paid lines. `products` is the catalog, needed when the free item is another product.
 */
export function buildOrderTotals(items: { product: Product; quantity: number }[], customer: Customer | null | undefined, offers: Offer[], opts: { products?: Product[]; site?: string | null } = {}) {
  const paid = items.map((i) => buildLine(i.product, i.quantity, customer, offers, opts.site));
  const free = freeLines(items, customer, offers, opts.products ?? items.map((i) => i.product), opts.site);
  const gross = paid.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const net = paid.reduce((s, l) => s + l.lineTotal, 0);
  const discount = r2(gross - net);
  const freeValue = r2(free.reduce((s, l) => s + customerUnitPrice({ basePrice: l.listPrice, id: l.productId } as Product, customer) * l.quantity, 0));
  const tax = r2(net * 0.18); // GST placeholder – ERP will compute final tax
  return { lines: [...paid, ...free], subtotal: r2(gross), discount, freeValue, tax, total: r2(net + tax) };
}

/** "Add 3 more to get 10% off" / "Add 2 more to get 1 free". */
export interface OfferNudge { productId: string; offerId: string; offerCode: string; kind: 'tier' | 'free'; needed: number; discountPct?: number; freeQty?: number; freeProductId?: string }

/**
 * Nudges for cart lines that are close to the next quantity break or free item:
 * shown when the extra quantity is at most half of what the step needs (min 1).
 */
export function nudgesFor(items: { product: Product; quantity: number }[], customer: Customer | null | undefined, offers: Offer[], site?: string | null): OfferNudge[] {
  const out: OfferNudge[] = [];
  for (const i of items) {
    if (i.quantity <= 0) continue;
    const ctx = { customer, site };
    const current = bestDiscount(i.product, i.quantity, ctx, offers)?.pct ?? 0;
    for (const o of offersFor(i.product, ctx, offers)) {
      if (o.kind === 'tier') {
        const next = [...(o.tiers ?? [])].sort((a, b) => a.minQty - b.minQty).find((t) => t.minQty > i.quantity && t.discountPct > current);
        if (next) {
          const needed = next.minQty - i.quantity;
          if (needed <= Math.max(1, Math.ceil(next.minQty / 2))) out.push({ productId: i.product.id, offerId: o.id, offerCode: o.code, kind: 'tier', needed, discountPct: next.discountPct });
        }
      }
      if (o.kind === 'free_goods' && o.buyQty && o.freeQty) {
        const needed = o.buyQty - (i.quantity % o.buyQty);
        if (needed < o.buyQty && needed <= Math.max(1, Math.ceil(o.buyQty / 2))) out.push({ productId: i.product.id, offerId: o.id, offerCode: o.code, kind: 'free', needed, freeQty: o.freeQty, freeProductId: o.freeProductId });
      }
    }
  }
  return out;
}
