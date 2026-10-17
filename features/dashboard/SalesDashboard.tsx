'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Building2, ShoppingCart, IndianRupee, TrendingUp, CalendarCheck, PlusCircle, Clock, CheckCircle2, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { salesService, customerService, orderService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useT } from '@/lib/i18n';
import { fmtCompactMoney, fmtDate, fmtMoney } from '@/lib/format';
import { PageHeader, KpiCard, SectionCard, LoadingState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { OrderMiniList } from './AdminDashboard';
import { VisitReportSheet } from '@/features/visits/VisitReport';
import { useState } from 'react';

export function SalesDashboard() {
  const { t } = useT();
  const user = useUser();
  const router = useRouter();
  const qc = useQueryClient();
  const perf = useQuery({ queryKey: ['perf', user.id], queryFn: () => salesService.getPerformance(user.id) });
  const visits = useQuery({ queryKey: ['visits', user.id], queryFn: () => salesService.getVisits(user.id) });
  const customers = useQuery({ queryKey: ['customers', user.id], queryFn: () => customerService.getCustomers({ salesRepId: user.id }) });
  const follow = useQuery({ queryKey: ['followups', user.id], queryFn: () => salesService.getFollowUps(user.id) });
  const orders = useQuery({ queryKey: ['orders', { salesRepId: user.id }], queryFn: () => orderService.getOrders({ salesRepId: user.id }) });
  const visitMut = useMutation({ mutationFn: ({ id, s }: { id: string; s: any }) => salesService.setVisitStatus(id, s), onSuccess: () => { qc.invalidateQueries({ queryKey: ['visits'] }); toast.success('Visit updated'); } });
  const [report, setReport] = useState<{ customerId: string; visitId: string; purpose: string } | null>(null);
  const cname = (id: string) => customers.data?.find((c) => c.id === id);
  const openFollow = (follow.data ?? []).filter((f) => f.status === 'open');
  const p = perf.data;

  return (
    <div>
      <PageHeader eyebrow={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })} title={t('dashboard.sales', { name: user.name.split(' ')[0] })} description={user.region}
        actions={<Button asChild className="h-11 w-full sm:h-10 sm:w-auto" data-testid="dash-create-order"><Link href="/orders/new"><PlusCircle className="mr-2 h-4 w-4" />Create order</Link></Button>} />
      {!p ? <LoadingState variant="kpis" /> : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard label="Today's visits" value={visits.data?.length ?? '–'} icon={MapPin} hint={`${visits.data?.filter((v) => v.status === 'completed').length ?? 0} completed`} />
          <KpiCard label="My customers" value={p.customers} icon={Building2} onClick={() => router.push('/customers')} />
          <KpiCard label="Orders today" value={p.ordersToday} icon={ShoppingCart} />
          <KpiCard label="Sales today" value={fmtCompactMoney(p.salesToday)} icon={IndianRupee} tone="success" />
          <KpiCard label="Monthly sales" value={fmtCompactMoney(p.salesMonth)} icon={TrendingUp} tone="success" hint={`${p.achievementPct}% of target`} onClick={() => router.push('/performance')} />
          <KpiCard label="Pending follow-ups" value={openFollow.length} icon={CalendarCheck} tone="warning" onClick={() => router.push('/follow-ups')} />
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <SectionCard title="Today's route" className="lg:col-span-2" action={<span className="text-xs text-muted-foreground">{visits.data?.length ?? 0} stops</span>}>
          {!visits.data ? <div className="p-4"><LoadingState rows={3} /></div> : (
            <ol className="divide-y">
              {visits.data.map((v) => { const c = cname(v.customerId); return (
                <li key={v.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="flex flex-1 items-start gap-3">
                    <div className="w-12 shrink-0 pt-0.5 text-sm font-semibold tabular">{v.time}</div>
                    <div className="min-w-0"><Link href={`/customers/${v.customerId}`} className="text-sm font-medium hover:underline">{c?.name ?? '…'}</Link><div className="text-xs text-muted-foreground">{v.purpose} · {c?.address.city}</div></div>
                  </div>
                  <div className="flex items-center gap-2 pl-15 sm:pl-0">
                    <StatusBadge status={v.status} />
                    {v.status === 'planned' && <Button size="sm" variant="outline" className="h-9" onClick={() => visitMut.mutate({ id: v.id, s: 'checked_in' })}><LogIn className="mr-1 h-3.5 w-3.5" />Check in</Button>}
                    {v.status === 'checked_in' && <>
                      <Button size="sm" className="h-9" onClick={() => router.push(`/orders/new?customer=${v.customerId}`)}><PlusCircle className="mr-1 h-3.5 w-3.5" />Order</Button>
                      <Button size="sm" variant="outline" className="h-9" onClick={() => setReport({ customerId: v.customerId, visitId: v.id, purpose: v.purpose })} data-testid={`complete-visit-${v.id}`}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Complete &amp; report</Button>
                    </>}
                    {v.status === 'completed' && (v.reportId ? <Button size="sm" variant="ghost" className="h-9" asChild><Link href={`/customers/${v.customerId}?tab=visits`}>View report</Link></Button>
                      : <Button size="sm" variant="ghost" className="h-9" onClick={() => setReport({ customerId: v.customerId, visitId: v.id, purpose: v.purpose })}>Add report</Button>)}
                  </div>
                </li>
              ); })}
            </ol>
          )}
        </SectionCard>
        <SectionCard title="Monthly target" bodyClassName="p-4">
          {p && <>
            <div className="flex items-end justify-between"><div><div className="text-2xl font-semibold tabular">{fmtMoney(p.salesMonth)}</div><div className="text-xs text-muted-foreground">of {fmtMoney(p.target)} target</div></div><span className="text-lg font-semibold text-primary">{p.achievementPct}%</span></div>
            <Progress value={Math.min(100, p.achievementPct)} className="mt-3 h-2" />
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div className="rounded-md bg-muted/60 p-3"><div className="text-xs text-muted-foreground">Orders (month)</div><div className="font-semibold tabular">{p.ordersMonth}</div></div><div className="rounded-md bg-muted/60 p-3"><div className="text-xs text-muted-foreground">Remaining</div><div className="font-semibold tabular">{fmtCompactMoney(Math.max(0, p.target - p.salesMonth))}</div></div></div>
          </>}
          <div className="mt-5 border-t pt-4">
            <div className="mb-2 flex items-center justify-between text-sm font-semibold">Follow-ups due<Link href="/follow-ups" className="text-xs font-medium text-primary">{t('common.viewAll')}</Link></div>
            <ul className="space-y-2">{openFollow.slice(0, 3).map((f) => (
              <li key={f.id} className="flex gap-2 text-sm"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><div className="min-w-0"><div className="truncate font-medium">{cname(f.customerId)?.name}</div><div className="truncate text-xs text-muted-foreground">{fmtDate(f.date)} · {f.notes}</div></div></li>
            ))}</ul>
          </div>
        </SectionCard>
      </div>
      {report && <VisitReportSheet open={!!report} onOpenChange={(o) => !o && setReport(null)} customerId={report.customerId} visitId={report.visitId} purpose={report.purpose} />}
      <div className="mt-4"><SectionCard title="My recent orders" action={<Link href="/orders" className="text-xs font-medium text-primary">{t('common.viewAll')}</Link>}>{orders.data ? <OrderMiniList orders={orders.data.slice(0, 5)} /> : <div className="p-4"><LoadingState rows={3} /></div>}</SectionCard></div>
    </div>
  );
}
