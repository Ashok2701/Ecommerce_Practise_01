'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, PlusCircle, RotateCcw, Phone, Mail, MapPin, Wallet, CreditCard, CalendarClock, Receipt, ShieldAlert, MessageSquare, ClipboardList, Zap } from 'lucide-react';
import { VisitReportSheet, VisitReportList } from '@/features/visits/VisitReport';
import { customerService, orderService, productService, offerService, userService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useCart } from '@/lib/cart/CartProvider';
import { customerUnitPrice, offerFor } from '@/lib/domain/pricing';
import { fmtDate, fmtMoney } from '@/lib/format';
import { QueryView, LoadingState, KpiCard, SectionCard, EmptyState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OrderMiniList } from '@/features/dashboard/AdminDashboard';
import { useReorder } from '@/features/orders/useReorder';

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const user = useUser();
  const router = useRouter();
  const cart = useCart();
  const reorder = useReorder();
  const tab = useSearchParams().get('tab') ?? 'orders';
  const [logVisit, setLogVisit] = useState(false);
  const q = useQuery({ queryKey: ['customer', id], queryFn: () => customerService.getCustomer(id) });
  const orders = useQuery({ queryKey: ['orders', { customerId: id }], queryFn: () => orderService.getOrders({ customerId: id }) });
  const products = useQuery({ queryKey: ['products', 'all'], queryFn: productService.getAll });
  const offers = useQuery({ queryKey: ['offers', 'manage'], queryFn: () => offerService.list({ manage: true }) });
  const reps = useQuery({ queryKey: ['reps'], queryFn: userService.getSalesReps });
  const purchases = useMemo(() => {
    const m: Record<string, { productId: string; name: string; sku: string; uom: string; qty: number; times: number; last: string }> = {};
    (orders.data ?? []).filter((o) => o.status !== 'cancelled').forEach((o) => o.lines.forEach((l) => {
      const e = m[l.productId] ?? { productId: l.productId, name: l.name, sku: l.sku, uom: l.uom, qty: 0, times: 0, last: o.date };
      e.qty += l.quantity; e.times += 1; if (o.date > e.last) e.last = o.date; m[l.productId] = e;
    }));
    return Object.values(m).sort((a, b) => b.times - a.times);
  }, [orders.data]);

  return (
    <div>
      <Link href="/customers" className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="mr-1 h-4 w-4" />Customers</Link>
      <QueryView query={q} loading={<LoadingState variant="detail" />}>
        {(c) => {
          if (user.role === 'SALES_REP' && c.salesRepId !== user.id) return <EmptyState icon={ShieldAlert} title="Not assigned to you" description="This customer belongs to another sales representative's territory." />;
          const lastOrder = orders.data?.find((o) => ['delivered', 'dispatched', 'confirmed'].includes(o.status));
          const available = Math.max(0, c.creditLimit - c.outstanding);
          const startOrder = () => { cart.setCustomer(c.id); router.push('/catalog'); };
          return (
            <div className="space-y-4">
              <Card className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold tracking-tight">{c.name}</h1><StatusBadge status={c.status} /></div>
                    <p className="mt-1 text-sm text-muted-foreground"><span className="font-mono">{c.code}</span> · GSTIN {c.gstin} · Tier {c.priceTier} ({c.tierDiscountPct}% off list) · Customer since {fmtDate(c.since)}</p>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                      <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"><Phone className="h-4 w-4" />{c.contactName} · {c.phone}</a>
                      <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"><Mail className="h-4 w-4" />{c.email}</a>
                      <span className="flex items-center gap-1.5 text-muted-foreground"><MapPin className="h-4 w-4" />{c.address.line1}, {c.address.city}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {user.role === 'SALES_REP' && <><Button onClick={startOrder} disabled={c.status === 'inactive'} className="h-11 sm:h-10" data-testid="customer-create-order"><PlusCircle className="mr-2 h-4 w-4" />Create order</Button>
                      {lastOrder && <Button variant="outline" className="h-11 sm:h-10" onClick={() => reorder(lastOrder)} data-testid="customer-quick-reorder"><RotateCcw className="mr-2 h-4 w-4" />Repeat last order</Button>}</>}
                    {user.role === 'SALES_REP' && <Button variant="outline" className="h-11 sm:h-10" onClick={() => { cart.setCustomer(c.id); router.push('/quick-order'); }} disabled={c.status === 'inactive'}><Zap className="mr-2 h-4 w-4" />Quick order</Button>}
                    {user.role === 'SALES_REP' && <Button variant="outline" className="h-11 sm:h-10" onClick={() => setLogVisit(true)} data-testid="log-visit"><ClipboardList className="mr-2 h-4 w-4" />Log visit</Button>}
                    <Button variant="outline" className="h-11 sm:h-10" asChild><Link href="/messages"><MessageSquare className="mr-2 h-4 w-4" />Message</Link></Button>
                  </div>
                </div>
              </Card>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiCard label="Outstanding" value={fmtMoney(c.outstanding)} icon={Wallet} tone={c.outstanding > c.creditLimit * 0.8 ? 'danger' : 'default'} />
                <KpiCard label="Credit limit" value={fmtMoney(c.creditLimit)} icon={CreditCard} hint={`${fmtMoney(available)} available`} />
                <KpiCard label="Last order" value={c.lastOrderAmount ? fmtMoney(c.lastOrderAmount) : '—'} icon={CalendarClock} hint={fmtDate(c.lastOrderDate)} />
                <KpiCard label="Sales rep" value={<span className="text-base">{reps.data?.find((r) => r.id === c.salesRepId)?.name ?? '—'}</span>} icon={Receipt} hint={c.paymentTerms} />
              </div>
              <Tabs defaultValue={tab}>
                <TabsList className="w-full justify-start overflow-x-auto sm:w-auto"><TabsTrigger value="orders">Recent orders</TabsTrigger><TabsTrigger value="purchases">Previous purchases</TabsTrigger><TabsTrigger value="pricing">Customer pricing</TabsTrigger><TabsTrigger value="visits" data-testid="tab-visits">Visits</TabsTrigger></TabsList>
                <TabsContent value="visits"><VisitReportList customerId={c.id} /></TabsContent>
                <TabsContent value="orders"><SectionCard title={`Orders (${orders.data?.length ?? 0})`}>{orders.data ? (orders.data.length ? <OrderMiniList orders={orders.data.slice(0, 10)} /> : <div className="p-4"><EmptyState title="No orders yet" /></div>) : <div className="p-4"><LoadingState rows={3} /></div>}</SectionCard></TabsContent>
                <TabsContent value="purchases">
                  <SectionCard title="Frequently purchased">
                    <ul className="divide-y">{purchases.map((p) => (
                      <li key={p.productId} className="flex items-center gap-3 px-4 py-3 text-sm"><div className="min-w-0 flex-1"><Link href={`/catalog/${p.productId}`} className="font-medium hover:text-primary">{p.name}</Link><div className="font-mono text-[11px] text-muted-foreground">{p.sku}</div></div><div className="text-right text-xs text-muted-foreground"><div>{p.times}× ordered · {p.qty} {p.uom}</div><div>last {fmtDate(p.last)}</div></div>
                        {user.role === 'SALES_REP' && <Button size="sm" variant="outline" onClick={() => { cart.setCustomer(c.id); cart.add(p.productId, Math.max(1, Math.round(p.qty / p.times))); router.push('/cart'); }}>Add</Button>}</li>
                    ))}{!purchases.length && <li className="p-4"><EmptyState title="No purchases yet" /></li>}</ul>
                  </SectionCard>
                </TabsContent>
                <TabsContent value="pricing">
                  <SectionCard title="Customer-specific price list" action={<span className="text-xs text-muted-foreground">Tier {c.priceTier} · contract prices highlighted</span>}>
                    <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2 text-left font-medium">Product</th><th className="px-4 py-2 text-right font-medium">List</th><th className="px-4 py-2 text-right font-medium">Customer price</th><th className="px-4 py-2 text-right font-medium">Offer</th></tr></thead>
                      <tbody className="divide-y">{(products.data ?? []).map((p) => { const cp = customerUnitPrice(p, c); const off = offerFor(p.id, c, offers.data ?? []); return (
                        <tr key={p.id} className={c.contractPrices[p.id] ? 'bg-blue-50/50' : ''}><td className="px-4 py-2"><div className="font-medium">{p.name}</div><div className="font-mono text-[11px] text-muted-foreground">{p.sku} · {p.uom}</div></td><td className="px-4 py-2 text-right tabular text-muted-foreground">{fmtMoney(p.basePrice, true)}</td><td className="px-4 py-2 text-right font-medium tabular">{fmtMoney(cp, true)}{c.contractPrices[p.id] && <div className="text-[10px] font-semibold text-blue-700">CONTRACT</div>}</td><td className="px-4 py-2 text-right text-emerald-700">{off ? `−${off.discountPct}%` : '—'}</td></tr>
                      ); })}</tbody></table></div>
                  </SectionCard>
                </TabsContent>
              </Tabs>
              {user.role === 'SALES_REP' && <VisitReportSheet open={logVisit} onOpenChange={setLogVisit} customerId={c.id} />}
            </div>
          );
        }}
      </QueryView>
    </div>
  );
}
