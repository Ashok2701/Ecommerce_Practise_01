'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search, MapPin, PlusCircle, Phone } from 'lucide-react';
import { customerService, userService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useCart } from '@/lib/cart/CartProvider';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings';
import { fmtDate, fmtMoney } from '@/lib/format';
import { PageHeader, QueryView, DataTable } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Customer } from '@/types/domain';

export default function CustomersPage() {
  const { t } = useT();
  const settings = useSettings();
  const user = useUser();
  const router = useRouter();
  const cart = useCart();
  const isRep = user.role === 'SALES_REP';
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [rep, setRep] = useState('all');
  const q = useQuery({ queryKey: ['customers', isRep ? user.id : 'all'], queryFn: () => customerService.getCustomers(isRep ? { salesRepId: user.id } : {}) });
  const reps = useQuery({ queryKey: ['reps'], queryFn: userService.getSalesReps, enabled: !isRep });
  const repName = (id: string) => reps.data?.find((r) => r.id === id)?.name ?? '—';
  const s = search.toLowerCase();
  const rows = (q.data ?? []).filter((c) => (!s || [c.name, c.code, c.contactName, c.address.city].some((v) => v.toLowerCase().includes(s))) && (status === 'all' || c.status === status) && (rep === 'all' || c.salesRepId === rep));
  const order = (c: Customer) => { cart.setCustomer(c.id); router.push('/catalog'); };

  return (
    <div>
      <PageHeader title={isRep ? t('nav.myCustomers') : t('nav.customers')} description={isRep ? t('customersList.assigned', { count: q.data?.length ?? 0 }) : t('customersList.intro', { erp: settings.erpName })} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1 sm:max-w-sm"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input aria-label={t('newOrder.searchLabel')} data-testid="customers-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('customersList.searchPlaceholder')} className="h-10 bg-card ps-9" /></div>
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="h-10 bg-card sm:w-40" aria-label={t('customersList.statusFilter')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('customersList.allStatuses')}</SelectItem><SelectItem value="active">{t('status.active')}</SelectItem><SelectItem value="on_hold">{t('status.on_hold')}</SelectItem><SelectItem value="inactive">{t('status.inactive')}</SelectItem></SelectContent></Select>
        {!isRep && <Select value={rep} onValueChange={setRep}><SelectTrigger className="h-10 bg-card sm:w-48" aria-label={t('customersList.repFilter')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('customersList.allReps')}</SelectItem>{reps.data?.filter((r) => r.status === 'active').map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent></Select>}
      </div>
      <QueryView query={q}>
        {() => (
          <DataTable<Customer> testId="customers-table" rows={rows} rowKey={(c) => c.id} onRowClick={(c) => router.push(`/customers/${c.id}`)}
            columns={[
              { key: 'code', header: t('customersList.col.code'), cell: (c) => <span className="font-mono text-xs">{c.code}</span> },
              { key: 'name', header: t('customersList.col.company'), cell: (c) => <div><div className="font-medium">{c.name}</div><div className="text-[11px] text-muted-foreground">{t('newOrder.tier', { tier: c.priceTier })} · {c.paymentTerms}</div></div> },
              { key: 'contact', header: t('customersList.col.contact'), cell: (c) => <div><div>{c.contactName}</div><div className="text-[11px] text-muted-foreground">{c.phone}</div></div> },
              { key: 'loc', header: t('customersList.col.location'), cell: (c) => `${c.address.city}, ${c.address.state}` },
              { key: 'status', header: t('common.status'), cell: (c) => <StatusBadge status={c.status} /> },
              ...(!isRep ? [{ key: 'rep', header: t('customers.detail.salesRep'), cell: (c: Customer) => repName(c.salesRepId) }] : []),
              { key: 'os', header: t('customersList.col.outstanding'), cell: (c) => <span className={c.outstanding > c.creditLimit * 0.8 ? 'font-medium text-rose-600' : ''}>{fmtMoney(c.outstanding)}</span>, align: 'right' },
              { key: 'last', header: t('customers.detail.lastOrder'), cell: (c) => <div className="text-end"><div>{fmtDate(c.lastOrderDate)}</div><div className="text-[11px] text-muted-foreground">{c.lastOrderAmount ? fmtMoney(c.lastOrderAmount) : ''}</div></div>, align: 'right' },
              ...(isRep ? [{ key: 'act', header: '', cell: (c: Customer) => <Button size="sm" disabled={c.status === 'inactive'} onClick={(e) => { e.stopPropagation(); order(c); }}><PlusCircle className="me-1 h-3.5 w-3.5" aria-hidden="true" />{t('salesDash.order')}</Button> }] : []),
            ]}
            mobileCard={(c) => (
              <div>
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="font-semibold">{c.name}</div><div className="font-mono text-[11px] text-muted-foreground">{c.code}</div></div><StatusBadge status={c.status} /></div>
                <div className="mt-2 space-y-0.5 text-xs text-muted-foreground"><div className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{c.contactName}</div><div className="flex items-center gap-1.5"><MapPin className="h-3 w-3" />{c.address.city}</div></div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-md bg-muted/60 p-2"><div className="text-muted-foreground">{t('customers.detail.lastOrder')}</div><div className="font-medium">{fmtDate(c.lastOrderDate)} · {c.lastOrderAmount ? fmtMoney(c.lastOrderAmount) : '—'}</div></div><div className="rounded-md bg-muted/60 p-2"><div className="text-muted-foreground">{t('customersList.col.outstanding')}</div><div className={c.outstanding > c.creditLimit * 0.8 ? 'font-medium text-rose-600' : 'font-medium'}>{fmtMoney(c.outstanding)}</div></div></div>
                {isRep && <Button className="mt-3 h-11 w-full" disabled={c.status === 'inactive'} onClick={(e) => { e.stopPropagation(); order(c); }} data-testid={`quick-order-${c.code}`}><PlusCircle className="me-2 h-4 w-4" aria-hidden="true" />{t('customers.detail.createOrder')}</Button>}
              </div>
            )}
          />
        )}
      </QueryView>
    </div>
  );
}
