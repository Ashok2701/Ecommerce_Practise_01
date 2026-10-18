import type { Customer, Order } from '@/types/domain';

/**
 * Credit exposure check (mirrors ERP credit control):
 * exposure = outstanding invoices + other open (approved, not yet invoiced) orders.
 */
export interface CreditCheck { limit: number; outstanding: number; openOrders: number; available: number; orderValue: number; exceededBy: number; over: boolean; onHold: boolean; utilisationAfterPct: number; }

const OPEN = ['confirmed', 'processing', 'packed'];

export function creditCheck(order: Pick<Order, 'id' | 'total'>, customer: Customer, allOrders: Order[] = []): CreditCheck {
  // Retail (B2C) customers pay up front, so there is no credit limit to check.
  if (customer.type === 'B2C') return { limit: 0, outstanding: 0, openOrders: 0, available: 0, orderValue: order.total, exceededBy: 0, over: false, onHold: customer.status === 'on_hold', utilisationAfterPct: 0 };
  const openOrders = allOrders.filter((o) => o.customerId === customer.id && o.id !== order.id && OPEN.includes(o.status) && !o.invoiceId).reduce((s, o) => s + o.total, 0);
  const available = Math.max(0, customer.creditLimit - customer.outstanding - openOrders);
  const exceededBy = Math.max(0, Math.round((order.total - available) * 100) / 100);
  return {
    limit: customer.creditLimit, outstanding: customer.outstanding, openOrders, available, orderValue: order.total, exceededBy, over: exceededBy > 0, onHold: customer.status === 'on_hold',
    utilisationAfterPct: Math.round(((customer.outstanding + openOrders + order.total) / customer.creditLimit) * 100),
  };
}
