import { orderService } from './orderService';
import { requestService } from './requestService';
import { invoiceService } from './invoiceService';
import { customerService } from './customerService';
import { productService } from './productService';
import { offerService } from './contentService';
import { purchaseOrderService } from './purchasingService';
import { consignmentService, transferService } from './inventoryService';
import { deliveryService, paymentService, quoteService } from './commerceService';
import { salesService } from './salesService';
import { fmtDate, fmtMoney, fmtNumber } from '@/lib/format';
import { isCustomerRole } from '@/types/domain';
import type { Role, User } from '@/types/domain';

/**
 * AI assistant (preview). The backend agent will call these same permission-checked
 * business functions as tools – it never queries the ERP directly. Every answer is
 * scoped like the screens: customers see their own data, reps their customers,
 * suppliers only their purchase orders.
 *
 * Answers are built from translation keys (assistant.ai.*) so they follow the user's language.
 */
export interface AssistantAction { label: string; href?: string; kind?: 'reorder'; orderId?: string; }
export interface AssistantReply { text: string; bullets?: string[]; actions?: AssistantAction[]; tool?: string; }
export type Translate = (key: string, params?: Record<string, string | number>) => string;

export type Intent =
  | 'attention' | 'help' | 'balance' | 'invoices' | 'overdue' | 'review' | 'track' | 'frequent' | 'repeat' | 'performance'
  | 'orders' | 'quotes' | 'deliveries' | 'payments' | 'offers' | 'stock' | 'transfers' | 'consignment' | 'purchaseOrders' | 'followUps';

/** Suggestion chips per role, in order. Labels come from assistant.ask.<intent>. */
export const ASSISTANT_SUGGESTIONS: Record<Role, Intent[]> = {
  SUPPLIER: ['attention', 'purchaseOrders', 'help'],
  CUSTOMER_B2C: ['track', 'orders', 'offers', 'frequent', 'help'],
  CUSTOMER_B2B: ['attention', 'balance', 'track', 'quotes', 'offers', 'consignment', 'repeat', 'frequent'],
  SALES_REP: ['attention', 'followUps', 'overdue', 'quotes', 'deliveries', 'performance', 'stock'],
  SUPERVISOR: ['attention', 'review', 'quotes', 'payments', 'deliveries', 'transfers', 'overdue', 'stock'],
  ADMIN: ['attention', 'review', 'orders', 'overdue', 'help'],
};

/** Keywords per intent in the six portal languages. Checked in this order; the first match wins. */
const KEYWORDS: [Intent, RegExp][] = [
  ['attention', /attention|to ?do|waiting for me|pending for me|à faire|attente|zu tun|offen für mich|pendiente|da fare|in attesa|a fazer|pendente/],
  ['help', /what can (you|i) do|help|aide|hilfe|ayuda|aiuto|ajuda/],
  ['stock', /stock|availab|disponib|verfügbar|lager|existenc|giacenz|estoque/],
  ['consignment', /consign|konsignation|consigna|conto deposito/],
  ['transfers', /transfer|transfert|umlagerung|traspaso|trasferiment|transferênc/],
  ['payments', /payment|verify|paiement|zahlung|pago|pagament/],
  ['quotes', /quot|devis|angebot|cotizaci|presupuest|preventiv|orçament|cotaç/],
  ['offers', /offer|discount|promo|deal|offre|remise|rabatt|oferta|descuento|offert|sconto|desconto/],
  ['balance', /outstanding|balance|credit|owe|solde|crédit|saldo|kredit|guthaben|crédito|credito/],
  ['invoices', /invoice|facture|rechnung|factura|fattur|fatura/],
  ['overdue', /overdue|unpaid|en retard|impayé|überfällig|unbezahlt|vencid|impagad|scadut|insolut|atrasad/],
  ['review', /approv|review|valid|genehmig|prüf|aprob|revis|approva|aprova/],
  ['followUps', /follow|relance|nachfass|seguimiento|richiam|acompanhamento/],
  ['deliveries', /deliver|livraison|lieferung|entrega|consegn/],
  ['track', /expected|when|track|quand|wann|cuándo|quando|suivi|verfolg|seguimiento del pedido|traccia|rastre/],
  ['frequent', /usually|frequent|often|habituel|souvent|häufig|oft|habitual|frecuent|di solito|spesso|costum|frequent/],
  ['repeat', /same order|repeat|reorder|last month|même commande|renouvel|gleiche bestellung|wiederhol|mismo pedido|repetir|stesso ordine|ripet|mesmo pedido/],
  ['performance', /sales|performance|target|ventes|objectif|umsatz|ziel|ventas|objetivo|vendite|obiettivo|vendas|meta/],
  ['purchaseOrders', /purchase order|bon de commande|bestellung|orden de compra|ordine d'acquisto|pedido de compra|pickup|enlèvement|abholung|recogida|ritiro|coleta/],
  ['orders', /order|commande|bestell|pedido|ordine|encomenda/],
];

export const detectIntent = (q: string): Intent | undefined => KEYWORDS.find(([, re]) => re.test(q.toLowerCase()))?.[0];

const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); };

