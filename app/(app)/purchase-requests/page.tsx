'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { FileInput, PlusCircle } from 'lucide-react';
import { purchaseRequestService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtMoney } from '@/lib/format';
import { PageHeader, QueryView, DataTable, EmptyState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { ViewTabs, type ListView } from '@/features/purchasing/common';
import type { PurchaseRequest } from '@/types/domain';

const OPEN = ['submitted', 'changes_requested'];

export default function PurchaseRequestsPage() {
  const { t } = useT();
  const user = useUser();
  const router = useRouter();
  const supplier = user.role === 'SUPPLIER';
  const scope = supplier ? { supplierId: user.supplierId } : {};
  const q = useQuery({ queryKey: ['purchase-requests', scope], queryFn: () => purchaseRequestService.list(scope) });
  const [view, setView] = useState<ListView>('open');
  const all = q.data ?? [];
  const inView = (r: PurchaseRequest, v: ListView) => v === 'all' || (v === 'open' ? OPEN.includes(r.status) : !OPEN.includes(r.status));
  const rows = all.filter((r) => inView(r, view));
  return (
    <div>
      <PageHeader title={t('purchaseRequests.title')} description={supplier ? t('purchaseRequests.introSupplier') : t('purchaseRequests.introBuyer')}
        actions={supplier
          ? <Button asChild><Link href="/supplier-catalog"><PlusCircle className="me-2 h-4 w-4" aria-hidden="true" />{t('supplierDash.requestPickup')}</Link></Button>
          : <Button asChild><Link href="/purchase-requests/new" data-testid="new-pr"><PlusCircle className="me-2 h-4 w-4" aria-hidden="true" />{t('purchaseRequests.new')}</Link></Button>} />
      <ViewTabs value={view} onChange={setView} counts={{ open: all.filter((r) => inView(r, 'open')).length, closed: all.filter((r) => inView(r, 'closed')).length, all: all.length }} testId="pr-tab" />
      <QueryView query={q}>
        {() => rows.length ? (
          <DataTable<PurchaseRequest> testId="pr-table" rows={rows} rowKey={(r) => r.id} onRowClick={(r) => router.push(`/purchase-requests/${r.id}`)}
            columns={[
              { key: 'n', header: t('purchaseRequests.col.number'), cell: (r) => <span className="font-mono text-xs font-semibold">{r.number}</span> },
              ...(supplier ? [] : [{ key: 's', header: t('purchaseRequests.col.supplier'), cell: (r: PurchaseRequest) => <span className="font-medium">{r.supplierName}</span> }]),
              { key: 'k', header: t('purchaseRequests.col.source'), cell: (r) => <span className="text-xs">{t(`purchaseRequests.source.${r.source}`)}</span> },
              { key: 'd', header: t('purchaseRequests.col.date'), cell: (r) => <span className="text-muted-foreground">{fmtDate(r.date)}</span> },
              { key: 'i', header: t('purchaseRequests.col.items'), cell: (r) => t('requests.items', { count: r.lines.length }) },
              { key: 't', header: t('purchaseRequests.col.total'), cell: (r) => <span className="font-medium tabular">{fmtMoney(r.total)}</span>, align: 'right' },
              { key: 'st', header: t('purchaseRequests.col.status'), cell: (r) => <StatusBadge status={r.status} /> },
              { key: 'po', header: t('purchaseRequests.col.po'), cell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.orderNumber ?? '—'}</span> },
            ]}
            mobileCard={(r) => (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><div className="font-mono text-xs font-semibold">{r.number}</div><div className="truncate text-sm font-medium">{r.supplierName}</div><div className="text-xs text-muted-foreground">{t(`purchaseRequests.source.${r.source}`)} · {fmtDate(r.date)} · {fmtMoney(r.total)}</div></div>
                <StatusBadge status={r.status} />
              </div>
            )}
          />
        ) : <EmptyState icon={FileInput} title={t('purchaseRequests.empty')} description={t('purchaseRequests.emptyHint')} />}
      </QueryView>
    </div>
  );
}
