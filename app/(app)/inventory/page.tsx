'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeftRight, Lock, PackageOpen, Search, Truck } from 'lucide-react';
import { inventoryService, type StockFilter } from '@/lib/services';
import { useSite } from '@/lib/sites/SiteProvider';
import { useT } from '@/lib/i18n';
import { fmtNumber } from '@/lib/format';
import { PageHeader, QueryView, EmptyState, KpiCard, LoadingState } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { StockPosition } from '@/types/domain';

const FILTERS: StockFilter[] = ['all', 'low', 'reserved', 'incoming', 'consignment'];

/** Stock per product at the current site: on hand, reserved, available, incoming and consignment. */
export default function InventoryPage() {
  const { t } = useT();
  const { site } = useSite();
  const all = useQuery({ queryKey: ['inventory', site], queryFn: () => inventoryService.positions() });
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [filter, setFilter] = useState<StockFilter>('all');
  const router = useRouter();
  const rows = all.data ?? [];
  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.product.category))).sort(), [rows]);
  const match = (r: StockPosition, f: StockFilter) => f === 'all' || (f === 'low' ? r.low : f === 'reserved' ? r.allocated + r.held > 0 : f === 'incoming' ? r.incoming > 0 : r.consignment > 0);
  const s = search.trim().toLowerCase();
  const base = rows.filter((r) => (category === 'all' || r.product.category === category) && (!s || [r.product.name, r.product.sku, r.product.brand].some((v) => v.toLowerCase().includes(s))));
  const shown = base.filter((r) => match(r, filter));
  const sum = (k: keyof Pick<StockPosition, 'allocated' | 'held' | 'incoming' | 'consignment'>) => rows.reduce((a, r) => a + r[k], 0);

  return (
    <div>
      <PageHeader title={t('inventory.title')} description={t('inventory.intro', { site: site ?? '' })}
        actions={<Button asChild variant="outline"><Link href="/transfers/new"><ArrowLeftRight className="me-2 h-4 w-4" aria-hidden="true" />{t('transfers.new')}</Link></Button>} />
      {all.isLoading ? <LoadingState variant="kpis" /> : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard testId="inv-kpi-low" label={t('inventory.kpi.low')} value={rows.filter((r) => r.low).length} icon={AlertTriangle} tone="warning" onClick={() => setFilter('low')} />
          <KpiCard testId="inv-kpi-reserved" label={t('inventory.kpi.reserved')} value={fmtNumber(sum('allocated') + sum('held'))} hint={t('inventory.kpi.reservedHint', { held: fmtNumber(sum('held')) })} icon={Lock} onClick={() => setFilter('reserved')} />
          <KpiCard testId="inv-kpi-incoming" label={t('inventory.kpi.incoming')} value={fmtNumber(sum('incoming'))} icon={Truck} onClick={() => setFilter('incoming')} />
          <KpiCard testId="inv-kpi-consignment" label={t('inventory.kpi.consignment')} value={fmtNumber(sum('consignment'))} icon={PackageOpen} onClick={() => setFilter('consignment')} />
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('inventory.search')} aria-label={t('inventory.search')} className="h-10 ps-9" data-testid="inv-search" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-10 lg:w-56" aria-label={t('inventory.category')}><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">{t('inventory.allCategories')}</SelectItem>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label={t('inventory.filterLabel')}>
        {FILTERS.map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} data-testid={`inv-filter-${f}`}
            className={cn('rounded-md border px-3 py-1.5 text-xs font-medium', filter === f ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}>
            {t(`inventory.filter.${f}`)} <span className="ms-1 tabular opacity-70">{base.filter((r) => match(r, f)).length}</span>
          </button>
        ))}
      </div>

      <div className="mt-4">
        <QueryView query={all} loading={<LoadingState />}>
          {() => shown.length ? (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full min-w-[760px] text-sm" data-testid="inv-table">
                <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
                  <th className="px-4 py-2.5 text-start font-medium">{t('inventory.col.product')}</th>
                  {(['onHand', 'allocated', 'held', 'available', 'incoming', 'consignment'] as const).map((k) => <th key={k} className="px-3 py-2.5 text-end font-medium">{t(`inventory.col.${k}`)}</th>)}
                </tr></thead>
                <tbody className="divide-y">{shown.map((r) => (
                  <tr key={r.product.id} className="cursor-pointer hover:bg-muted/40" onClick={() => router.push(`/inventory/${r.product.id}`)} data-testid={`inv-row-${r.product.id}`}>
                    <td className="px-4 py-2.5">
                      <Link href={`/inventory/${r.product.id}`} className="font-medium hover:text-primary" onClick={(e) => e.stopPropagation()}>{r.product.name}</Link>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><span className="font-mono">{r.product.sku}</span>{r.low && <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400"><AlertTriangle className="h-3 w-3" aria-hidden="true" />{t('inventory.low')}</span>}</div>
                    </td>
                    <td className="px-3 py-2.5 text-end tabular">{fmtNumber(r.onHand)}</td>
                    <td className="px-3 py-2.5 text-end tabular text-muted-foreground">{r.allocated ? fmtNumber(r.allocated) : '—'}</td>
                    <td className="px-3 py-2.5 text-end tabular text-muted-foreground">{r.held ? fmtNumber(r.held) : '—'}</td>
                    <td className={cn('px-3 py-2.5 text-end font-semibold tabular', r.low && 'text-amber-700 dark:text-amber-400')} data-testid={`inv-avail-${r.product.id}`}>{fmtNumber(r.available)}</td>
                    <td className="px-3 py-2.5 text-end tabular text-muted-foreground">{r.incoming ? fmtNumber(r.incoming) : '—'}</td>
                    <td className="px-3 py-2.5 text-end tabular text-muted-foreground">{r.consignment ? fmtNumber(r.consignment) : '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <EmptyState title={t('inventory.empty')} />}
        </QueryView>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t('inventory.legend')}</p>
    </div>
  );
}
