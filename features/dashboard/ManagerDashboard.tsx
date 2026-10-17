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

export function ManagerDashboard() {
  const { t } = useT();
  const user = useUser();
  const router = useRouter();
  const q = useQuery({ queryKey: ['dash', 'manager', user.id], queryFn: () => dashboardService.getManagerDashboard(user.id) });
  return (
    <div>
      <PageHeader eyebrow={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} title={t('dashboard.manager')} description={`${user.name} · ${user.title}`} actions={<Button asChild><Link href="/approvals"><ClipboardCheck className="mr-2 h-4 w-4" />Open approvals</Link></Button>} />
      <QueryView query={q} loading={<LoadingState variant="kpis" />}>
        {(d) => (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
              <KpiCard testId="kpi-pending-purchase" label="Pending approvals" value={d.pendingApprovals} icon={ClipboardCheck} tone="warning" onClick={() => router.push('/approvals')} />
              <KpiCard label="Today's orders" value={d.ordersToday} icon={ShoppingCart} />
              <KpiCard label="Sales today" value={fmtCompactMoney(d.salesToday)} icon={IndianRupee} tone="success" />
              <KpiCard label="Sales this month" value={fmtCompactMoney(d.salesMonth)} icon={TrendingUp} tone="success" trend={{ value: '5.1%', up: true }} />
              <KpiCard label="Active sales reps" value={d.activeReps} icon={Users} onClick={() => router.push('/sales-reps')} />
              <KpiCard label="Pending issues" value={d.pendingIssues} icon={AlertCircle} tone="danger" onClick={() => router.push('/messages')} hint="Messages & change requests" />
            </div>
            {d.creditAlerts.length > 0 && (
              <SectionCard title={<span className="flex items-center gap-2 text-rose-700"><ShieldAlert className="h-4 w-4" />Credit alerts ({d.creditAlerts.length})</span>} className="border-rose-200" action={<span className="text-xs text-muted-foreground">Pending orders above available credit</span>}>
                <ul className="divide-y" data-testid="credit-alerts">{d.creditAlerts.map(({ order: o, check: k }) => (
                  <li key={o.id}><Link href={`/approvals?order=${o.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-rose-50/50">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-rose-100 text-rose-700"><ShieldAlert className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1"><div className="text-sm font-medium">{o.customerName}</div><div className="text-xs text-muted-foreground"><span className="font-mono">{o.number}</span> · {fmtMoney(o.total)} · {k.onHold ? 'account on hold' : `over by ${fmtMoney(k.exceededBy)}`} · utilisation {k.utilisationAfterPct}%</div></div>
                    <span className="hidden text-xs font-medium text-rose-700 sm:inline">Review &amp; override</span><ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Link></li>
                ))}</ul>
              </SectionCard>
            )}
            <div className="grid gap-4 lg:grid-cols-3">
              <SectionCard title="Awaiting your approval" className="lg:col-span-2" action={<Link href="/approvals" className="text-xs font-medium text-primary">{t('common.viewAll')}</Link>}>
                {d.approvals.length ? (
                  <ul className="divide-y">{d.approvals.map((o) => (
                    <li key={o.id}><Link href={`/approvals?order=${o.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700"><ClipboardCheck className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1"><div className="text-sm font-medium">{o.customerName}</div><div className="text-xs text-muted-foreground"><span className="font-mono">{o.number}</span> · {o.lines.length} items · by {o.createdBy.name} · {timeAgo(o.date)}</div></div>
                      <span className="text-sm font-semibold tabular">{fmtMoney(o.total)}</span><ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link></li>
                  ))}</ul>
                ) : <div className="p-4"><EmptyState title="No pending approvals" description="All caught up." /></div>}
              </SectionCard>
              <SectionCard title="Recent customer activity"><ActivityFeed items={d.activity} /></SectionCard>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <SectionCard title="Sales – last 14 days" className="lg:col-span-2" bodyClassName="p-4"><SalesAreaChart data={d.trend} /></SectionCard>
              <SectionCard title="Recent orders" action={<Link href="/orders" className="text-xs font-medium text-primary">{t('common.viewAll')}</Link>}><OrderMiniList orders={d.recentOrders.slice(0, 6)} /></SectionCard>
            </div>
          </div>
        )}
      </QueryView>
    </div>
  );
}
