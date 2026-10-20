'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeftRight, Lock, PackageOpen, Search, Truck } from 'lucide-react';
import { inventoryService, type StockFilter } from '@/lib/services';
import { useSite } from '@/lib/sites/SiteProvider';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtNumber } from '@/lib/format';
import { PageHeader, QueryView, EmptyState, KpiCard, LoadingState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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
  const [openId, setOpenId] = useState<string | null>(null);
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
                  <tr key={r.product.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setOpenId(r.product.id)} data-testid={`inv-row-${r.product.id}`}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{r.product.name}</div>
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
      <StockSheet productId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function StockSheet({ productId, onClose }: { productId: string | null; onClose: () => void }) {
  const { t } = useT();
  const { site } = useSite();
  const q = useQuery({ queryKey: ['inventory-detail', productId, site], queryFn: () => inventoryService.detail(productId!), enabled: !!productId });
  return (
    <Sheet open={!!productId} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md" data-testid="inv-sheet">
        {q.data ? (() => {
          const { position: p, detail: d } = q.data;
          return (
            <>
              <SheetHeader className="text-start"><SheetTitle>{p.product.name}</SheetTitle><SheetDescription className="font-mono text-xs">{p.product.sku} · {t('sites.label')} {site}</SheetDescription></SheetHeader>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                {([['onHand', p.onHand], ['available', p.available], ['incoming', p.incoming]] as const).map(([k, v]) => (
                  <div key={k} className="rounded-md border p-2"><dt className="text-[11px] text-muted-foreground">{t(`inventory.col.${k}`)}</dt><dd className="text-lg font-semibold tabular">{fmtNumber(v)}</dd></div>
                ))}
              </dl>
              <Block title={t('inventory.detail.allocated')} empty={!d.allocated.length}>
                {d.allocated.map((a) => <Row key={a.orderId} href={`/orders/${a.orderId}`} left={a.number} sub={a.customerName} right={fmtNumber(a.quantity)} badge={<StatusBadge status={a.status} />} />)}
              </Block>
              <Block title={t('inventory.detail.held')} empty={!d.held.length}>
                {d.held.map((h) => <Row key={h.requestId} href={`/requests/${h.requestId}`} left={h.number} sub={`${h.customerName} · ${t('inventory.detail.until', { date: fmtDate(h.until) })}`} right={fmtNumber(h.quantity)} />)}
              </Block>
              <Block title={t('inventory.detail.incoming')} empty={!d.incoming.length}>
                {d.incoming.map((i) => <Row key={i.id} href={i.kind === 'po' ? `/purchase-orders/${i.id}` : `/transfers/${i.id}`} left={i.number} sub={`${i.kind === 'po' ? i.from : t('inventory.detail.fromSite', { site: i.from })}${i.expected ? ` · ${fmtDate(i.expected)}` : ''}`} right={fmtNumber(i.quantity)} badge={<StatusBadge status={i.status} />} />)}
              </Block>
              <Block title={t('inventory.detail.consignment')} empty={!d.consignment.length}>
                {d.consignment.map((c) => <Row key={c.id} href={`/consignment/${c.id}`} left={c.customerName} sub={`${c.number} · ${c.location}`} right={fmtNumber(c.quantity)} />)}
              </Block>
              <Block title={t('inventory.detail.otherSites')} empty={!d.otherSites.length}>
                {d.otherSites.map((o) => <Row key={o.site} left={o.site} right={fmtNumber(o.available)} />)}
              </Block>
              <Button asChild className="mt-5 w-full" data-testid="inv-transfer"><Link href={`/transfers/new?product=${p.product.id}`}><ArrowLeftRight className="me-2 h-4 w-4" aria-hidden="true" />{t('inventory.detail.requestTransfer')}</Link></Button>
            </>
          );
        })() : <LoadingState variant="detail" />}
      </SheetContent>
    </Sheet>
  );
}

function Block({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  const { t } = useT();
  return (
    <section className="mt-5">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {empty ? <p className="text-sm text-muted-foreground">{t('inventory.detail.none')}</p> : <ul className="divide-y rounded-md border">{children}</ul>}
    </section>
  );
}

function Row({ left, sub, right, href, badge }: { left: string; sub?: string; right: string; href?: string; badge?: React.ReactNode }) {
  const body = (
    <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
      <div className="min-w-0"><div className="truncate font-medium">{left}</div>{sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}</div>
      <div className="flex shrink-0 items-center gap-2">{badge}<span className="font-semibold tabular">{right}</span></div>
    </div>
  );
  return <li>{href ? <Link href={href} className="block hover:bg-muted/40">{body}</Link> : body}</li>;
}
