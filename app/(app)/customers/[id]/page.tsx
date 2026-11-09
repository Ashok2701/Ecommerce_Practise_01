'use client';
import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { PlusCircle, RotateCcw, Phone, Mail, MapPin, Wallet, CreditCard, CalendarClock, Receipt, ShieldAlert, MessageSquare, ClipboardList, Zap, FileSignature } from 'lucide-react';
import { VisitReportSheet, VisitReportList } from '@/features/visits/VisitReport';
import {
  customerService, orderService, productService, offerService, userService, requestService, quoteService, invoiceService, paymentService, deliveryService, consignmentService,
} from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useAccess } from '@/lib/auth/permissions';
import { useCart } from '@/lib/cart/CartProvider';
import { customerUnitPrice, offersFor } from '@/lib/domain/pricing';
import { OfferBadge } from '@/features/offers/OfferBits';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtMoney } from '@/lib/format';
import { QueryView, LoadingState, KpiCard, SectionCard, EmptyState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BackLink, RefLink } from '@/features/detail/DetailBits';
import { DocList } from '@/features/detail/DocList';
import { useReorder } from '@/features/orders/useReorder';

function CustomerDetail() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const user = useUser();
  const { can } = useAccess(user.role);
  const router = useRouter();
  const cart = useCart();
  const reorder = useReorder();
  const tab = useSearchParams().get('tab') ?? 'orders';
  const [logVisit, setLogVisit] = useState(false);
  const scope = { customerId: id };
  const q = useQuery({ queryKey: ['customer', id], queryFn: () => customerService.getCustomer(id) });
  const orders = useQuery({ queryKey: ['orders', scope], queryFn: () => orderService.getOrders(scope) });
  const requests = useQuery({ queryKey: ['requests', scope], queryFn: () => requestService.list(scope) });
  const quotes = useQuery({ queryKey: ['quotes', scope], queryFn: () => quoteService.list(scope) });
  const invoices = useQuery({ queryKey: ['invoices', id], queryFn: () => invoiceService.getInvoices(id) });
  const payments = useQuery({ queryKey: ['payments', id], queryFn: () => paymentService.list(scope) });
  const deliveries = useQuery({ queryKey: ['deliveries', scope], queryFn: () => deliveryService.list(scope) });
  const consignments = useQuery({ queryKey: ['consignments', 'customer', id], queryFn: () => consignmentService.list(scope) });
  const products = useQuery({ queryKey: ['products', 'all'], queryFn: productService.getAll });
  const offers = useQuery({ queryKey: ['offers', 'pricing'], queryFn: offerService.pricing, staleTime: 5 * 60_000 });
  const reps = useQuery({ queryKey: ['reps'], queryFn: userService.getSalesReps });
  const purchases = useMemo(() => {
    const m: Record<string, { productId: string; name: string; sku: string; uom: string; qty: number; times: number; last: string }> = {};
    (orders.data ?? []).filter((o) => o.status !== 'cancelled').forEach((o) => o.lines.forEach((l) => {
      const e = m[l.productId] ?? { productId: l.productId, name: l.name, sku: l.sku, uom: l.uom, qty: 0, times: 0, last: o.date };
      e.qty += l.quantity; e.times += 1; if (o.date > e.last) e.last = o.date; m[l.productId] = e;
    }));
    return Object.values(m).sort((a, b) => b.times - a.times);
  }, [orders.data]);
  const rep = user.role === 'SALES_REP';

  return (
    <div>
      <BackLink href="/customers" label={t('nav.customers')} />
      <QueryView query={q} loading={<LoadingState variant="detail" />}>
        {(c) => {
          if (rep && c.salesRepId !== user.id) return <EmptyState icon={ShieldAlert} title={t('customers.detail.notYours')} description={t('customers.detail.notYoursText')} />;
          const lastOrder = orders.data?.find((o) => ['delivered', 'dispatched', 'confirmed'].includes(o.status));
          const available = Math.max(0, c.creditLimit - c.outstanding);
          const repUser = reps.data?.find((r) => r.id === c.salesRepId);
          const openInv = (invoices.data ?? []).filter((i) => i.status !== 'paid');
          const startOrder = () => { cart.setCustomer(c.id); router.push('/catalog'); };
          return (
            <div className="space-y-4">
              <Card className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold tracking-tight" data-testid="customer-name">{c.name}</h1><StatusBadge status={c.status} /></div>
                    <p className="mt-1 text-sm text-muted-foreground"><span className="font-mono">{c.code}</span>{c.gstin ? ` · GSTIN ${c.gstin}` : ''} · {t('customers.detail.tier', { tier: c.priceTier, pct: c.tierDiscountPct })} · {t('customers.detail.since', { date: fmtDate(c.since) })}</p>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                      <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"><Phone className="h-4 w-4" aria-hidden="true" />{c.contactName} · {c.phone}</a>
                      <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"><Mail className="h-4 w-4" aria-hidden="true" />{c.email}</a>
                      <span className="flex items-center gap-1.5 text-muted-foreground"><MapPin className="h-4 w-4" aria-hidden="true" />{c.address.line1}, {c.address.city}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {rep && <><Button onClick={startOrder} disabled={c.status === 'inactive'} className="h-11 sm:h-10" data-testid="customer-create-order"><PlusCircle className="me-2 h-4 w-4" aria-hidden="true" />{t('customers.detail.createOrder')}</Button>
                      {lastOrder && <Button variant="outline" className="h-11 sm:h-10" onClick={() => reorder(lastOrder)} data-testid="customer-quick-reorder"><RotateCcw className="me-2 h-4 w-4" aria-hidden="true" />{t('customers.detail.repeatLast')}</Button>}
                      <Button variant="outline" className="h-11 sm:h-10" onClick={() => { cart.setCustomer(c.id); router.push('/quick-order'); }} disabled={c.status === 'inactive'}><Zap className="me-2 h-4 w-4" aria-hidden="true" />{t('nav.quickOrder')}</Button>
                      <Button variant="outline" className="h-11 sm:h-10" onClick={() => setLogVisit(true)} data-testid="log-visit"><ClipboardList className="me-2 h-4 w-4" aria-hidden="true" />{t('customers.detail.logVisit')}</Button></>}
                    {can('quotes') && <Button variant="outline" className="h-11 sm:h-10" asChild><Link href={`/quotes/new?customer=${c.id}`}><FileSignature className="me-2 h-4 w-4" aria-hidden="true" />{t('quotes.new')}</Link></Button>}
                    <Button variant="outline" className="h-11 sm:h-10" asChild><Link href="/messages"><MessageSquare className="me-2 h-4 w-4" aria-hidden="true" />{t('customers.detail.message')}</Link></Button>
                  </div>
                </div>
              </Card>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiCard label={t('account.outstanding')} value={fmtMoney(c.outstanding)} icon={Wallet} tone={c.outstanding > c.creditLimit * 0.8 ? 'danger' : 'default'} />
                <KpiCard label={t('account.creditLimit')} value={fmtMoney(c.creditLimit)} icon={CreditCard} hint={t('customers.detail.available', { amount: fmtMoney(available) })} />
                <KpiCard label={t('customers.detail.lastOrder')} value={c.lastOrderAmount ? fmtMoney(c.lastOrderAmount) : '—'} icon={CalendarClock} hint={fmtDate(c.lastOrderDate)} />
                <KpiCard label={t('customers.detail.salesRep')} value={<span className="text-base">{repUser ? <RefLink href={`/sales-reps/${repUser.id}`}>{repUser.name}</RefLink> : '—'}</span>} icon={Receipt} hint={c.paymentTerms} />
              </div>
              <Tabs defaultValue={tab}>
                <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
                  <TabsTrigger value="orders">{t('nav.orders')}</TabsTrigger>
                  <TabsTrigger value="requests">{t('nav.requests')}</TabsTrigger>
                  <TabsTrigger value="quotes">{t('nav.quotes')}</TabsTrigger>
                  <TabsTrigger value="finance" data-testid="tab-finance">{t('customers.detail.finance')}</TabsTrigger>
                  <TabsTrigger value="deliveries">{t('nav.deliveries')}</TabsTrigger>
                  {!!consignments.data?.length && <TabsTrigger value="consignment">{t('nav.consignment')}</TabsTrigger>}
                  <TabsTrigger value="purchases">{t('customers.detail.purchases')}</TabsTrigger>
                  <TabsTrigger value="pricing">{t('customers.detail.pricing')}</TabsTrigger>
                  <TabsTrigger value="visits" data-testid="tab-visits">{t('customers.detail.visits')}</TabsTrigger>
                </TabsList>
                <TabsContent value="orders"><SectionCard title={t('nav.orders')}>{orders.data ? <DocList empty={t('reps.noOrders')} rows={orders.data.slice(0, 20).map((o) => ({ id: o.id, href: `/orders/${o.id}`, number: o.number, sub: `${fmtDate(o.date)}${o.poNumber ? ` · PO ${o.poNumber}` : ''}`, amount: fmtMoney(o.total), status: o.status }))} /> : <div className="p-4"><LoadingState rows={3} /></div>}</SectionCard></TabsContent>
                <TabsContent value="requests"><SectionCard title={t('nav.requests')}>{requests.data ? <DocList empty={t('requests.empty')} rows={requests.data.map((r) => ({ id: r.id, href: `/requests/${r.id}`, number: r.number, sub: `${fmtDate(r.date)} · ${r.createdBy.name}`, amount: fmtMoney(r.total), status: r.status }))} /> : <div className="p-4"><LoadingState rows={3} /></div>}</SectionCard></TabsContent>
                <TabsContent value="quotes"><SectionCard title={t('nav.quotes')}>{quotes.data ? <DocList empty={t('quotes.empty')} rows={quotes.data.map((x) => ({ id: x.id, href: `/quotes/${x.id}`, number: x.number, sub: `${fmtDate(x.date)}${x.validUntil ? ` · ${t('quotes.validUntilDate', { date: fmtDate(x.validUntil) })}` : ''}`, amount: fmtMoney(x.total), status: x.status }))} /> : <div className="p-4"><LoadingState rows={3} /></div>}</SectionCard></TabsContent>
                <TabsContent value="finance">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <SectionCard title={t('collections.openInvoices')} action={can('collections') ? <Link href={`/collections?customer=${c.id}`} className="text-xs font-medium text-primary">{t('nav.collections')}</Link> : undefined}>
                      <DocList testId="customer-invoices" empty={t('account.noDues')} rows={openInv.map((i) => ({ id: i.id, href: `/invoices/${i.id}`, number: i.number, sub: t('invoices.due', { date: fmtDate(i.dueDate) }), amount: fmtMoney(i.amount - i.paid), status: i.status }))} />
                    </SectionCard>
                    <SectionCard title={t('account.paymentHistory')}>
                      <DocList empty={t('account.noPayments')} rows={(payments.data ?? []).slice(0, 15).map((p) => ({ id: p.id, href: `/payments/${p.id}`, number: p.number ?? p.reference, sub: `${fmtDate(p.date)} · ${t(`payments.methods.${p.method}`)}`, amount: fmtMoney(p.amount), status: p.status ?? 'posted' }))} />
                    </SectionCard>
                    <SectionCard title={t('customers.detail.paidInvoices')} className="lg:col-span-2">
                      <DocList empty={t('account.noPayments')} rows={(invoices.data ?? []).filter((i) => i.status === 'paid').slice(0, 10).map((i) => ({ id: i.id, href: `/invoices/${i.id}`, number: i.number, sub: fmtDate(i.date), amount: fmtMoney(i.amount), status: i.status }))} />
                    </SectionCard>
                  </div>
                </TabsContent>
                <TabsContent value="deliveries"><SectionCard title={t('nav.deliveries')}>{deliveries.data ? <DocList empty={t('deliveries.empty')} rows={deliveries.data.map((d) => ({ id: d.id, href: `/deliveries/${d.id}`, number: d.number, sub: `${d.orderNumber} · ${t('deliveries.plannedFor', { date: fmtDate(d.plannedDate) })}`, status: d.status }))} /> : <div className="p-4"><LoadingState rows={3} /></div>}</SectionCard></TabsContent>
                <TabsContent value="consignment"><SectionCard title={t('nav.consignment')}><DocList empty={t('consignment.empty')} rows={(consignments.data ?? []).map((x) => ({ id: x.id, href: `/consignment/${x.id}`, number: x.number, sub: `${x.site} · ${x.location}`, extra: <span className="text-xs text-muted-foreground">{t('consignment.belowMin', { count: x.lines.filter((l) => l.low).length })}</span> }))} /></SectionCard></TabsContent>
                <TabsContent value="visits"><VisitReportList customerId={c.id} /></TabsContent>
                <TabsContent value="purchases">
                  <SectionCard title={t('customers.detail.frequent')}>
                    <ul className="divide-y">{purchases.map((p) => (
                      <li key={p.productId} className="flex items-center gap-3 px-4 py-3 text-sm"><div className="min-w-0 flex-1"><RefLink href={rep ? `/catalog/${p.productId}` : `/inventory/${p.productId}`} className="font-medium">{p.name}</RefLink><div className="font-mono text-[11px] text-muted-foreground">{p.sku}</div></div><div className="text-end text-xs text-muted-foreground"><div>{t('customers.detail.timesOrdered', { count: p.times, qty: p.qty, uom: p.uom })}</div><div>{t('customers.detail.lastOn', { date: fmtDate(p.last) })}</div></div>
                        {rep && <Button size="sm" variant="outline" onClick={() => { cart.setCustomer(c.id); cart.add(p.productId, Math.max(1, Math.round(p.qty / p.times))); router.push('/cart'); }}>{t('customers.detail.add')}</Button>}</li>
                    ))}{!purchases.length && <li className="p-4"><EmptyState title={t('customers.detail.noPurchases')} /></li>}</ul>
                  </SectionCard>
                </TabsContent>
                <TabsContent value="pricing">
                  <SectionCard title={t('customers.detail.priceList')} action={<span className="text-xs text-muted-foreground">{t('customers.detail.priceListHint', { tier: c.priceTier })}</span>}>
                    <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-4 py-2 text-start font-medium">{t('inventory.col.product')}</th><th className="px-4 py-2 text-end font-medium">{t('offers.listPrice')}</th><th className="px-4 py-2 text-end font-medium">{t('customers.detail.customerPrice')}</th><th className="px-4 py-2 text-end font-medium">{t('nav.offers')}</th></tr></thead>
                      <tbody className="divide-y">{(products.data ?? []).map((p) => { const cp = customerUnitPrice(p, c); const off = offersFor(p, { customer: c }, offers.data ?? [])[0]; return (
                        <tr key={p.id} className={c.contractPrices[p.id] ? 'bg-blue-50/50 dark:bg-blue-500/5' : ''}><td className="px-4 py-2"><div className="font-medium">{p.name}</div><div className="font-mono text-[11px] text-muted-foreground">{p.sku} · {p.uom}</div></td><td className="px-4 py-2 text-end tabular text-muted-foreground">{fmtMoney(p.basePrice, true)}</td><td className="px-4 py-2 text-end font-medium tabular">{fmtMoney(cp, true)}{c.contractPrices[p.id] && <div className="text-[10px] font-semibold uppercase text-blue-700 dark:text-blue-300">{t('customers.detail.contract')}</div>}</td><td className="px-4 py-2 text-end text-emerald-700 dark:text-emerald-400">{off ? <OfferBadge offer={off} link /> : '—'}</td></tr>
                      ); })}</tbody></table></div>
                  </SectionCard>
                </TabsContent>
              </Tabs>
              {rep && <VisitReportSheet open={logVisit} onOpenChange={setLogVisit} customerId={c.id} />}
            </div>
          );
        }}
      </QueryView>
    </div>
  );
}

export default function CustomerDetailPage() { return <Suspense><CustomerDetail /></Suspense>; }
