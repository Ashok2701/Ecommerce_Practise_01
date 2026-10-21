'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { PackageCheck } from 'lucide-react';
import { deliveryService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useSite } from '@/lib/sites/SiteProvider';
import { useT } from '@/lib/i18n';
import { fmtDate } from '@/lib/format';
import { PageHeader, QueryView, DataTable, EmptyState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { cn } from '@/lib/utils';
import type { Delivery } from '@/types/domain';

type Tab = 'open' | 'today' | 'delivered' | 'all';

export default function DeliveriesPage() {
  const { t } = useT();
  const user = useUser();
  const { site } = useSite();
  const router = useRouter();
  const scope = user.role === 'SALES_REP' ? { salesRepId: user.id } : {};
  const q = useQuery({ queryKey: ['deliveries', site, scope], queryFn: () => deliveryService.list(scope) });
  const [tab, setTab] = useState<Tab>('open');
  const mine = q.data ?? [];
  const today = new Date().toDateString();
  const match = (d: Delivery, k: Tab) => k === 'all' || (k === 'delivered' ? d.status === 'delivered' : k === 'today' ? d.status !== 'delivered' && new Date(d.plannedDate).toDateString() === today : d.status !== 'delivered');
  const rows = mine.filter((d) => match(d, tab));
  return (
    <div>
      <PageHeader title={t('deliveries.title')} description={t('deliveries.intro', { site: site ?? '' })} />
      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist">
        {(['open', 'today', 'delivered', 'all'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`del-tab-${k}`}
            className={cn('rounded-md border px-3 py-1.5 text-xs font-medium', tab === k ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}>
            {t(`deliveries.tabs.${k}`)} <span className="ms-1 tabular opacity-70">{mine.filter((d) => match(d, k)).length}</span>
          </button>
        ))}
      </div>
      <QueryView query={q}>
        {() => rows.length ? (
          <DataTable<Delivery> testId="del-table" rows={rows} rowKey={(d) => d.id} onRowClick={(d) => router.push(`/deliveries/${d.id}`)}
            columns={[
              { key: 'n', header: t('deliveries.col.number'), cell: (d) => <div><div className="font-mono text-xs font-semibold">{d.number}</div><div className="font-mono text-[11px] text-muted-foreground">{d.orderNumber}</div></div> },
              { key: 'c', header: t('deliveries.col.customer'), cell: (d) => <div><div className="font-medium">{d.customerName}</div><div className="text-xs text-muted-foreground">{d.address.city}</div></div> },
              { key: 'p', header: t('deliveries.col.planned'), cell: (d) => fmtDate(d.plannedDate) },
              { key: 'k', header: t('deliveries.col.carrier'), cell: (d) => <span className="text-muted-foreground">{d.carrier}{d.driver ? ` · ${d.driver}` : ''}</span> },
              { key: 's', header: t('deliveries.col.status'), cell: (d) => <StatusBadge status={d.status} /> },
            ]}
            mobileCard={(d) => (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><div className="font-mono text-xs font-semibold">{d.number} · {d.orderNumber}</div><div className="truncate text-sm font-medium">{d.customerName}</div><div className="text-xs text-muted-foreground">{d.address.city} · {fmtDate(d.plannedDate)}</div></div>
                <StatusBadge status={d.status} />
              </div>
            )}
          />
        ) : <EmptyState icon={PackageCheck} title={t('deliveries.empty')} />}
      </QueryView>
    </div>
  );
}
