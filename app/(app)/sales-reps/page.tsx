'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Building2, ShoppingCart, MapPin } from 'lucide-react';
import { salesService } from '@/lib/services';
import { fmtCompactMoney, fmtMoney, initials } from '@/lib/format';
import { PageHeader, QueryView, LoadingState, SectionCard } from '@/components/common';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { HBarChart } from '@/components/charts';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

export default function SalesRepsPage() {
  const { t } = useT();
  const q = useQuery({ queryKey: ['team'], queryFn: salesService.getTeam });
  return (
    <div>
      <PageHeader title={t('nav.salesReps')} description={t('team.intro')} />
      <QueryView query={q} loading={<LoadingState variant="cards" rows={4} />}>
        {(team) => (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="reps-grid">
              {team.map((p) => (
                <Card key={p.rep.id} className="p-4">
                  <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{initials(p.rep.name)}</span><div className="min-w-0"><Link href={`/sales-reps/${p.rep.id}`} className="font-semibold hover:text-primary" data-testid={`rep-link-${p.rep.id}`}>{p.rep.name}</Link><div className="flex items-center gap-1 truncate text-xs text-muted-foreground"><MapPin className="h-3 w-3" aria-hidden="true" />{p.rep.region}</div></div></div>
                  <div className="mt-4 flex items-end justify-between"><div><div className="text-xs text-muted-foreground">{t('team.thisMonth')}</div><div className="text-lg font-semibold tabular">{fmtMoney(p.salesMonth)}</div></div><span className={cn('text-sm font-semibold', p.achievementPct >= 75 ? 'text-emerald-600' : p.achievementPct >= 40 ? 'text-amber-600' : 'text-rose-600')}>{p.achievementPct}%</span></div>
                  <Progress value={Math.min(100, p.achievementPct)} className="mt-2 h-1.5" aria-label={t('team.achievement', { name: p.rep.name })} />
                  <div className="mt-1 text-[11px] text-muted-foreground">{t('team.target', { amount: fmtCompactMoney(p.target) })}</div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="flex items-center gap-1.5 rounded-md bg-muted/60 p-2"><Building2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />{t('team.customers', { count: p.customers })}</div><div className="flex items-center gap-1.5 rounded-md bg-muted/60 p-2"><ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />{t('team.orders', { count: p.ordersMonth })}</div></div>
                </Card>
              ))}
            </div>
            <SectionCard title={t('team.chart')} bodyClassName="p-4"><HBarChart data={team.map((p) => ({ name: p.rep.name, sales: Math.round(p.salesMonth) }))} x="name" y="sales" height={220} /></SectionCard>
          </div>
        )}
      </QueryView>
    </div>
  );
}
