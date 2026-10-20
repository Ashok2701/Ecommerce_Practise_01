'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, ArrowRight, PlusCircle } from 'lucide-react';
import { transferService } from '@/lib/services';
import { useSite } from '@/lib/sites/SiteProvider';
import { useT } from '@/lib/i18n';
import { fmtDate } from '@/lib/format';
import { PageHeader, QueryView, DataTable, EmptyState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { ViewTabs, type ListView } from '@/features/purchasing/common';
import { cn } from '@/lib/utils';
import { OPEN_TRANSFER, type StockTransfer } from '@/types/domain';

type Direction = 'both' | 'in' | 'out';

export default function TransfersPage() {
  const { t } = useT();
  const { site } = useSite();
  const router = useRouter();
  const q = useQuery({ queryKey: ['transfers', site], queryFn: () => transferService.list() });
  const [view, setView] = useState<ListView>('open');
  const [dir, setDir] = useState<Direction>('both');
  const byDir = (q.data ?? []).filter((x) => dir === 'both' || !site || (dir === 'in' ? x.toSite === site : x.fromSite === site));
  const inView = (x: StockTransfer, v: ListView) => v === 'all' || (v === 'open' ? OPEN_TRANSFER.includes(x.status) : !OPEN_TRANSFER.includes(x.status));
  const rows = byDir.filter((x) => inView(x, view));
  const Route = ({ x }: { x: StockTransfer }) => (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs">
      <span className={cn(x.fromSite === site && 'font-semibold')}>{x.fromSite}</span><ArrowRight className="h-3 w-3 text-muted-foreground rtl:rotate-180" aria-hidden="true" /><span className={cn(x.toSite === site && 'font-semibold')}>{x.toSite}</span>
    </span>
  );
  return (
    <div>
      <PageHeader title={t('transfers.title')} description={t('transfers.intro', { site: site ?? '' })}
        actions={<Button asChild><Link href="/transfers/new" data-testid="new-transfer"><PlusCircle className="me-2 h-4 w-4" aria-hidden="true" />{t('transfers.new')}</Link></Button>} />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <ViewTabs value={view} onChange={setView} counts={{ open: byDir.filter((x) => inView(x, 'open')).length, closed: byDir.filter((x) => inView(x, 'closed')).length, all: byDir.length }} testId="tr-tab" />
        <div className="mb-4 flex gap-1.5" role="tablist" aria-label={t('transfers.direction.label')}>
          {(['both', 'in', 'out'] as const).map((d) => (
            <button key={d} role="tab" aria-selected={dir === d} onClick={() => setDir(d)} data-testid={`tr-dir-${d}`}
              className={cn('rounded-md border px-3 py-1.5 text-xs font-medium', dir === d ? 'border-foreground/30 bg-muted' : 'bg-card hover:bg-muted')}>{t(`transfers.direction.${d}`)}</button>
          ))}
        </div>
      </div>
      <QueryView query={q}>
        {() => rows.length ? (
          <DataTable<StockTransfer> testId="tr-table" rows={rows} rowKey={(x) => x.id} onRowClick={(x) => router.push(`/transfers/${x.id}`)}
            columns={[
              { key: 'n', header: t('transfers.col.number'), cell: (x) => <span className="font-mono text-xs font-semibold">{x.number}</span> },
              { key: 'r', header: t('transfers.col.route'), cell: (x) => <Route x={x} /> },
              { key: 'i', header: t('transfers.col.items'), cell: (x) => <span className="text-sm">{x.lines.map((l) => l.name).join(', ')}</span> },
              { key: 'b', header: t('transfers.col.by'), cell: (x) => <span className="text-muted-foreground">{x.createdBy.name}</span> },
              { key: 'd', header: t('transfers.col.date'), cell: (x) => <span className="text-muted-foreground">{fmtDate(x.date)}</span> },
              { key: 's', header: t('transfers.col.status'), cell: (x) => <StatusBadge status={x.status} /> },
            ]}
            mobileCard={(x) => (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><div className="font-mono text-xs font-semibold">{x.number}</div><Route x={x} /><div className="truncate text-xs text-muted-foreground">{t('requests.items', { count: x.lines.length })} · {fmtDate(x.date)}</div></div>
                <StatusBadge status={x.status} />
              </div>
            )}
          />
        ) : <EmptyState icon={ArrowLeftRight} title={t('transfers.empty')} description={t('transfers.emptyHint')} />}
      </QueryView>
    </div>
  );
}
