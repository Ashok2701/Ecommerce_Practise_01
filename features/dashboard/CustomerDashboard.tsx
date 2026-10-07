'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Wallet, CreditCard, Package, AlertTriangle, RotateCcw, Megaphone, BadgePercent, Boxes, ArrowRight, TrendingUp } from 'lucide-react';
import { dashboardService, announcementService, offerService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useT } from '@/lib/i18n';
import { fmtMoney, fmtDate } from '@/lib/format';
import { PageHeader, KpiCard, SectionCard, LoadingState, QueryView } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useReorder } from '@/features/orders/useReorder';

export function CustomerDashboard() {
  const { t } = useT();
  const user = useUser();
  const reorder = useReorder();
  const q = useQuery({ queryKey: ['dash', 'customer', user.customerId], queryFn: () => dashboardService.getCustomerDashboard(user.customerId!) });
  const ann = useQuery({ queryKey: ['announcements', 'customer'], queryFn: () => announcementService.list('customer') });
  const offers = useQuery({ queryKey: ['offers', 'cust', q.data?.customer.priceTier], queryFn: () => offerService.list({ tier: q.data?.customer.priceTier }), enabled: !!q.data });
  return (
    <QueryView query={q} loading={<LoadingState variant="kpis" />}>
      {(d) => (
        <div>
          <PageHeader eyebrow={`${d.customer.name} · ${d.customer.code}`} title={t('dashboard.customer', { name: user.name.split(' ')[0] })} description={`Tier ${d.customer.priceTier} pricing · ${d.customer.paymentTerms}`}
            actions={<><Button asChild variant="outline"><Link href="/catalog"><Boxes className="mr-2 h-4 w-4" />Browse catalog</Link></Button>{d.lastDelivered && <Button onClick={() => reorder(d.lastDelivered!)} data-testid="quick-reorder"><RotateCcw className="mr-2 h-4 w-4" />Reorder last</Button>}</>} />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard testId="kpi-outstanding" label="Current outstanding" value={fmtMoney(d.outstanding)} icon={Wallet} tone={d.overdue ? 'danger' : 'default'} hint={d.overdue ? <span className="text-rose-600">{fmtMoney(d.overdue)} overdue</span> : 'No overdue'} />
            <KpiCard label="Available credit" value={fmtMoney(d.available)} icon={CreditCard} tone="success" hint={`of ${fmtMoney(d.creditLimit)}`} />
            <KpiCard label="Open orders" value={d.pendingOrders} icon={Package} hint="In progress" />
            <KpiCard label="Purchases (12 months)" value={fmtMoney(d.ytd)} icon={TrendingUp} />
          </div>
          <div className="mt-3"><Progress value={Math.min(100, (d.outstanding / d.creditLimit) * 100)} className="h-1.5" aria-label="Credit utilisation" /><p className="mt-1 text-xs text-muted-foreground">Credit utilisation {Math.round((d.outstanding / d.creditLimit) * 100)}%</p></div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <SectionCard title="Recent orders" className="lg:col-span-2" action={<Link href="/orders" className="text-xs font-medium text-primary">{t('common.viewAll')}</Link>}>
              <ul className="divide-y">{d.recentOrders.map((o) => (
                <li key={o.id} className="flex items-center gap-3 px-4 py-3">
                  <Link href={`/orders/${o.id}`} className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-medium">{o.number}</span><StatusBadge status={o.status} /></div><div className="text-xs text-muted-foreground">{fmtDate(o.date)} · {o.lines.length} items · ETA {fmtDate(o.expectedDelivery)}</div></Link>
                  <span className="hidden text-sm font-medium tabular sm:block">{fmtMoney(o.total)}</span>
                  <Button variant="ghost" size="sm" onClick={() => reorder(o)} aria-label={`Reorder ${o.number}`}><RotateCcw className="h-4 w-4" /></Button>
                </li>
              ))}</ul>
            </SectionCard>
            <SectionCard title={<span className="flex items-center gap-2"><BadgePercent className="h-4 w-4 text-primary" />Offers for you</span>} action={<Link href="/offers" className="text-xs font-medium text-primary">{t('common.viewAll')}</Link>}>
              <ul className="divide-y">{(offers.data ?? []).slice(0, 3).map((o) => (
                <li key={o.id} className="px-4 py-3"><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{o.title}</span><span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">-{o.discountPct}%</span></div><p className="mt-0.5 text-xs text-muted-foreground">Valid till {fmtDate(o.validTo)} · <span className="font-mono">{o.code}</span></p></li>
              ))}</ul>
            </SectionCard>
          </div>
          <div className="mt-4">
            <SectionCard title={<span className="flex items-center gap-2"><Megaphone className="h-4 w-4 text-primary" />Announcements</span>} action={<Link href="/announcements" className="text-xs font-medium text-primary">{t('common.viewAll')}</Link>}>
              <div className="grid divide-y md:grid-cols-3 md:divide-x md:divide-y-0">{(ann.data ?? []).slice(0, 3).map((a) => (
                <Link key={a.id} href="/announcements" className="group p-4 hover:bg-muted/40"><div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{a.category} · {fmtDate(a.publishAt)}</div><div className="mt-1 text-sm font-medium">{a.title}</div><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.body}</p><span className="mt-2 inline-flex items-center text-xs font-medium text-primary">Read <ArrowRight className="ml-1 h-3 w-3" /></span></Link>
              ))}</div>
            </SectionCard>
          </div>
        </div>
      )}
    </QueryView>
  );
}
