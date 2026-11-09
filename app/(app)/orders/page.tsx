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
import { isCustomerRole } from '@/types/domain';
import type { Order } from '@/types/domain';

const TABS = ['all', 'open', 'confirmed', 'processing', 'dispatched', 'delivered', 'cancelled'].map((key) => ({ key }));

function OrdersInner() {
  const { t } = useT();
  const user = useUser();
  const ui = useUI();
  const router = useRouter();
  const qc = useQueryClient();
  const reorder = useReorder();
  const [tab, setTab] = useState(useSearchParams().get('status') ?? 'all');
  const [search, setSearch] = useState('');
  const scope = isCustomerRole(user.role) ? { customerId: user.customerId } : user.role === 'SALES_REP' ? { salesRepId: user.id } : {};
  const q = useQuery({ queryKey: ['orders', scope], queryFn: () => orderService.getOrders(scope) });
  const all = q.data ?? [];
  const open = ['confirmed', 'processing', 'packed', 'dispatched'];
  const s = search.toLowerCase();
  const rows = all.filter((o) => (tab === 'all' || (tab === 'open' ? open.includes(o.status) : o.status === tab)) && (!s || [o.number, o.customerName, o.poNumber ?? '', ...o.lines.map((l) => l.name)].some((v) => v.toLowerCase().includes(s))));
  const count = (k: string) => (k === 'all' ? all.length : k === 'open' ? all.filter((o) => open.includes(o.status)).length : all.filter((o) => o.status === k).length);
  const showCustomer = !isCustomerRole(user.role);
  const canOrder = isCustomerRole(user.role) || user.role === 'SALES_REP';

  return (
    <div>
      <PageHeader title={t('nav.orders')} description={isCustomerRole(user.role) ? t('ordersList.introCustomer') : user.role === 'SALES_REP' ? t('ordersList.introRep') : t('ordersList.introStaff')}
        actions={canOrder ? <Button asChild><Link href={user.role === 'SALES_REP' ? '/orders/new' : '/catalog'}><PlusCircle className="me-2 h-4 w-4" aria-hidden="true" />{t('nav.newOrder')}</Link></Button> : undefined} />
      <div className="mb-4 flex flex-col gap-3">
        <div className="relative max-w-md"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input aria-label={t('ordersList.search')} data-testid="orders-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('ordersList.searchPlaceholder')} className="h-10 bg-card ps-9" /></div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none" role="tablist">
          {TABS.map((x) => (
            <button key={x.key} role="tab" aria-selected={tab === x.key} onClick={() => setTab(x.key)} data-testid={`orders-tab-${x.key}`} className={cn('shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium', tab === x.key ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}>
              {x.key === 'all' ? t('common.all') : t(`status.${x.key}`)} <span className="ms-1 tabular opacity-70">{count(x.key)}</span>
            </button>
          ))}
        </div>
      </div>
      <QueryView query={q}>
        {() => (
          <DataTable<Order> testId="orders-table" rows={rows} rowKey={(o) => o.id} onRowClick={(o) => router.push(`/orders/${o.id}`)} empty={<EmptyState title={t('ordersList.empty')} />}
            columns={[
              { key: 'n', header: t('ordersList.col.order'), cell: (o) => <div><div className="font-mono text-xs font-semibold">{o.number}{o.site && <span className="ms-2 rounded bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground" title={t('sites.label')}>{o.site}</span>}</div>{o.poNumber && <div className="text-[11px] text-muted-foreground">{o.poNumber}</div>}</div> },
              { key: 'd', header: t('common.date'), cell: (o) => fmtDate(o.date), className: 'whitespace-nowrap' },
              ...(showCustomer ? [{ key: 'c', header: t('common.customer'), cell: (o: Order) => <div><div className="font-medium">{o.customerName}</div><div className="text-[11px] text-muted-foreground">{t('managerDash.by', { name: o.createdBy.name })}</div></div> }] : []),
              { key: 'i', header: t('orders.detail.items'), cell: (o) => o.lines.length, align: 'center' },
              { key: 'a', header: t('common.amount'), cell: (o) => <span className="font-medium">{fmtMoney(o.total)}</span>, align: 'right' },
              { key: 's', header: t('common.status'), cell: (o) => <StatusBadge status={o.status} /> },
              { key: 'e', header: t('orders.detail.expected'), cell: (o) => (o.status === 'pending_sync' ? '—' : fmtDate(o.expectedDelivery)), className: 'whitespace-nowrap text-muted-foreground' },
              ...(canOrder ? [{ key: 'r', header: '', cell: (o: Order) => <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); reorder(o); }} aria-label={t('customerDash.reorder', { number: o.number })}><RotateCcw className="h-4 w-4" /></Button> }] : []),
            ]}
            mobileCard={(o) => (
              <div>
                <div className="flex items-start justify-between gap-2"><div><div className="font-mono text-xs font-semibold">{o.number}</div><div className="text-xs text-muted-foreground">{fmtDate(o.date)} · {t('customerDash.items', { count: o.lines.length })}</div></div><StatusBadge status={o.status} /></div>
                {showCustomer && <div className="mt-2 text-sm font-medium">{o.customerName}</div>}
                <div className="mt-2 flex items-center justify-between"><span className="text-xs text-muted-foreground">{t('ordersList.eta')} {o.status === 'pending_sync' ? t('orders.detail.afterSync') : fmtDate(o.expectedDelivery)}</span><span className="font-semibold tabular">{fmtMoney(o.total)}</span></div>
              </div>
            )}
          />
        )}
      </QueryView>
    </div>
  );
}

export default function OrdersPage() { return <Suspense><OrdersInner /></Suspense>; }
