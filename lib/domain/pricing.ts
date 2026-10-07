import type { Customer, Offer, OrderLine, Product } from '@/types/domain';

/**
 * Customer-specific pricing rules (mirrors Sage X3 price lists):
 * 1. Contract price for the customer/product, else
 * 2. Base list price less the customer's tier discount.
 * Active offers are applied on top as a line discount.
 */
export function customerUnitPrice(product: Product, customer?: Customer | null): number {
  if (!customer) return product.basePrice;
  const contract = customer.contractPrices?.[product.id];
  if (contract) return contract;
  return Math.round(product.basePrice * (1 - customer.tierDiscountPct / 100) * 100) / 100;
}

export function offerFor(productId: string, customer: Customer | null | undefined, offers: Offer[]): Offer | undefined {
  return offers.find(
    (o) => o.status === 'active' && o.productIds.includes(productId) && (o.audience === 'all' || (customer && o.audience === `tier_${customer.priceTier}`)),
  );
}

export function stockStatus(p: Product) {
  if (p.stock <= 0) return 'out_of_stock' as const;
  if (p.stock < p.moq * 5 || p.stock < 20) return 'low_stock' as const;
  return 'in_stock' as const;
}

export function buildLine(product: Product, quantity: number, customer: Customer | null | undefined, offers: Offer[]): OrderLine {
  const unitPrice = customerUnitPrice(product, customer);
  const discountPct = offerFor(product.id, customer, offers)?.discountPct ?? 0;
  const lineTotal = Math.round(unitPrice * quantity * (1 - discountPct / 100) * 100) / 100;
  return { productId: product.id, sku: product.sku, name: product.name, uom: product.uom, image: product.image, quantity, listPrice: product.basePrice, unitPrice, discountPct, lineTotal };
}

export function buildOrderTotals(items: { product: Product; quantity: number }[], customer: Customer | null | undefined, offers: Offer[]) {
  const lines = items.map((i) => buildLine(i.product, i.quantity, customer, offers));
  const gross = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const discount = Math.round((gross - subtotal) * 100) / 100;
  const tax = Math.round(subtotal * 0.18 * 100) / 100; // GST placeholder – ERP will compute final tax
  return { lines, subtotal: Math.round(gross * 100) / 100, discount, tax, total: Math.round((subtotal + tax) * 100) / 100 };
}
