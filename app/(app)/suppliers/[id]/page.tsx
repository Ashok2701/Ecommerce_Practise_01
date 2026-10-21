'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, FileInput, Mail, MapPin, Phone, PlusCircle, Timer, Truck } from 'lucide-react';
import { supplierService, supplierSummary, purchaseOrderService, purchaseRequestService } from '@/lib/services';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtMoney, fmtNumber } from '@/lib/format';
import { QueryView, LoadingState, SectionCard, KpiCard, EmptyState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BackLink, RefLink } from '@/features/detail/DetailBits';

/** Supplier: contact and terms, what they supply with our stock, and the purchasing history. */
export default function SupplierPage() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['supplier-summary', id], queryFn: () => supplierSummary(id) });
  const cat = useQuery({ queryKey: ['supplier-catalog', id], queryFn: () => supplierService.catalog(id) });
  const pos = useQuery({ queryKey: ['purchase-orders', { supplierId: id }], queryFn: () => purchaseOrderService.list({ supplierId: id }) });
  const prs = useQuery({ queryKey: ['purchase-requests', { supplierId: id }], queryFn: () => purchaseRequestService.list({ supplierId: id }) });
  return (
    <div>
      <BackLink href="/suppliers" label={t('suppliers.title')} />
      <QueryView query={q} loading={<LoadingState variant="detail" />}>
        {({ supplier: s, ...k }) => (
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight" data-testid="supplier-name">{s.name}</h1>
                  <p className="mt-1 text-sm text-muted-foreground"><span className="font-mono">{s.code}</span> · {t('suppliers.terms', { terms: s.paymentTerms })}</p>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                    <a href={`tel:${s.phone}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"><Phone className="h-4 w-4" aria-hidden="true" />{s.contactName} · {s.phone}</a>
                    <a href={`mailto:${s.email}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"><Mail className="h-4 w-4" aria-hidden="true" />{s.email}</a>
                    <span className="flex items-center gap-1.5 text-muted-foreground"><MapPin className="h-4 w-4" aria-hidden="true" />{s.address.line1}, {s.address.city}</span>
                  </div>
                </div>
                <Button asChild><Link href="/purchase-requests/new"><PlusCircle className="me-2 h-4 w-4" aria-hidden="true" />{t('purchaseRequests.new')}</Link></Button>
              </div>
            </Card>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard label={t('suppliers.kpi.openPos')} value={k.openPos} hint={fmtMoney(k.openPoValue)} icon={Truck} />
              <KpiCard label={t('suppliers.kpi.openRequests')} value={k.openRequests} icon={FileInput} />
              <KpiCard label={t('suppliers.kpi.received')} value={fmtMoney(k.receivedValue)} icon={ClipboardList} />
              <KpiCard label={t('suppliers.kpi.onTime')} value={k.onTimePct !== undefined ? `${k.onTimePct}%` : '—'} icon={Timer} tone={k.onTimePct !== undefined && k.onTimePct < 80 ? 'warning' : 'default'} />
            </div>
            <Tabs defaultValue="products">
              <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
                <TabsTrigger value="products">{t('suppliers.tabs.products')}</TabsTrigger>
                <TabsTrigger value="orders" data-testid="supplier-tab-orders">{t('nav.purchaseOrders')}</TabsTrigger>
                <TabsTrigger value="requests">{t('nav.purchaseRequests')}</TabsTrigger>
                <TabsTrigger value="contacts">{t('suppliers.tabs.logins')}</TabsTrigger>
              </TabsList>
              <TabsContent value="products">
                <Card className="overflow-x-auto">
                  {cat.data ? (
                    <table className="w-full min-w-[560px] text-sm">
                      <thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-4 py-2.5 text-start font-medium">{t('inventory.col.product')}</th><th className="px-3 py-2.5 text-end font-medium">{t('supplierCatalog.ourStock')}</th><th className="px-4 py-2.5 text-end font-medium">{t('purchaseRequests.cost')}</th></tr></thead>
                      <tbody className="divide-y">{cat.data.map(({ product: p, unitCost, low }) => (
                        <tr key={p.id}><td className="px-4 py-2.5"><RefLink href={`/inventory/${p.id}`} className="font-medium">{p.name}</RefLink><div className="font-mono text-[11px] text-muted-foreground">{p.sku}</div></td>
                          <td className="px-3 py-2.5 text-end tabular">{fmtNumber(p.stock)} {low && <StatusBadge status="low_stock" className="ms-1" />}</td><td className="px-4 py-2.5 text-end tabular">{fmtMoney(unitCost, true)}</td></tr>
                      ))}</tbody>
                    </table>
                  ) : <div className="p-4"><LoadingState rows={3} /></div>}
                </Card>
              </TabsContent>
              <TabsContent value="orders">
                <SectionCard title={t('nav.purchaseOrders')}>
                  {pos.data?.length ? <ul className="divide-y">{pos.data.map((o) => (
                    <li key={o.id}><Link href={`/purchase-orders/${o.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/40">
                      <div className="min-w-0"><div className="font-mono text-xs font-semibold">{o.number}</div><div className="text-xs text-muted-foreground">{fmtDate(o.date)} · {t('purchaseOrders.expected', { date: fmtDate(o.expectedDate) })}{o.site ? ` · ${o.site}` : ''}</div></div>
                      <div className="flex items-center gap-3"><span className="font-medium tabular">{fmtMoney(o.total)}</span><StatusBadge status={o.status} /></div>
                    </Link></li>
                  ))}</ul> : <div className="p-4"><EmptyState title={t('purchaseOrders.empty')} /></div>}
                </SectionCard>
              </TabsContent>
              <TabsContent value="requests">
                <SectionCard title={t('nav.purchaseRequests')}>
                  {prs.data?.length ? <ul className="divide-y">{prs.data.map((r) => (
                    <li key={r.id}><Link href={`/purchase-requests/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/40">
                      <div className="min-w-0"><div className="font-mono text-xs font-semibold">{r.number}</div><div className="text-xs text-muted-foreground">{t(`purchaseRequests.source.${r.source}`)} · {fmtDate(r.date)}</div></div>
                      <div className="flex items-center gap-3"><span className="font-medium tabular">{fmtMoney(r.total)}</span><StatusBadge status={r.status} /></div>
                    </Link></li>
                  ))}</ul> : <div className="p-4"><EmptyState title={t('purchaseRequests.empty')} /></div>}
                </SectionCard>
              </TabsContent>
              <TabsContent value="contacts">
                <SectionCard title={t('suppliers.tabs.logins')}>
                  {k.users.length ? <ul className="divide-y">{k.users.map((u) => (
                    <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><div><RefLink href={`/users/${u.id}`} className="font-medium">{u.name}</RefLink><div className="text-xs text-muted-foreground">{u.email}</div></div><StatusBadge status={u.status} /></li>
                  ))}</ul> : <p className="p-4 text-sm text-muted-foreground">{t('suppliers.noLogins')}</p>}
                </SectionCard>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </QueryView>
    </div>
  );
}
