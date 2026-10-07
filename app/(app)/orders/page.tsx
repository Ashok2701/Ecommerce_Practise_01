'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, CloudUpload, PlusCircle, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { orderService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useUI } from '@/lib/ui/UIProvider';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtMoney } from '@/lib/format';
import { PageHeader, QueryView, DataTable, EmptyState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useReorder } from '@/features/orders/useReorder';
import { cn } from '@/lib/utils';
import type { Order } from '@/types/domain';

const TABS = [
  { key: 'all', label: 'All' }, { key: 'open', label: 'Open' }, { key: 'pending_approval', label: 'Pending Approval' }, { key: 'pending_sync', label: 'Pending Sync' },
  { key: 'confirmed', label: 'Confirmed' }, { key: 'processing', label: 'Processing' }, { key: 'dispatched', label: 'Dispatched' }, { key: 'delivered', label: 'Delivered' }, { key: 'cancelled', label: 'Cancelled' },
];

function OrdersInner() {
  const { t } = useT();
  const user = useUser();
  const ui = useUI();
  const router = useRouter();
  const qc = useQueryClient();
  const reorder = useReorder();
  const [tab, setTab] = useState(useSearchParams().get('status') ?? 'all');
  const [search, setSearch] = useState('');
  const scope = user.role === 'customer' ? { customerId: user.customerId } : user.role === 'sales' ? { salesRepId: user.id } : {};
  const q = useQuery({ queryKey: ['orders', scope], queryFn: () => orderService.getOrders(scope) });
  const sync = useMutation({ mutationFn: orderService.syncPending, onSuccess: (n) => { qc.invalidateQueries(); toast.success(`${n} order(s) synced – now Pending Approval`); } });
  const all = q.data ?? [];
  const open = ['pending_sync', 'pending_approval', 'changes_requested', 'confirmed', 'processing', 'packed', 'dispatched'];
  const s = search.toLowerCase();
  const rows = all.filter((o) => (tab === 'all' || (tab === 'open' ? open.includes(o.status) : o.status === tab)) && (!s || [o.number, o.customerName, o.poNumber ?? '', ...o.lines.map((l) => l.name)].some((v) => v.toLowerCase().includes(s))));
  const pendingSync = all.filter((o) => o.status === 'pending_sync').length;
  const count = (k: string) => (k === 'all' ? all.length : k === 'open' ? all.filter((o) => open.includes(o.status)).length : all.filter((o) => o.status === k).length);
  const showCustomer = user.role !== 'customer';
  const canOrder = user.role === 'customer' || user.role === 'sales';

  return (
    <div>
      <PageHeader title={t('nav.orders')} description={user.role === 'customer' ? 'Track every order from submission to delivery.' : user.role === 'sales' ? 'Orders for your assigned customers.' : 'All customer orders across the platform.'}
        actions={canOrder ? <Button asChild><Link href={user.role === 'sales' ? '/orders/new' : '/catalog'}><PlusCircle className="mr-2 h-4 w-4" />New order</Link></Button> : undefined} />
      {pendingSync > 0 && (
        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-dashed border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center" data-testid="pending-sync-banner">
          <CloudUpload className="h-4 w-4 shrink-0" /><span className="flex-1">{t('offline.pending', { count: pendingSync })}. These are not yet confirmed.</span>
          <Button size="sm" variant="outline" className="bg-white" disabled={!ui.online || sync.isPending} onClick={() => sync.mutate()} data-testid="sync-now">{ui.online ? t('offline.syncNow') : 'Waiting for connection…'}</Button>
        </div>
      )}
      <div className="mb-4 flex flex-col gap-3">
        <div className="relative max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search orders" data-testid="orders-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order no., customer, PO or product…" className="h-10 bg-card pl-9" /></div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none" role="tablist">
          {TABS.filter((x) => x.key !== 'pending_sync' || pendingSync).map((x) => (
            <button key={x.key} role="tab" aria-selected={tab === x.key} onClick={() => setTab(x.key)} data-testid={`orders-tab-${x.key}`} className={cn('shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium', tab === x.key ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}>
              {x.label} <span className="ml-1 tabular opacity-70">{count(x.key)}</span>
            </button>
          ))}
        </div>
      </div>
      <QueryView query={q}>
        {() => (
          <DataTable<Order> testId="orders-table" rows={rows} rowKey={(o) => o.id} onRowClick={(o) => router.push(`/orders/${o.id}`)} empty={<EmptyState title="No orders found" />}
            columns={[
              { key: 'n', header: 'Order', cell: (o) => <div><div className="font-mono text-xs font-semibold">{o.number}</div>{o.poNumber && <div className="text-[11px] text-muted-foreground">{o.poNumber}</div>}</div> },
              { key: 'd', header: t('common.date'), cell: (o) => fmtDate(o.date), className: 'whitespace-nowrap' },
              ...(showCustomer ? [{ key: 'c', header: t('common.customer'), cell: (o: Order) => <div><div className="font-medium">{o.customerName}</div><div className="text-[11px] text-muted-foreground">by {o.createdBy.name}</div></div> }] : []),
              { key: 'i', header: 'Items', cell: (o) => o.lines.length, align: 'center' },
              { key: 'a', header: t('common.amount'), cell: (o) => <span className="font-medium">{fmtMoney(o.total)}</span>, align: 'right' },
              { key: 's', header: t('common.status'), cell: (o) => <StatusBadge status={o.status} /> },
              { key: 'e', header: 'Expected', cell: (o) => (o.status === 'pending_sync' ? '—' : fmtDate(o.expectedDelivery)), className: 'whitespace-nowrap text-muted-foreground' },
              ...(canOrder ? [{ key: 'r', header: '', cell: (o: Order) => <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); reorder(o); }} aria-label={`Repeat ${o.number}`}><RotateCcw className="h-4 w-4" /></Button> }] : []),
            ]}
            mobileCard={(o) => (
              <div>
                <div className="flex items-start justify-between gap-2"><div><div className="font-mono text-xs font-semibold">{o.number}</div><div className="text-xs text-muted-foreground">{fmtDate(o.date)} · {o.lines.length} items</div></div><StatusBadge status={o.status} /></div>
                {showCustomer && <div className="mt-2 text-sm font-medium">{o.customerName}</div>}
                <div className="mt-2 flex items-center justify-between"><span className="text-xs text-muted-foreground">ETA {o.status === 'pending_sync' ? 'after sync' : fmtDate(o.expectedDelivery)}</span><span className="font-semibold tabular">{fmtMoney(o.total)}</span></div>
              </div>
            )}
          />
        )}
      </QueryView>
    </div>
  );
}

export default function OrdersPage() { return <Suspense><OrdersInner /></Suspense>; }
