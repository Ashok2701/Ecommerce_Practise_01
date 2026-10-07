'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search, MapPin, Phone, ChevronRight, AlertTriangle } from 'lucide-react';
import { customerService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useCart } from '@/lib/cart/CartProvider';
import { fmtDate, fmtMoney } from '@/lib/format';
import { PageHeader, QueryView, EmptyState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Input } from '@/components/ui/input';
import { OrderContextBar } from '@/features/orders/OrderContextBar';
import { toast } from 'sonner';

function NewOrderInner() {
  const user = useUser();
  const cart = useCart();
  const router = useRouter();
  const pre = useSearchParams().get('customer');
  const [search, setSearch] = useState('');
  const q = useQuery({ queryKey: ['customers', user.id], queryFn: () => customerService.getCustomers({ salesRepId: user.id }) });
  const choose = (id: string, name: string) => {
    if (cart.customerId && cart.customerId !== id && cart.items.length) toast.info('Cart cleared – prices are customer-specific.');
    cart.setCustomer(id);
    toast.success(`Ordering for ${name}`);
    router.push('/catalog');
  };
  useEffect(() => { if (pre && q.data) { const c = q.data.find((x) => x.id === pre); if (c) choose(c.id, c.name); } }, [pre, q.data]); // eslint-disable-line
  const s = search.toLowerCase();
  return (
    <div>
      <OrderContextBar step="customer" />
      <PageHeader title="Create order" description="Select the customer you are ordering for. Their price list, offers and credit apply automatically." />
      <div className="relative mb-4 max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search customers" data-testid="select-customer-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer, code or city…" className="h-11 bg-card pl-9" /></div>
      <QueryView query={q}>
        {(list) => {
          const rows = list.filter((c) => !s || [c.name, c.code, c.address.city].some((v) => v.toLowerCase().includes(s)));
          if (!rows.length) return <EmptyState />;
          return (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((c) => (
                <li key={c.id}>
                  <button disabled={c.status === 'inactive'} onClick={() => choose(c.id, c.name)} data-testid={`select-customer-${c.code}`} className="flex w-full items-start gap-3 rounded-lg border bg-card p-4 text-left transition hover:border-primary/50 hover:shadow-sm active:bg-muted/50 disabled:opacity-50">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><span className="truncate font-semibold">{c.name}</span>{c.status !== 'active' && <StatusBadge status={c.status} />}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{c.code} · Tier {c.priceTier}</div>
                      <div className="mt-2 space-y-0.5 text-xs text-muted-foreground"><div className="flex items-center gap-1.5"><MapPin className="h-3 w-3" />{c.address.city}</div><div className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{c.contactName} · {c.phone}</div></div>
                      <div className="mt-3 flex items-center justify-between text-xs"><span className="text-muted-foreground">Last order {fmtDate(c.lastOrderDate)}</span><span className={c.outstanding > c.creditLimit * 0.8 ? 'flex items-center gap-1 font-medium text-rose-600' : 'text-muted-foreground'}>{c.outstanding > c.creditLimit * 0.8 && <AlertTriangle className="h-3 w-3" />}O/S {fmtMoney(c.outstanding)}</span></div>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          );
        }}
      </QueryView>
    </div>
  );
}

export default function NewOrderPage() { return <Suspense><NewOrderInner /></Suspense>; }
