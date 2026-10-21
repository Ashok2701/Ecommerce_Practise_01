'use client';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Factory } from 'lucide-react';
import { supplierService, purchaseOrderService } from '@/lib/services';
import { useT } from '@/lib/i18n';
import { fmtMoney } from '@/lib/format';
import { PageHeader, QueryView, DataTable, EmptyState } from '@/components/common';
import type { Supplier } from '@/types/domain';

const OPEN_PO = ['issued', 'acknowledged', 'pickup_confirmed', 'in_transit', 'partly_received'];

export default function SuppliersPage() {
  const { t } = useT();
  const router = useRouter();
  const q = useQuery({ queryKey: ['suppliers'], queryFn: supplierService.list });
  const pos = useQuery({ queryKey: ['purchase-orders', 'all-suppliers'], queryFn: () => purchaseOrderService.list() });
  const openFor = (id: string) => (pos.data ?? []).filter((o) => o.supplierId === id && OPEN_PO.includes(o.status));
  return (
    <div>
      <PageHeader title={t('suppliers.title')} description={t('suppliers.intro')} />
      <QueryView query={q}>
        {(rows) => rows.length ? (
          <DataTable<Supplier> testId="suppliers-table" rows={rows} rowKey={(s) => s.id} onRowClick={(s) => router.push(`/suppliers/${s.id}`)}
            columns={[
              { key: 'n', header: t('suppliers.col.supplier'), cell: (s) => <div><div className="font-medium">{s.name}</div><div className="font-mono text-[11px] text-muted-foreground">{s.code}</div></div> },
              { key: 'c', header: t('suppliers.col.contact'), cell: (s) => <div className="text-sm"><div>{s.contactName}</div><div className="text-xs text-muted-foreground">{s.phone}</div></div> },
              { key: 'city', header: t('suppliers.col.city'), cell: (s) => <span className="text-muted-foreground">{s.address.city}</span> },
              { key: 'p', header: t('suppliers.col.products'), cell: (s) => s.productIds.length, align: 'right' },
              { key: 'o', header: t('suppliers.col.openPos'), cell: (s) => { const o = openFor(s.id); return o.length ? <span className="tabular">{o.length} · {fmtMoney(o.reduce((a, x) => a + x.total, 0))}</span> : '—'; }, align: 'right' },
              { key: 'terms', header: t('suppliers.col.terms'), cell: (s) => <span className="text-muted-foreground">{s.paymentTerms}</span> },
            ]}
            mobileCard={(s) => (
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="font-medium">{s.name}</div><div className="text-xs text-muted-foreground">{s.code} · {s.address.city} · {s.paymentTerms}</div></div><span className="text-xs text-muted-foreground">{t('suppliers.productsCount', { count: s.productIds.length })}</span></div>
            )}
          />
        ) : <EmptyState icon={Factory} title={t('suppliers.empty')} />}
      </QueryView>
    </div>
  );
}
