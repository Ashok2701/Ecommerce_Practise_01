import { source, http } from '@/lib/api/httpClient';
import { getDb } from '@/lib/data/mockDb';
import type { Customer, Delivery, Invoice, Order, Payment } from '@/types/domain';

export interface AccountSummary { creditLimit: number; outstanding: number; available: number; overdue: number; dueSoon: number; invoices: Invoice[]; payments: Payment[]; paymentTerms: string; }

export interface InvoiceDetail { invoice: Invoice; order?: Order; delivery?: Delivery; customer: Customer; payments: { payment: Payment; amount: number }[]; pending: Payment[]; daysOverdue: number }

export const invoiceService = {
  /** Invoice with its order lines, delivery, and the payments allocated to it. Backend: GET /invoices/{id} */
  getInvoice: (id: string) =>
    source<InvoiceDetail>(() => {
      const db = getDb();
      const invoice = db.invoices.find((i) => i.id === id);
      if (!invoice) throw new Error('errors.notFound');
      const order = db.orders.find((o) => o.id === invoice.orderId);
      const payments = db.payments.flatMap((p) => {
        const a = p.allocations?.find((x) => x.invoiceId === id) ?? (!p.allocations && p.invoiceNumbers.includes(invoice.number) ? { amount: p.amount } : undefined);
        return a && (p.status ?? 'posted') === 'posted' ? [{ payment: p, amount: a.amount }] : [];
      });
      const pending = db.payments.filter((p) => p.status === 'pending_verification' && p.invoiceNumbers.includes(invoice.number));
      return {
        invoice, order, customer: db.customers.find((c) => c.id === invoice.customerId)!, delivery: order?.deliveryId ? db.deliveries.find((d) => d.id === order.deliveryId) : undefined,
        payments, pending, daysOverdue: invoice.status === 'paid' ? 0 : Math.max(0, Math.floor((Date.now() - new Date(invoice.dueDate).getTime()) / 86400000)),
      };
    }, () => http.get(`/invoices/${id}`)),

  getInvoices: (customerId?: string) =>
    source<Invoice[]>(() => getDb().invoices.filter((i) => !customerId || i.customerId === customerId).sort((a, b) => b.date.localeCompare(a.date)), () => http.get('/invoices', { customerId })),
  getAccountSummary: (customerId: string) =>
    source<AccountSummary>(() => {
      const db = getDb();
      const c = db.customers.find((x) => x.id === customerId)!;
      const invoices = db.invoices.filter((i) => i.customerId === customerId).sort((a, b) => b.date.localeCompare(a.date));
      const open = invoices.filter((i) => i.status !== 'paid');
      const overdue = open.filter((i) => i.status === 'overdue').reduce((s, i) => s + i.amount - i.paid, 0);
      const in7 = Date.now() + 7 * 86400000;
      const dueSoon = open.filter((i) => i.status !== 'overdue' && new Date(i.dueDate).getTime() < in7).reduce((s, i) => s + i.amount - i.paid, 0);
      return { creditLimit: c.creditLimit, outstanding: c.outstanding, available: Math.max(0, c.creditLimit - c.outstanding), overdue, dueSoon, invoices, paymentTerms: c.paymentTerms,
        payments: db.payments.filter((p) => p.customerId === customerId).sort((a, b) => b.date.localeCompare(a.date)) };
    }, () => http.get(`/customers/${customerId}/account`)),
};
