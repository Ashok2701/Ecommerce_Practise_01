'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, FileInput, MessageSquare, PlusCircle, Truck, Warehouse } from 'lucide-react';
import { purchaseOrderService, purchaseRequestService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtMoney } from '@/lib/format';
import { PageHeader, SectionCard, EmptyState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/** Supplier home: what needs action now, recent purchase orders, and a pickup shortcut. */
export function SupplierDashboard() {
  const { t } = useT();
  const user = useUser();
  const scope = { supplierId: user.supplierId };
  const pos = useQuery({ queryKey: ['purchase-orders', scope], queryFn: () => purchaseOrderService.list(scope) });
  const prs = useQuery({ queryKey: ['purchase-requests', scope], queryFn: () => purchaseRequestService.list(scope) });
  const orders = pos.data ?? [];
  const count = (s: string[]) => orders.filter((o) => s.includes(o.status)).length;
  const kpis = [
    { key: 'ack', icon: ClipboardCheck, label: t('supplierDash.toAcknowledge'), value: count(['issued']) },
    { key: 'pick', icon: Truck, label: t('supplierDash.toConfirm'), value: count(['acknowledged']) },
    { key: 'transit', icon: Warehouse, label: t('supplierDash.inTransit'), value: count(['in_transit']) },
    { key: 'pr', icon: FileInput, label: t('supplierDash.openRequests'), value: (prs.data ?? []).filter((r) => ['submitted', 'changes_requested'].includes(r.status)).length },
  ];
  return (
    <div>
      <PageHeader eyebrow={user.erpCode ? t('supplierDash.code', { code: user.erpCode }) : undefined}
        title={t('dashboard.customer', { name: user.name.split(' ')[0] })} description={user.title}
        actions={<Button asChild><Link href="/supplier-catalog" data-testid="dash-request-pickup"><PlusCircle className="me-2 h-4 w-4" aria-hidden="true" />{t('supplierDash.requestPickup')}</Link></Button>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map(({ key, icon: Icon, label, value }) => (
          <Card key={key} className="p-4" data-testid={`sup-kpi-${key}`}>
            <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
            <div className="mt-2 text-2xl font-semibold tabular">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </Card>
        ))}
      </div>

      <SectionCard className="mt-4" title={t('supplierDash.recentOrders')} action={<Link href="/purchase-orders" className="text-sm font-medium text-primary hover:underline">{t('common.viewAll')}</Link>}>
        {orders.length ? (
          <ul className="divide-y">{orders.slice(0, 5).map((o) => (
            <li key={o.id}><Link href={`/purchase-orders/${o.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40">
              <div className="min-w-0"><div className="font-mono text-xs font-semibold">{o.number}</div><div className="text-xs text-muted-foreground">{fmtDate(o.date)} · {t('purchaseOrders.expected', { date: fmtDate(o.expectedDate) })}</div></div>
              <div className="flex items-center gap-3"><span className="text-sm font-medium tabular">{fmtMoney(o.total)}</span><StatusBadge status={o.status} /></div>
            </Link></li>
          ))}</ul>
        ) : <EmptyState title={t('supplierDash.noOrders')} />}
      </SectionCard>

      <SectionCard className="mt-4" title={t('supplierDash.contactTitle')}>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{t('supplierDash.contactText')}</p>
          <Button asChild variant="outline" className="shrink-0"><Link href="/messages"><MessageSquare className="me-2 h-4 w-4" aria-hidden="true" />{t('supplierDash.openMessages')}</Link></Button>
        </div>
      </SectionCard>
    </div>
  );
}
