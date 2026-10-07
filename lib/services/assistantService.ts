import { orderService } from './orderService';
import { invoiceService } from './invoiceService';
import { customerService } from './customerService';
import { fmtDate, fmtMoney } from '@/lib/format';
import type { User } from '@/types/domain';

/**
 * AI assistant (MOCK). Future: the backend LLM agent calls these same
 * permission-checked business functions as tools – it never queries the ERP directly.
 */
export interface AssistantAction { label: string; href?: string; kind?: 'reorder'; orderId?: string; }
export interface AssistantReply { text: string; bullets?: string[]; actions?: AssistantAction[]; tool?: string; }

export const ASSISTANT_SUGGESTIONS: Record<string, string[]> = {
  customer: ['What are my recent orders?', 'What is my outstanding balance?', 'When is my order expected?', 'Show products I usually buy', 'Create the same order as last month'],
  sales: ['Which customers have overdue payments?', 'What are my recent orders?', 'Show my sales this month'],
  manager: ['How many orders need approval?', 'What are the recent orders?', 'Which customers have overdue payments?'],
  admin: ['How many orders need approval?', 'What are the recent orders?', 'Which customers have overdue payments?'],
};

export const assistantService = {
  async ask(q: string, user: User): Promise<AssistantReply> {
    const s = q.toLowerCase();
    const scope = user.role === 'customer' ? { customerId: user.customerId } : user.role === 'sales' ? { salesRepId: user.id } : {};
    const orders = await orderService.getOrders(scope);

    if (/(outstanding|balance|credit|owe)/.test(s) && user.customerId) {
      const a = await invoiceService.getAccountSummary(user.customerId);
      return { tool: 'invoiceService.getAccountSummary', text: `Your outstanding balance is ${fmtMoney(a.outstanding)} against a credit limit of ${fmtMoney(a.creditLimit)}.`,
        bullets: [`Available credit: ${fmtMoney(a.available)}`, `Overdue: ${fmtMoney(a.overdue)}`, `Payment terms: ${a.paymentTerms}`], actions: [{ label: 'Open account', href: '/account' }] };
    }
    if (/(overdue|unpaid)/.test(s)) {
      const custs = (await customerService.getCustomers(user.role === 'sales' ? { salesRepId: user.id } : {})).filter((c) => c.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding).slice(0, 5);
      return { tool: 'customerService.getCustomers', text: `${custs.length} customers in your scope have outstanding balances:`, bullets: custs.map((c) => `${c.name} – ${fmtMoney(c.outstanding)}`), actions: [{ label: 'View customers', href: '/customers' }] };
    }
    if (/(approv)/.test(s) && user.role !== 'customer') {
      const p = orders.filter((o) => o.status === 'pending_approval');
      return { tool: 'orderService.getOrders', text: `${p.length} orders are waiting for approval.`, bullets: p.slice(0, 5).map((o) => `${o.number} · ${o.customerName} · ${fmtMoney(o.total)}`), actions: user.role === 'manager' ? [{ label: 'Open approvals', href: '/approvals' }] : [{ label: 'Open orders', href: '/orders' }] };
    }
    if (/(expected|deliver|when|track)/.test(s)) {
      const open = orders.filter((o) => ['confirmed', 'processing', 'packed', 'dispatched', 'pending_approval'].includes(o.status)).slice(0, 4);
      if (!open.length) return { text: 'You have no open orders right now.' };
      return { tool: 'orderService.getOrders', text: 'Here are your open orders and their expected delivery dates:', bullets: open.map((o) => `${o.number} – ${o.status.replace('_', ' ')} – expected ${fmtDate(o.expectedDelivery)}`), actions: [{ label: `Track ${open[0].number}`, href: `/orders/${open[0].id}` }] };
    }
    if (/(usually|frequent|often|buy)/.test(s)) {
      const m: Record<string, { name: string; qty: number; uom: string; id: string }> = {};
      orders.forEach((o) => o.lines.forEach((l) => { m[l.productId] = { id: l.productId, name: l.name, uom: l.uom, qty: (m[l.productId]?.qty ?? 0) + l.quantity }; }));
      const top = Object.values(m).sort((a, b) => b.qty - a.qty).slice(0, 5);
      return { tool: 'orderService.getOrders', text: 'Based on your order history, these are your most frequently purchased products:', bullets: top.map((t) => `${t.name} – ${t.qty} ${t.uom}`), actions: top[0] ? [{ label: 'View top product', href: `/catalog/${top[0].id}` }] : [] };
    }
    if (/(same order|repeat|reorder|last month)/.test(s)) {
      const last = orders.find((o) => ['delivered', 'dispatched', 'confirmed'].includes(o.status));
      if (!last) return { text: 'I could not find a previous order to repeat.' };
      return { tool: 'orderService.getOrder', text: `Your last completed order was ${last.number} on ${fmtDate(last.date)} for ${fmtMoney(last.total)} (${last.lines.length} items). I can add the same items to your cart at today's prices – you'll review before submitting.`, bullets: last.lines.map((l) => `${l.quantity} × ${l.name}`), actions: [{ label: 'Add to cart', kind: 'reorder', orderId: last.id }] };
    }
    if (/(sales|performance|target)/.test(s) && user.role === 'sales') {
      return { text: 'Your monthly performance summary is on the Performance screen.', actions: [{ label: 'Open performance', href: '/performance' }] };
    }
    if (/(order)/.test(s)) {
      const r = orders.slice(0, 5);
      return { tool: 'orderService.getOrders', text: `Here are the ${r.length} most recent orders:`, bullets: r.map((o) => `${o.number} · ${fmtDate(o.date)} · ${fmtMoney(o.total)} · ${o.status.replace('_', ' ')}`), actions: [{ label: 'View all orders', href: '/orders' }] };
    }
    return { text: "I'm a preview assistant. I can help with orders, delivery dates, balances, frequently bought products and repeat orders. Try one of the suggestions below." };
  },
};
