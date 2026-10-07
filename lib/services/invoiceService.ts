import { source, http } from '@/lib/api/httpClient';
import { getDb } from '@/lib/data/mockDb';
import type { Invoice, Payment } from '@/types/domain';

export interface AccountSummary { creditLimit: number; outstanding: number; available: number; overdue: number; dueSoon: number; invoices: Invoice[]; payments: Payment[]; paymentTerms: string; }

export const invoiceService = {
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
