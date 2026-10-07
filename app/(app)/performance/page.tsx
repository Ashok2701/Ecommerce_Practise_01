'use client';
import { useQuery } from '@tanstack/react-query';
import { Target, TrendingUp, ShoppingCart, Building2 } from 'lucide-react';
import { salesService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { fmtMoney } from '@/lib/format';
import { PageHeader, QueryView, KpiCard, SectionCard, LoadingState } from '@/components/common';
import { TargetBarChart, HBarChart } from '@/components/charts';
import { Progress } from '@/components/ui/progress';

export default function PerformancePage() {
  const user = useUser();
  const q = useQuery({ queryKey: ['perf', user.id], queryFn: () => salesService.getPerformance(user.id) });
  return (
    <div>
      <PageHeader title="Sales performance" description={`${user.name} · ${user.region}`} />
      <QueryView query={q} loading={<LoadingState variant="kpis" />}>
        {(p) => (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard label="Sales this month" value={fmtMoney(p.salesMonth)} icon={TrendingUp} tone="success" />
              <KpiCard label="Monthly target" value={fmtMoney(p.target)} icon={Target} />
              <KpiCard label="Orders this month" value={p.ordersMonth} icon={ShoppingCart} />
              <KpiCard label="Active customers" value={p.customers} icon={Building2} />
            </div>
            <SectionCard title="Target achievement" bodyClassName="p-4">
              <div className="flex items-end justify-between"><span className="text-3xl font-semibold text-primary tabular" data-testid="achievement">{p.achievementPct}%</span><span className="text-sm text-muted-foreground">{fmtMoney(Math.max(0, p.target - p.salesMonth))} to go · {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate()} days left</span></div>
              <Progress value={Math.min(100, p.achievementPct)} className="mt-3 h-2.5" />
            </SectionCard>
            <div className="grid gap-4 lg:grid-cols-3">
              <SectionCard title="Sales vs target – last 6 months" className="lg:col-span-2" bodyClassName="p-4"><TargetBarChart data={p.monthly} height={260} /></SectionCard>
              <SectionCard title="Top customers (all time)" bodyClassName="p-3"><HBarChart data={p.topCustomers} x="name" y="sales" height={260} /></SectionCard>
            </div>
          </div>
        )}
      </QueryView>
    </div>
  );
}
