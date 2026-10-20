'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { purchaseOrderService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtMoney } from '@/lib/format';
import { PageHeader, QueryView, DataTable, EmptyState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ViewTabs, type ListView } from '@/features/purchasing/common';
import type { PurchaseOrder } from '@/types/domain';

const OPEN = ['issued', 'acknowledged', 'pickup_confirmed', 'in_transit', 'partly_received'];

export default function PurchaseOrdersPage() {
  const { t } = useT();
  const user = useUser();
  const router = useRouter();
  const supplier = user.role === 'SUPPLIER';
  const scope = supplier ? { supplierId: user.supplierId } : {};
  const q = useQuery({ queryKey: ['purchase-orders', scope], queryFn: () => purchaseOrderService.list(scope) });
  const [view, setView] = useState<ListView>('open');
  const all = q.data ?? [];
  const inView = (o: PurchaseOrder, v: ListView) => v === 'all' || (v === 'open' ? OPEN.includes(o.status) : !OPEN.includes(o.status));
  const rows = all.filter((o) => inView(o, view));
  return (
    <div>
      <PageHeader title={t('purchaseOrders.title')} description={supplier ? t('purchaseOrders.introSupplier') : t('purchaseOrders.introBuyer')} />
      <ViewTabs value={view} onChange={setView} counts={{ open: all.filter((o) => inView(o, 'open')).length, closed: all.filter((o) => inView(o, 'closed')).length, all: all.length }} testId="po-tab" />
      <QueryView query={q}>
        {() => rows.length ? (
          <DataTable<PurchaseOrder> testId="po-table" rows={rows} rowKey={(o) => o.id} onRowClick={(o) => router.push(`/purchase-orders/${o.id}`)}
            columns={[
              { key: 'n', header: t('purchaseOrders.col.number'), cell: (o) => <span className="font-mono text-xs font-semibold">{o.number}</span> },
              ...(supplier ? [] : [{ key: 's', header: t('purchaseOrders.col.supplier'), cell: (o: PurchaseOrder) => <span className="font-medium">{o.supplierName}</span> }]),
              { key: 'd', header: t('purchaseOrders.col.date'), cell: (o) => <span className="text-muted-foreground">{fmtDate(o.date)}</span> },
              { key: 'e', header: t('purchaseOrders.col.expected'), cell: (o) => fmtDate(o.expectedDate) },
              { key: 't', header: t('purchaseOrders.col.total'), cell: (o) => <span className="font-medium tabular">{fmtMoney(o.total)}</span>, align: 'right' },
              { key: 'st', header: t('purchaseOrders.col.status'), cell: (o) => <StatusBadge status={o.status} /> },
            ]}
            mobileCard={(o) => (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><div className="font-mono text-xs font-semibold">{o.number}</div><div className="truncate text-sm font-medium">{o.supplierName}</div><div className="text-xs text-muted-foreground">{t('purchaseOrders.expected', { date: fmtDate(o.expectedDate) })} · {fmtMoney(o.total)}</div></div>
                <StatusBadge status={o.status} />
              </div>
            )}
          />
        ) : <EmptyState icon={ClipboardList} title={t('purchaseOrders.empty')} description={t('purchaseOrders.emptyHint')} />}
      </QueryView>
    </div>
  );
}
