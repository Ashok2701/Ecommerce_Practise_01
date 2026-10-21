'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, FileInput, PackageOpen, Truck, Warehouse } from 'lucide-react';
import { inventoryService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useAccess } from '@/lib/auth/permissions';
import { useSite } from '@/lib/sites/SiteProvider';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtDateTime, fmtNumber } from '@/lib/format';
import { QueryView, LoadingState, SectionCard, KpiCard } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ProductImage } from '@/components/common/ProductBits';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackLink, RefLink } from '@/features/detail/DetailBits';
import { cn } from '@/lib/utils';

/** One product's stock at the current site: what makes up each number, other sites and recent movements. */
export default function ProductStockPage() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const { site } = useSite();
  const user = useUser();
  const { can } = useAccess(user.role);
  const q = useQuery({ queryKey: ['inventory-detail', id, site], queryFn: () => inventoryService.detail(id) });
  const mv = useQuery({ queryKey: ['inventory-movements', id, site], queryFn: () => inventoryService.movements(id) });
  return (
    <div>
      <BackLink href="/inventory" label={t('inventory.title')} />
      <QueryView query={q} loading={<LoadingState variant="detail" />}>
        {({ position: p, detail: d }) => (
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4">
                  <ProductImage src={p.product.image} alt="" className="h-16 w-16 shrink-0 rounded-md" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold tracking-tight" data-testid="stock-product">{p.product.name}</h1>{p.low && <StatusBadge status="low_stock" />}</div>
                    <p className="mt-0.5 text-sm text-muted-foreground"><span className="font-mono">{p.product.sku}</span> · {p.product.brand} · {p.product.category} · {t('inventory.detail.leadTime', { days: p.product.leadTimeDays })}</p>
                    <p className="mt-1 text-sm">{t('inventory.detail.atSite', { site: site ?? '' })}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {can('transfers') && <Button variant="outline" asChild><Link href={`/transfers/new?product=${p.product.id}`}><ArrowLeftRight className="me-2 h-4 w-4" aria-hidden="true" />{t('inventory.detail.requestTransfer')}</Link></Button>}
                  {can('purchase_requests') && <Button variant="outline" asChild><Link href="/purchase-requests/new"><FileInput className="me-2 h-4 w-4" aria-hidden="true" />{t('purchaseRequests.new')}</Link></Button>}
                </div>
              </div>
            </Card>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <KpiCard label={t('inventory.col.onHand')} value={fmtNumber(p.onHand)} icon={Warehouse} />
              <KpiCard label={t('inventory.kpi.reserved')} value={fmtNumber(p.allocated + p.held)} hint={t('inventory.kpi.reservedHint', { held: fmtNumber(p.held) })} icon={Warehouse} />
              <KpiCard testId="stock-available" label={t('inventory.col.available')} value={fmtNumber(p.available)} icon={Warehouse} tone={p.low ? 'warning' : 'success'} />
              <KpiCard label={t('inventory.col.incoming')} value={fmtNumber(p.incoming)} icon={Truck} />
              <KpiCard label={t('inventory.col.consignment')} value={fmtNumber(p.consignment)} icon={PackageOpen} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
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
            </div>
            <SectionCard title={t('inventory.detail.otherSites')}>
              <ul className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">{d.otherSites.map((o) => (
                <li key={o.site} className="flex items-center justify-between gap-2 px-4 py-3 text-sm"><span className="font-mono">{o.site}</span><span className={cn('font-semibold tabular', !o.available && 'text-muted-foreground')}>{fmtNumber(o.available)}</span></li>
              ))}</ul>
            </SectionCard>
            <SectionCard title={t('inventory.detail.movements')}>
              {mv.data?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm" data-testid="stock-movements">
                    <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
                      <th className="px-4 py-2 text-start font-medium">{t('common.date')}</th><th className="px-3 py-2 text-start font-medium">{t('inventory.detail.movement')}</th>
                      <th className="px-3 py-2 text-start font-medium">{t('inventory.detail.document')}</th><th className="px-4 py-2 text-end font-medium">{t('requests.detail.qty')}</th>
                    </tr></thead>
                    <tbody className="divide-y">{mv.data.map((m, k) => (
                      <tr key={k}>
                        <td className="px-4 py-2 text-muted-foreground">{fmtDateTime(m.at)}</td>
                        <td className="px-3 py-2">{t(`inventory.move.${m.kind}`)}<div className="text-xs text-muted-foreground">{m.party}</div></td>
                        <td className="px-3 py-2"><RefLink href={m.href} className="font-mono text-xs">{m.ref}</RefLink></td>
                        <td className={cn('px-4 py-2 text-end font-semibold tabular', m.quantity > 0 ? 'text-emerald-700 dark:text-emerald-400' : '')}>{m.quantity > 0 ? '+' : '−'}{fmtNumber(Math.abs(m.quantity))}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <p className="p-4 text-sm text-muted-foreground">{t('inventory.detail.noMovements')}</p>}
            </SectionCard>
          </div>
        )}
      </QueryView>
    </div>
  );
}

function Block({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  const { t } = useT();
  return (
    <SectionCard title={title}>
      {empty ? <p className="p-4 text-sm text-muted-foreground">{t('inventory.detail.none')}</p> : <ul className="divide-y">{children}</ul>}
    </SectionCard>
  );
}

function Row({ left, sub, right, href, badge }: { left: string; sub?: string; right: string; href: string; badge?: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <div className="min-w-0"><RefLink href={href} className="font-medium">{left}</RefLink>{sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}</div>
      <div className="flex shrink-0 items-center gap-2">{badge}<span className="font-semibold tabular">{right}</span></div>
    </li>
  );
}
