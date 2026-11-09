import { source, http } from '@/lib/api/httpClient';
import { getDb } from '@/lib/data/mockDb';
import { appConfig } from '@/lib/config';
import type { Customer, CustomerStatus } from '@/types/domain';

export const customerService = {
  getCustomers: (q: { search?: string; status?: CustomerStatus | 'all'; salesRepId?: string } = {}) =>
    source<Customer[]>(() => {
      const s = q.search?.toLowerCase() ?? '';
      return getDb().customers.filter((c) =>
        (!s || [c.name, c.code, c.contactName, c.address.city].some((v) => v.toLowerCase().includes(s))) &&
        (!q.status || q.status === 'all' || c.status === q.status) && (!q.salesRepId || c.salesRepId === q.salesRepId));
    }, () => http.get('/customers', q)),
  getCustomer: (id: string) =>
    source<Customer>(() => { const c = getDb().customers.find((x) => x.id === id); if (!c) throw new Error('Customer not found'); return c; }, () => http.get(`/customers/${id}`)),
  /** Synchronous lookup for pricing in the cart (mock only; API mode uses cached query). */
  peek: (id?: string | null) => (id && appConfig.dataSource !== 'api' ? getDb().customers.find((c) => c.id === id) ?? null : null),
};
