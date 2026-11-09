'use client';
import Link from 'next/link';
import { OfferBadge, offerTitle } from '@/features/offers/OfferBits';
import { useQuery } from '@tanstack/react-query';
import { Wallet, CreditCard, Package, RotateCcw, Megaphone, BadgePercent, Boxes, ArrowRight, TrendingUp, Star } from 'lucide-react';
import { dashboardService, announcementService, offerService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useAccess } from '@/lib/auth/permissions';
import { useT } from '@/lib/i18n';
import { fmtMoney, fmtDate } from '@/lib/format';
import { PageHeader, KpiCard, SectionCard, LoadingState, QueryView, EmptyState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useReorder } from '@/features/orders/useReorder';
import { WorkQueue } from './WorkQueue';

/** Home for business (B2B) and retail (B2C) customers. Retail accounts pay up front, so credit is hidden. */
export function CustomerDashboard() {
  const { t, locale } = useT();
  const user = useUser();
  const access = useAccess(user.role);
  const reorder = useReorder();
  const q = useQuery({ queryKey: ['dash', 'customer', user.customerId], queryFn: () => dashboardService.getCustomerDashboard(user.customerId!) });
  const ann = useQuery({ queryKey: ['announcements', user.role], queryFn: () => announcementService.list(user.role), enabled: access.can('announcements') });
  const offers = useQuery({ queryKey: ['offers', user.customerId], queryFn: () => offerService.list({ forCustomerId: user.customerId }), enabled: !!q.data && access.can('offers') });
  return (
    <QueryView query={q} loading={<LoadingState variant="kpis" />}>
      {(d) => {
        const retail = d.customer.type === 'B2C';
        const usedPct = d.creditLimit ? Math.round((d.outstanding / d.creditLimit) * 100) : 0;
        const viewAll = (href: string) => <Link href={href} className="text-xs font-medium text-primary">{t('common.viewAll')}</Link>;
        return (
          <div>
            <PageHeader eyebrow={retail ? d.customer.name : `${d.customer.name} · ${d.customer.code}`} title={t('dashboard.customer', { name: user.name.split(' ')[0] })}
              description={retail ? t('customerDash.retail') : t('customerDash.tierTerms', { tier: d.customer.priceTier, terms: d.customer.paymentTerms })}
              actions={<>
                {access.can('catalog') && <Button asChild variant="outline"><Link href="/catalog"><Boxes className="me-2 h-4 w-4" aria-hidden="true" />{t('customerDash.browseCatalog')}</Link></Button>}
                {d.lastDelivered && <Button onClick={() => reorder(d.lastDelivered!)} data-testid="quick-reorder"><RotateCcw className="me-2 h-4 w-4" aria-hidden="true" />{t('customerDash.reorderLast')}</Button>}
              </>} />

            <div className={retail ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-2 gap-3 lg:grid-cols-4'}>
              {!retail && <KpiCard testId="kpi-outstanding" label={t('customerDash.outstanding')} value={fmtMoney(d.outstanding)} icon={Wallet} tone={d.overdue ? 'danger' : 'default'}
                hint={d.overdue ? <span className="text-destructive">{t('customerDash.overdue', { amount: fmtMoney(d.overdue) })}</span> : t('customerDash.noOverdue')} />}
              {!retail && <KpiCard label={t('customerDash.availableCredit')} value={fmtMoney(d.available)} icon={CreditCard} tone="success" hint={t('customerDash.ofLimit', { amount: fmtMoney(d.creditLimit) })} />}
              <KpiCard label={t('customerDash.openOrders')} value={d.pendingOrders} icon={Package} hint={t('customerDash.inProgress')} />
              <KpiCard label={t('customerDash.purchases12m')} value={fmtMoney(d.ytd)} icon={TrendingUp} />
            </div>
            {!retail && d.creditLimit > 0 && (
              <div className="mt-3">
                <Progress value={Math.min(100, usedPct)} className="h-1.5" aria-label={t('customerDash.creditUsed', { pct: usedPct })} />
                <p className="mt-1 text-xs text-muted-foreground">{t('customerDash.creditUsed', { pct: usedPct })}</p>
              </div>
            )}

            <WorkQueue className="mt-4" hideWhenClear />

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <SectionCard title={t('customerDash.recentOrders')} className={access.can('offers') ? 'lg:col-span-2' : 'lg:col-span-3'} action={viewAll('/orders')}>
                {d.recentOrders.length ? (
                  <ul className="divide-y">{d.recentOrders.map((o) => (
                    <li key={o.id} className="flex items-center gap-3 px-4 py-3">
                      <Link href={`/orders/${o.id}`} className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-medium">{o.number}</span><StatusBadge status={o.status} /></div>
                        <div className="text-xs text-muted-foreground">{t('customerDash.orderMeta', { date: fmtDate(o.date), items: t('customerDash.items', { count: o.lines.length }), eta: fmtDate(o.expectedDelivery) })}</div>
                      </Link>
                      <span className="hidden text-sm font-medium tabular sm:block">{fmtMoney(o.total)}</span>
                      <Button variant="ghost" size="sm" onClick={() => reorder(o)} aria-label={t('customerDash.reorder', { number: o.number })}><RotateCcw className="h-4 w-4" aria-hidden="true" /></Button>
                    </li>
                  ))}</ul>
                ) : <div className="p-4"><EmptyState icon={Package} title={t('customerDash.noOrders')} description={t('customerDash.noOrdersHint')} /></div>}
              </SectionCard>
              {access.can('offers') && (
                <SectionCard title={<span className="flex items-center gap-2"><BadgePercent className="h-4 w-4 text-primary" aria-hidden="true" />{t('customerDash.offersForYou')}</span>} action={viewAll('/offers')}>
                  {(offers.data ?? []).length ? (
                    <ul className="divide-y">{(offers.data ?? []).slice(0, 3).map((o) => (
                      <li key={o.id}><Link href={`/offers/${o.id}`} className="block px-4 py-3 hover:bg-muted/40" data-testid={`dash-offer-${o.id}`}>
                        <div className="flex items-start justify-between gap-2"><span className="text-sm font-medium">{offerTitle(o, locale)}</span>{o.presentation.featured && <Star className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label={t('offers.featured')} />}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2"><OfferBadge offer={o} /><span className="text-xs text-muted-foreground">{t('customerDash.validUntil', { date: fmtDate(o.validTo) })}</span></div>
                      </Link></li>
                    ))}</ul>
                  ) : <p className="px-4 py-6 text-sm text-muted-foreground">{t('customerDash.noOffers')}</p>}
                </SectionCard>
              )}
            </div>

            {access.can('announcements') && !!ann.data?.length && (
              <div className="mt-4">
                <SectionCard title={<span className="flex items-center gap-2"><Megaphone className="h-4 w-4 text-primary" aria-hidden="true" />{t('nav.announcements')}</span>} action={viewAll('/announcements')}>
                  <div className="grid divide-y md:grid-cols-3 md:divide-x md:divide-y-0 rtl:md:divide-x-reverse">{ann.data.slice(0, 3).map((a) => (
                    <Link key={a.id} href="/announcements" className="group p-4 hover:bg-muted/40">
                      <div className="text-[11px] text-muted-foreground">{fmtDate(a.publishAt)}</div>
                      <div className="mt-1 text-sm font-medium">{a.title}</div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.body}</p>
                      <span className="mt-2 inline-flex items-center text-xs font-medium text-primary">{t('customerDash.read')}<ArrowRight className="ms-1 h-3 w-3 rtl:rotate-180" aria-hidden="true" /></span>
                    </Link>
                  ))}</div>
                </SectionCard>
              </div>
            )}
          </div>
        );
      }}
    </QueryView>
  );
}