export const assistantService = {
  /** Free text: find the intent from keywords, then answer it. */
  ask(q: string, user: User, t: Translate, locale = 'en'): Promise<AssistantReply> {
    const intent = detectIntent(q);
    return intent ? this.answer(intent, user, t, q, locale) : Promise.resolve(help(user, t, true));
  },

  /** Answer one intent for this user. `q` is the original question (used for product lookups). */
  async answer(intent: Intent, user: User, t: Translate, q = '', locale = 'en'): Promise<AssistantReply> {
    const role = user.role;
    const customer = isCustomerRole(role);
    const rep = role === 'SALES_REP';
    const manager = role === 'SUPERVISOR' || role === 'ADMIN';
    const scope = customer ? { customerId: user.customerId } : rep ? { salesRepId: user.id } : {};
    const st = (s: string) => t(`status.${s}`);

    if (role === 'SUPPLIER') {
      if (intent === 'help') return help(user, t);
      const pos = await purchaseOrderService.list({ supplierId: user.supplierId });
      const ack = pos.filter((o) => o.status === 'issued');
      const pick = pos.filter((o) => o.status === 'acknowledged');
      return {
        tool: 'purchaseOrderService.list', text: t('assistant.ai.supplier', { ack: ack.length, pick: pick.length }),
        bullets: [...ack, ...pick].slice(0, 5).map((o) => `${o.number} · ${st(o.status)} · ${t('purchaseOrders.expected', { date: fmtDate(o.expectedDate) })}`),
        actions: [{ label: t('nav.purchaseOrders'), href: '/purchase-orders' }, { label: t('supplierDash.requestPickup'), href: '/supplier-catalog' }],
      };
    }

    switch (intent) {
      case 'help': return help(user, t);

      case 'attention': {
        const lines: string[] = [];
        const actions: AssistantAction[] = [];
        const add = (n: number, key: string, href: string) => { if (n > 0) { lines.push(t(`workQueue.${key}`, { count: n }) + ` – ${n}`); if (actions.length < 3) actions.push({ label: t(`workQueue.${key}`, { count: n }), href }); } };
        if (customer) {
          const [quotes, dels, inv] = await Promise.all([quoteService.list({ customerId: user.customerId, view: 'open' }), deliveryService.list({ customerId: user.customerId, view: 'open' }), invoiceService.getInvoices(user.customerId)]);
          add(quotes.filter((x) => x.status === 'sent').length, 'quotesToAnswer', '/quotes');
          add(dels.filter((x) => x.status === 'out_for_delivery').length, 'onTheWay', '/orders');
          const overdue = inv.filter((i) => i.status === 'overdue');
          if (overdue.length) { lines.push(t('assistant.ai.overdueInvoices', { count: overdue.length, amount: fmtMoney(overdue.reduce((s, i) => s + i.amount - i.paid, 0)) })); actions.push({ label: t('nav.invoices'), href: '/invoices' }); }
        } else {
          const [quotes, dels, pays, trs, reqs, fus] = await Promise.all([
            quoteService.list({ ...scope, view: 'open' }), deliveryService.list({ ...scope, view: 'open' }),
            manager ? paymentService.list({ status: 'pending_verification' }) : Promise.resolve([]),
            manager ? transferService.list({ view: 'open' }) : Promise.resolve([]),
            manager ? requestService.list({ view: 'review' }) : Promise.resolve([]),
            rep ? salesService.getFollowUps(user.id) : Promise.resolve([]),
          ]);
          add(reqs.length, 'requestsToReview', '/approvals');
          add(quotes.filter((x) => x.status === 'requested').length, 'quotesToPrice', '/quotes');
          add(pays.length, 'paymentsToVerify', '/collections?tab=verify');
          add(dels.filter((x) => new Date(x.plannedDate).getTime() <= endOfToday()).length, 'deliveriesDue', '/deliveries');
          add(trs.filter((x) => x.status === 'pending').length, 'transfersToApprove', '/transfers');
          add(fus.filter((f) => f.status === 'open' && new Date(f.date).getTime() <= endOfToday()).length, 'followUpsDue', '/follow-ups');
        }
        return lines.length ? { tool: 'workQueue', text: t('assistant.ai.attention'), bullets: lines, actions } : { text: t('workQueue.clear') };
      }

      case 'balance': case 'invoices': {
        if (!user.customerId) break;
        const [a, inv] = await Promise.all([invoiceService.getAccountSummary(user.customerId), invoiceService.getInvoices(user.customerId)]);
        const open = inv.filter((i) => i.status !== 'paid').slice(0, 4);
        return {
          tool: 'invoiceService.getAccountSummary', text: t('assistant.ai.balance', { amount: fmtMoney(a.outstanding), limit: fmtMoney(a.creditLimit) }),
          bullets: [t('assistant.ai.available', { amount: fmtMoney(a.available) }), t('assistant.ai.overdueAmt', { amount: fmtMoney(a.overdue) }), ...open.map((i) => `${i.number} · ${fmtMoney(i.amount - i.paid)} · ${st(i.status)} · ${t('assistant.ai.due', { date: fmtDate(i.dueDate) })}`)],
          actions: [{ label: t('nav.account'), href: '/account' }, { label: t('nav.invoices'), href: '/invoices' }],
        };
      }

      case 'overdue': {
        if (customer) return this.answer('balance', user, t);
        const custs = (await customerService.getCustomers(rep ? { salesRepId: user.id } : {})).filter((c) => c.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding).slice(0, 5);
        return { tool: 'customerService.getCustomers', text: t('assistant.ai.overdue', { count: custs.length }), bullets: custs.map((c) => `${c.name} – ${fmtMoney(c.outstanding)}`), actions: [{ label: t('nav.collections'), href: '/collections' }] };
      }

      case 'review': {
        if (!manager) break;
        const p = await requestService.list({ view: 'review' });
        return { tool: 'requestService.list', text: t('assistant.ai.review', { count: p.length }), bullets: p.slice(0, 5).map((o) => `${o.number} · ${o.customerName} · ${fmtMoney(o.total)}`), actions: [{ label: t('managerDash.openApprovals'), href: role === 'SUPERVISOR' ? '/approvals' : '/requests' }] };
      }

      case 'quotes': {
        const qs = await quoteService.list({ ...scope, view: 'open' });
        if (!qs.length) return { text: t('assistant.ai.noQuotes'), actions: customer ? [{ label: t('nav.catalog'), href: '/catalog' }] : [] };
        const first = customer ? qs.filter((x) => x.status === 'sent') : qs.filter((x) => x.status === 'requested');
        return {
          tool: 'quoteService.list', text: customer ? t('assistant.ai.quotesCustomer', { open: qs.length, answer: first.length }) : t('assistant.ai.quotesStaff', { open: qs.length, price: first.length }),
          bullets: qs.slice(0, 5).map((x) => `${x.number} · ${customer ? '' : `${x.customerName} · `}${st(x.status)}${x.total ? ` · ${fmtMoney(x.total)}` : ''}`),
          actions: [{ label: t('nav.quotes'), href: first[0] ? `/quotes/${first[0].id}` : '/quotes' }],
        };
      }

      case 'deliveries': {
        const ds = await deliveryService.list({ ...scope, view: 'open' });
        if (!ds.length) return { text: t('assistant.ai.noDeliveries') };
        const due = ds.filter((d) => new Date(d.plannedDate).getTime() <= endOfToday());
        return {
          tool: 'deliveryService.list', text: t('assistant.ai.deliveries', { open: ds.length, due: due.length }),
          bullets: ds.slice(0, 5).map((d) => `${d.number} · ${customer ? d.orderNumber : d.customerName} · ${st(d.status)} · ${fmtDate(d.plannedDate)}`),
          actions: customer ? [{ label: t('nav.orders'), href: '/orders' }] : [{ label: t('nav.deliveries'), href: '/deliveries' }],
        };
      }

      case 'payments': {
        if (customer) return this.answer('balance', user, t);
        if (!manager) return this.answer('overdue', user, t);
        const ps = await paymentService.list({ status: 'pending_verification' });
        return { tool: 'paymentService.list', text: t('assistant.ai.payments', { count: ps.length }), bullets: ps.slice(0, 5).map((p) => `${p.reference} · ${p.customerName ?? ''} · ${fmtMoney(p.amount)} · ${p.method}`), actions: [{ label: t('nav.collections'), href: '/collections?tab=verify' }] };
      }

      case 'offers': {
        const os = await offerService.list(customer ? { forCustomerId: user.customerId } : {});
        if (!os.length) return { text: t('offers.empty') };
        return { tool: 'offerService.list', text: t('assistant.ai.offers', { count: os.length }), bullets: os.slice(0, 5).map((o) => `${o.presentation.title?.[locale] || o.presentation.title?.en || o.title} · ${o.code} · ${t('customerDash.validUntil', { date: fmtDate(o.validTo) })}`), actions: [{ label: t('nav.offers'), href: '/offers' }] };
      }

      case 'stock': {
        const all = await productService.getAll();
        const words = q.toLowerCase().split(/[^a-z0-9-]+/).filter((w) => w.length > 2);
        const hits = all.filter((p) => words.some((w) => p.sku.toLowerCase().includes(w) || p.name.toLowerCase().split(/\s+/).some((n) => n.startsWith(w)) || p.brand.toLowerCase() === w)).slice(0, 5);
        const rows = hits.length ? hits : all.filter((p) => p.stock > 0 && p.stock < p.moq * 3).slice(0, 5);
        return {
          tool: 'productService.getAll', text: hits.length ? t('assistant.ai.stock') : t('assistant.ai.stockLow'),
          bullets: rows.map((p) => `${p.sku} · ${p.name} – ${fmtNumber(p.stock)} ${p.uom}${p.otherSites?.length ? ` (${p.otherSites.map((o) => `${o.site} ${fmtNumber(o.stock)}`).join(', ')})` : ''}`),
          actions: [{ label: t(customer || rep ? 'nav.catalog' : 'nav.inventory'), href: customer || rep ? '/catalog' : '/inventory' }],
        };
      }

      case 'transfers': {
        if (customer) break;
        const trs = await transferService.list({ view: 'open' });
        return { tool: 'transferService.list', text: t('assistant.ai.transfers', { count: trs.length }), bullets: trs.slice(0, 5).map((x) => `${x.number} · ${x.fromSite} → ${x.toSite} · ${st(x.status)}`), actions: [{ label: t('nav.transfers'), href: '/transfers' }] };
      }

      case 'consignment': {
        if (role === 'CUSTOMER_B2C') break;
        const cs = await consignmentService.list(customer ? { customerId: user.customerId } : {});
        if (!cs.length) return { text: t('assistant.ai.noConsignment') };
        const low = cs.flatMap((c) => c.lines.filter((l) => l.low).map((l) => `${c.customerName} · ${l.name} – ${fmtNumber(l.quantity)} ${l.uom}`));
        return { tool: 'consignmentService.list', text: t('assistant.ai.consignment', { count: cs.length, low: low.length }), bullets: low.length ? low.slice(0, 5) : cs.slice(0, 5).map((c) => `${c.number} · ${c.customerName} · ${t('assistant.ai.lines', { count: c.lines.length })}`), actions: [{ label: t('nav.consignment'), href: cs.length === 1 ? `/consignment/${cs[0].id}` : '/consignment' }] };
      }

      case 'followUps': {
        if (!rep) break;
        const fus = (await salesService.getFollowUps(user.id)).filter((f) => f.status === 'open').sort((a, b) => a.date.localeCompare(b.date));
        return { tool: 'salesService.getFollowUps', text: t('assistant.ai.followUps', { count: fus.length }), bullets: fus.slice(0, 5).map((f) => `${fmtDate(f.date)} · ${t(`reps.followType.${f.type}`)} · ${f.notes}`), actions: [{ label: t('nav.followUps'), href: '/follow-ups' }] };
      }

      case 'performance': {
        if (!rep) break;
        const p = await salesService.getPerformance(user.id);
        return { tool: 'salesService.getPerformance', text: t('assistant.ai.performance', { amount: fmtMoney(p.salesMonth), pct: p.achievementPct, target: fmtMoney(p.target) }), actions: [{ label: t('nav.performance'), href: '/performance' }] };
      }

      case 'purchaseOrders': {
        if (!manager) break;
        const pos = await purchaseOrderService.list({ view: 'open' });
        return { tool: 'purchaseOrderService.list', text: t('assistant.ai.purchaseOrders', { count: pos.length }), bullets: pos.slice(0, 5).map((o) => `${o.number} · ${o.supplierName} · ${st(o.status)}`), actions: [{ label: t('nav.purchaseOrders'), href: '/purchase-orders' }] };
      }

      case 'track': {
        const orders = await orderService.getOrders(scope);
        const open = orders.filter((o) => ['confirmed', 'processing', 'packed', 'dispatched'].includes(o.status)).slice(0, 4);
        if (!open.length) return { text: t('assistant.ai.noOpenOrders') };
        return { tool: 'orderService.getOrders', text: t('assistant.ai.track'), bullets: open.map((o) => `${o.number} – ${st(o.status)} – ${t('assistant.ai.expected', { date: fmtDate(o.expectedDelivery) })}`), actions: [{ label: t('assistant.ai.trackOne', { number: open[0].number }), href: `/orders/${open[0].id}` }] };
      }

      case 'frequent': {
        const orders = await orderService.getOrders(scope);
        const m: Record<string, { name: string; qty: number; uom: string; id: string }> = {};
        orders.forEach((o) => o.lines.filter((l) => !l.free).forEach((l) => { m[l.productId] = { id: l.productId, name: l.name, uom: l.uom, qty: (m[l.productId]?.qty ?? 0) + l.quantity }; }));
        const top = Object.values(m).sort((a, b) => b.qty - a.qty).slice(0, 5);
        return { tool: 'orderService.getOrders', text: t('assistant.ai.frequent'), bullets: top.map((x) => `${x.name} – ${fmtNumber(x.qty)} ${x.uom}`), actions: top[0] ? [{ label: t('assistant.ai.viewTop'), href: `/catalog/${top[0].id}` }] : [] };
      }

      case 'repeat': {
        const orders = await orderService.getOrders(scope);
        const last = orders.find((o) => ['delivered', 'dispatched', 'confirmed'].includes(o.status));
        if (!last) return { text: t('assistant.ai.noRepeat') };
        const paid = last.lines.filter((l) => !l.free);
        return { tool: 'orderService.getOrder', text: t('assistant.ai.repeat', { number: last.number, date: fmtDate(last.date), amount: fmtMoney(last.total), count: paid.length }), bullets: paid.map((l) => `${fmtNumber(l.quantity)} × ${l.name}`), actions: [{ label: t('common.addToCart'), kind: 'reorder', orderId: last.id }] };
      }

      case 'orders': {
        const orders = (await orderService.getOrders(scope)).slice(0, 5);
        return { tool: 'orderService.getOrders', text: t('assistant.ai.orders', { count: orders.length }), bullets: orders.map((o) => `${o.number} · ${fmtDate(o.date)} · ${fmtMoney(o.total)} · ${st(o.status)}`), actions: [{ label: t('assistant.ai.allOrders'), href: '/orders' }] };
      }
    }
    return help(user, t, true);
  },
};

/** What this role can ask about. */
function help(user: User, t: Translate, notUnderstood = false): AssistantReply {
  return {
    text: notUnderstood ? t('assistant.ai.notUnderstood') : t('assistant.ai.help'),
    bullets: ASSISTANT_SUGGESTIONS[user.role].filter((i) => i !== 'help').map((i) => t(`assistant.ask.${i}`)),
  };
}
