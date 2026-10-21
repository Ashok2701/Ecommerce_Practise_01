'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Building2, Mail, MapPin, Phone, ShoppingCart, Target } from 'lucide-react';
import { salesService, customerService, orderService, quoteService, paymentService } from '@/lib/services';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtMoney, initials } from '@/lib/format';
import { QueryView, LoadingState, SectionCard, KpiCard, EmptyState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TargetBarChart } from '@/components/charts';
import { OrderMiniList } from '@/features/dashboard/AdminDashboard';
import { BackLink, RefLink } from '@/features/detail/DetailBits';
import { cn } from '@/lib/utils';

/** One sales representative: target, customers, orders, quotes, follow-ups and what their customers owe. */
export default function SalesRepPage() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['rep-perf', id], queryFn: () => salesService.getPerformance(id) });
  const custs = useQuery({ queryKey: ['customers', { salesRepId: id }], queryFn: () => customerService.getCustomers({ salesRepId: id }) });
  const orders = useQuery({ queryKey: ['orders', { salesRepId: id }], queryFn: () => orderService.getOrders({ salesRepId: id }) });
  const quotes = useQuery({ queryKey: ['quotes', { salesRepId: id }], queryFn: () => quoteService.list({ salesRepId: id, view: 'open' }) });
  const follow = useQuery({ queryKey: ['follow-ups', id], queryFn: () => salesService.getFollowUps(id) });
  const aging = useQuery({ queryKey: ['aging', { salesRepId: id }], queryFn: () => paymentService.aging({ salesRepId: id }) });
  const nameOf = (cid: string) => customerService.peek(cid)?.name ?? cid;
  const overdue = (aging.data ?? []).reduce((s, r) => s + r.overdue, 0);
  return (
    <div>
      <BackLink href="/sales-reps" label={t('nav.salesReps')} />
      <QueryView query={q} loading={<LoadingState variant="detail" />}>
        {(p) => (
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">{initials(p.rep.name)}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold tracking-tight" data-testid="rep-name">{p.rep.name}</h1><StatusBadge status={p.rep.status} /></div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{p.rep.title}{p.rep.erpCode ? ` · ${p.rep.erpCode}` : ''}</p>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                    <a href={`tel:${p.rep.phone}`} className="flex items-center gap-1.5 hover:text-foreground"><Phone className="h-4 w-4" aria-hidden="true" />{p.rep.phone}</a>
                    <a href={`mailto:${p.rep.email}`} className="flex items-center gap-1.5 hover:text-foreground"><Mail className="h-4 w-4" aria-hidden="true" />{p.rep.email}</a>
                    {p.rep.region && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" aria-hidden="true" />{p.rep.region}{p.rep.allowedSites?.length ? ` · ${p.rep.allowedSites.join(', ')}` : ''}</span>}
                  </div>
                </div>
              </div>
            </Card>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard label={t('reps.kpi.month')} value={fmtMoney(p.salesMonth)} hint={t('reps.kpi.ofTarget', { pct: p.achievementPct, target: fmtMoney(p.target) })} icon={Target} tone={p.achievementPct >= 75 ? 'success' : p.achievementPct >= 40 ? 'warning' : 'danger'} />
              <KpiCard label={t('reps.kpi.orders')} value={p.ordersMonth} hint={t('reps.kpi.today', { count: p.ordersToday })} icon={ShoppingCart} />
              <KpiCard label={t('reps.kpi.customers')} value={p.customers} icon={Building2} />
              <KpiCard label={t('reps.kpi.overdue')} value={fmtMoney(overdue)} icon={AlertTriangle} tone={overdue ? 'danger' : 'success'} />
            </div>
            <Progress value={Math.min(100, p.achievementPct)} className="h-2" aria-label={t('reps.kpi.month')} />
            <SectionCard title={t('reps.trend')} bodyClassName="p-4"><TargetBarChart data={p.monthly} height={220} /></SectionCard>
            <Tabs defaultValue="customers">
              <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
                <TabsTrigger value="customers">{t('nav.customers')}</TabsTrigger>
                <TabsTrigger value="orders">{t('nav.orders')}</TabsTrigger>
                <TabsTrigger value="quotes">{t('nav.quotes')}</TabsTrigger>
                <TabsTrigger value="followups">{t('nav.followUps')}</TabsTrigger>
                <TabsTrigger value="collections">{t('nav.collections')}</TabsTrigger>
              </TabsList>
              <TabsContent value="customers">
                <SectionCard title={t('nav.customers')}>
                  {custs.data?.length ? <ul className="divide-y" data-testid="rep-customers">{custs.data.map((c) => (
                    <li key={c.id}><Link href={`/customers/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/40">
                      <div className="min-w-0"><div className="font-medium">{c.name}</div><div className="text-xs text-muted-foreground">{c.code} · {c.address.city}</div></div>
                      <div className="flex items-center gap-3"><span className={cn('tabular', c.outstanding > c.creditLimit * 0.8 && 'text-rose-600')}>{fmtMoney(c.outstanding)}</span><StatusBadge status={c.status} /></div>
                    </Link></li>
                  ))}</ul> : <div className="p-4"><EmptyState title={t('reps.noCustomers')} /></div>}
                </SectionCard>
              </TabsContent>
              <TabsContent value="orders"><SectionCard title={t('nav.orders')}>{orders.data?.length ? <OrderMiniList orders={orders.data.slice(0, 15)} /> : <div className="p-4"><EmptyState title={t('reps.noOrders')} /></div>}</SectionCard></TabsContent>
              <TabsContent value="quotes">
                <SectionCard title={t('nav.quotes')}>
                  {quotes.data?.length ? <ul className="divide-y">{quotes.data.map((x) => (
                    <li key={x.id}><Link href={`/quotes/${x.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/40">
                      <div className="min-w-0"><div className="font-mono text-xs font-semibold">{x.number}</div><div className="truncate text-xs text-muted-foreground">{x.customerName} · {fmtDate(x.date)}</div></div>
                      <div className="flex items-center gap-3"><span className="tabular">{fmtMoney(x.total)}</span><StatusBadge status={x.status} /></div>
                    </Link></li>
                  ))}</ul> : <div className="p-4"><EmptyState title={t('quotes.empty')} /></div>}
                </SectionCard>
              </TabsContent>
              <TabsContent value="followups">
                <SectionCard title={t('nav.followUps')}>
                  {follow.data?.length ? <ul className="divide-y">{follow.data.map((f) => (
                    <li key={f.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                      <div className="min-w-0"><RefLink href={`/customers/${f.customerId}`} className="font-medium">{nameOf(f.customerId)}</RefLink><div className="text-xs text-muted-foreground">{t(`reps.followType.${f.type}`)} · {fmtDate(f.date)}</div><p className="text-xs text-muted-foreground">{f.notes}</p></div>
                      <StatusBadge status={f.status} />
                    </li>
                  ))}</ul> : <div className="p-4"><EmptyState title={t('reps.noFollowUps')} /></div>}
                </SectionCard>
              </TabsContent>
              <TabsContent value="collections">
                <SectionCard title={t('nav.collections')}>
                  {aging.data?.length ? <ul className="divide-y">{aging.data.map((r) => (
                    <li key={r.customerId}><Link href={`/customers/${r.customerId}?tab=finance`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/40">
                      <div className="min-w-0"><div className="font-medium">{r.customerName}</div><div className="text-xs text-muted-foreground">{r.lastPayment ? t('collections.lastPaid', { date: fmtDate(r.lastPayment.date) }) : r.customerCode}</div></div>
                      <div className="text-end"><div className="font-semibold tabular">{fmtMoney(r.total)}</div>{r.overdue > 0 && <div className="text-xs text-rose-600 tabular">{t('reps.overdueAmount', { amount: fmtMoney(r.overdue) })}</div>}</div>
                    </Link></li>
                  ))}</ul> : <div className="p-4"><EmptyState title={t('collections.empty')} /></div>}
                </SectionCard>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </QueryView>
    </div>
  );
}
