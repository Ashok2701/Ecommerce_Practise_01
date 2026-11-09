'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, ShoppingCart, IndianRupee, Users, AlertCircle, TrendingUp, ChevronRight, ShieldAlert } from 'lucide-react';
import { dashboardService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useT } from '@/lib/i18n';
import { fmtCompactMoney, fmtMoney, timeAgo } from '@/lib/format';
import { PageHeader, KpiCard, SectionCard, LoadingState, QueryView, EmptyState } from '@/components/common';
import { SalesAreaChart } from '@/components/charts';
import { Button } from '@/components/ui/button';
import { ActivityFeed, OrderMiniList } from './AdminDashboard';
import { WorkQueue } from './WorkQueue';

export function ManagerDashboard() {
  const { t, locale } = useT();
  const user = useUser();
  const router = useRouter();
  const q = useQuery({ queryKey: ['dash', 'manager', user.id], queryFn: () => dashboardService.getManagerDashboard(user.id) });
  return (
    <div>
      <PageHeader eyebrow={new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })} title={t('dashboard.manager')} description={`${user.name} · ${user.title}`} actions={<Button asChild><Link href="/approvals"><ClipboardCheck className="me-2 h-4 w-4" aria-hidden="true" />{t('managerDash.openApprovals')}</Link></Button>} />
      <QueryView query={q} loading={<LoadingState variant="kpis" />}>
        {(d) => (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
              <KpiCard testId="kpi-pending-purchase" label={t('managerDash.pendingApprovals')} value={d.pendingApprovals} icon={ClipboardCheck} tone="warning" onClick={() => router.push('/approvals')} />
              <KpiCard label={t('managerDash.ordersToday')} value={d.ordersToday} icon={ShoppingCart} />
              <KpiCard label={t('managerDash.salesToday')} value={fmtCompactMoney(d.salesToday)} icon={IndianRupee} tone="success" />
              <KpiCard label={t('reps.kpi.month')} value={fmtCompactMoney(d.salesMonth)} icon={TrendingUp} tone="success" />
              <KpiCard label={t('managerDash.activeReps')} value={d.activeReps} icon={Users} onClick={() => router.push('/sales-reps')} />
              <KpiCard label={t('managerDash.pendingIssues')} value={d.pendingIssues} icon={AlertCircle} tone="danger" onClick={() => router.push('/messages')} hint={t('managerDash.issuesHint')} />
            </div>
            {d.creditAlerts.length > 0 && (
              <SectionCard title={<span className="flex items-center gap-2 text-rose-700"><ShieldAlert className="h-4 w-4" aria-hidden="true" />{t('managerDash.creditAlerts', { count: d.creditAlerts.length })}</span>} className="border-rose-200" action={<span className="hidden text-xs text-muted-foreground sm:inline">{t('managerDash.creditHint')}</span>}>
                <ul className="divide-y" data-testid="credit-alerts">{d.creditAlerts.map(({ order: o, check: k }) => (
                  <li key={o.id}><Link href={`/approvals?request=${o.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-rose-50/50">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-rose-100 text-rose-700"><ShieldAlert className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1"><div className="text-sm font-medium">{o.customerName}</div><div className="text-xs text-muted-foreground"><span className="font-mono">{o.number}</span> · {fmtMoney(o.total)} · {k.onHold ? t('managerDash.onHold') : t('managerDash.overBy', { amount: fmtMoney(k.exceededBy) })} · {t('managerDash.utilisation', { pct: k.utilisationAfterPct })}</div></div>
                    <span className="hidden text-xs font-medium text-rose-700 sm:inline">{t('managerDash.reviewOverride')}</span><ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
                  </Link></li>
                ))}</ul>
              </SectionCard>
            )}
            <div className="grid gap-4 lg:grid-cols-3 lg:items-start [&>*]:min-w-0">
              <SectionCard title={t('managerDash.awaiting')} className="lg:col-span-2" action={<Link href="/approvals" className="text-xs font-medium text-primary">{t('common.viewAll')}</Link>}>
                {d.approvals.length ? (
                  <ul className="divide-y">{d.approvals.map((o) => (
                    <li key={o.id}><Link href={`/approvals?request=${o.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700"><ClipboardCheck className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1"><div className="text-sm font-medium">{o.customerName}</div><div className="text-xs text-muted-foreground"><span className="font-mono">{o.number}</span> · {t('customerDash.items', { count: o.lines.length })} · {t('managerDash.by', { name: o.createdBy.name })} · {timeAgo(o.date)}</div></div>
                      <span className="text-sm font-semibold tabular">{fmtMoney(o.total)}</span><ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
                    </Link></li>
                  ))}</ul>
                ) : <div className="p-4"><EmptyState title={t('managerDash.noApprovals')} description={t('followUps.caughtUp')} /></div>}
              </SectionCard>
              <div className="space-y-4"><WorkQueue /><SectionCard title={t('managerDash.activity')}><ActivityFeed items={d.activity} /></SectionCard></div>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <SectionCard title={t('managerDash.trend14')} className="lg:col-span-2" bodyClassName="p-4"><SalesAreaChart data={d.trend} /></SectionCard>
              <SectionCard title={t('adminDash.recentOrders')} action={<Link href="/orders" className="text-xs font-medium text-primary">{t('common.viewAll')}</Link>}><OrderMiniList orders={d.recentOrders.slice(0, 6)} /></SectionCard>
            </div>
          </div>
        )}
      </QueryView>
    </div>
  );
}
