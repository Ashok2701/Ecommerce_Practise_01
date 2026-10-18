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
import { fmtDate, fmtMoney } from '@/lib/format';
import { PageHeader, QueryView, DataTable } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Customer } from '@/types/domain';

export default function CustomersPage() {
  const { t } = useT();
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
      <PageHeader title={isRep ? t('nav.myCustomers') : 'B2B customers'} description={isRep ? `${q.data?.length ?? 0} customers assigned to you` : 'Business partners synchronised from Sage X3 (mock).'} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1 sm:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search customers" data-testid="customers-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Company, code, contact or city…" className="h-10 bg-card pl-9" /></div>
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="h-10 bg-card sm:w-40" aria-label="Status filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="on_hold">On hold</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select>
        {!isRep && <Select value={rep} onValueChange={setRep}><SelectTrigger className="h-10 bg-card sm:w-48" aria-label="Sales rep filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All sales reps</SelectItem>{reps.data?.filter((r) => r.status === 'active').map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent></Select>}
      </div>
      <QueryView query={q}>
        {() => (
          <DataTable<Customer> testId="customers-table" rows={rows} rowKey={(c) => c.id} onRowClick={(c) => router.push(`/customers/${c.id}`)}
            columns={[
              { key: 'code', header: 'Code', cell: (c) => <span className="font-mono text-xs">{c.code}</span> },
              { key: 'name', header: 'Company', cell: (c) => <div><div className="font-medium">{c.name}</div><div className="text-[11px] text-muted-foreground">Tier {c.priceTier} · {c.paymentTerms}</div></div> },
              { key: 'contact', header: 'Contact', cell: (c) => <div><div>{c.contactName}</div><div className="text-[11px] text-muted-foreground">{c.phone}</div></div> },
              { key: 'loc', header: 'Location', cell: (c) => `${c.address.city}, ${c.address.state}` },
              { key: 'status', header: t('common.status'), cell: (c) => <StatusBadge status={c.status} /> },
              ...(!isRep ? [{ key: 'rep', header: 'Sales rep', cell: (c: Customer) => repName(c.salesRepId) }] : []),
              { key: 'os', header: 'Outstanding', cell: (c) => <span className={c.outstanding > c.creditLimit * 0.8 ? 'font-medium text-rose-600' : ''}>{fmtMoney(c.outstanding)}</span>, align: 'right' },
              { key: 'last', header: 'Last order', cell: (c) => <div className="text-right"><div>{fmtDate(c.lastOrderDate)}</div><div className="text-[11px] text-muted-foreground">{c.lastOrderAmount ? fmtMoney(c.lastOrderAmount) : ''}</div></div>, align: 'right' },
              ...(isRep ? [{ key: 'act', header: '', cell: (c: Customer) => <Button size="sm" disabled={c.status === 'inactive'} onClick={(e) => { e.stopPropagation(); order(c); }}><PlusCircle className="mr-1 h-3.5 w-3.5" />Order</Button> }] : []),
            ]}
            mobileCard={(c) => (
              <div>
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="font-semibold">{c.name}</div><div className="font-mono text-[11px] text-muted-foreground">{c.code}</div></div><StatusBadge status={c.status} /></div>
                <div className="mt-2 space-y-0.5 text-xs text-muted-foreground"><div className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{c.contactName}</div><div className="flex items-center gap-1.5"><MapPin className="h-3 w-3" />{c.address.city}</div></div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-md bg-muted/60 p-2"><div className="text-muted-foreground">Last order</div><div className="font-medium">{fmtDate(c.lastOrderDate)} · {c.lastOrderAmount ? fmtMoney(c.lastOrderAmount) : '—'}</div></div><div className="rounded-md bg-muted/60 p-2"><div className="text-muted-foreground">Outstanding</div><div className={c.outstanding > c.creditLimit * 0.8 ? 'font-medium text-rose-600' : 'font-medium'}>{fmtMoney(c.outstanding)}</div></div></div>
                {isRep && <Button className="mt-3 h-11 w-full" disabled={c.status === 'inactive'} onClick={(e) => { e.stopPropagation(); order(c); }} data-testid={`quick-order-${c.code}`}><PlusCircle className="mr-2 h-4 w-4" />Create order</Button>}
              </div>
            )}
          />
        )}
      </QueryView>
    </div>
  );
}
