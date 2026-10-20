'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Truck, PackageCheck, ShieldCheck, ShoppingCart, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { productService, offerService } from '@/lib/services';
import { useT } from '@/lib/i18n';
import { useCart, usePricedCart } from '@/lib/cart/CartProvider';
import { customerUnitPrice, offerFor, stockStatus } from '@/lib/domain/pricing';
import { fmtDate, fmtMoney, fmtNumber } from '@/lib/format';
import { QueryView, LoadingState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ProductImage, QtyStepper } from '@/components/common/ProductBits';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { OrderContextBar } from '@/features/orders/OrderContextBar';

export default function ProductDetailPage() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const cart = useCart();
  const { customer } = usePricedCart();
  const q = useQuery({ queryKey: ['product', id], queryFn: () => productService.getProduct(id) });
  const offers = useQuery({ queryKey: ['offers', 'manage'], queryFn: () => offerService.list({ manage: true }) });
  const [qty, setQty] = useState<number | null>(null);
  return (
    <div>
      <OrderContextBar step="products" />
      <Link href="/catalog" className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="mr-1 h-4 w-4" />Back to catalog</Link>
      <QueryView query={q} loading={<LoadingState variant="detail" />}>
        {(p) => {
          const price = customerUnitPrice(p, customer);
          const offer = offerFor(p.id, customer, offers.data ?? []);
          const net = offer ? price * (1 - offer.discountPct / 100) : price;
          const quantity = qty ?? p.moq;
          const add = () => { if (quantity < p.moq) return toast.error(`Minimum order quantity is ${p.moq} ${p.uom}`); cart.add(p.id, quantity); toast.success(`Added ${quantity} ${p.uom} to cart`); };
          return (
            <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
              <div className="space-y-4">
                <Card className="overflow-hidden"><ProductImage src={p.image} alt={p.name} className="aspect-[4/3]" /></Card>
                <Card className="overflow-hidden">
                  <h2 className="border-b px-4 py-3 text-sm font-semibold">Specifications</h2>
                  <dl className="divide-y text-sm">{Object.entries(p.specs).concat([['Brand', p.brand], ['Pack size', p.packSize], ['HSN / Tax', `GST ${p.taxRatePct}%`]]).map(([k, v]) => <div key={k} className="grid grid-cols-2 px-4 py-2.5"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>)}</dl>
                </Card>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-muted-foreground">{p.sku}</span><StatusBadge status={stockStatus(p)} /><span className="text-xs text-muted-foreground">{p.category}</span></div>
                  <h1 className="mt-2 text-2xl font-semibold tracking-tight">{p.name}</h1>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.description}</p>
                </div>
                <Card className="p-5">
                  <div className="text-xs font-medium text-muted-foreground">Your price{customer ? ` · ${customer.name}` : ''}</div>
                  <div className="mt-1 flex items-baseline gap-2"><span className="text-3xl font-semibold tabular" data-testid="pdp-price">{fmtMoney(net, true)}</span><span className="text-sm text-muted-foreground">per {p.uom}</span></div>
                  <div className="mt-1 text-sm text-muted-foreground">List price <span className="line-through">{fmtMoney(p.basePrice, true)}</span>{customer?.contractPrices[p.id] ? ' · contract price applied' : customer ? ` · Tier ${customer.priceTier} discount ${customer.tierDiscountPct}%` : ''}</div>
                  {offer && <div className="mt-3 flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><Tag className="h-4 w-4" /><span><b>{offer.title}</b> – extra {offer.discountPct}% till {fmtDate(offer.validTo)}</span></div>}
                  <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                    <div className="rounded-md bg-muted/60 p-2.5"><dt className="text-xs text-muted-foreground">UOM</dt><dd className="font-semibold">{p.uom}</dd></div>
                    <div className="rounded-md bg-muted/60 p-2.5"><dt className="text-xs text-muted-foreground">MOQ</dt><dd className="font-semibold">{p.moq}</dd></div>
                    <div className="rounded-md bg-muted/60 p-2.5"><dt className="text-xs text-muted-foreground">Available</dt><dd className="font-semibold tabular">{fmtNumber(p.stock)}</dd>{!!p.otherSites?.length && <dd className="mt-1 text-[11px] text-muted-foreground" data-testid="pdp-other-sites">{t('sites.alsoAt')}: {p.otherSites.map((o) => `${o.site} ${fmtNumber(o.stock)}`).join(' · ')}</dd>}</div>
                  </dl>
                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <QtyStepper value={quantity} onChange={setQty} step={p.moq} min={p.moq} />
                    <Button className="h-10 flex-1" onClick={add} disabled={p.stock <= 0} data-testid="pdp-add"><ShoppingCart className="mr-2 h-4 w-4" />{p.stock <= 0 ? 'Out of stock' : `Add to cart · ${fmtMoney(net * quantity)}`}</Button>
                  </div>
                  {quantity % p.moq !== 0 && <p className="mt-2 text-xs text-amber-700">Tip: order in multiples of {p.moq} {p.uom} ({p.packSize}).</p>}
                  <Button variant="outline" className="mt-3 w-full" onClick={() => router.push('/cart')}>Go to cart ({cart.count})</Button>
                </Card>
                <ul className="grid gap-2 text-sm sm:grid-cols-3">
                  <li className="flex items-center gap-2 rounded-md border bg-card p-3"><Truck className="h-4 w-4 text-primary" />Ships in {p.leadTimeDays} day{p.leadTimeDays > 1 ? 's' : ''}</li>
                  <li className="flex items-center gap-2 rounded-md border bg-card p-3"><PackageCheck className="h-4 w-4 text-primary" />{p.packSize}</li>
                  <li className="flex items-center gap-2 rounded-md border bg-card p-3"><ShieldCheck className="h-4 w-4 text-primary" />Genuine {p.brand}</li>
                </ul>
              </div>
            </div>
          );
        }}
      </QueryView>
    </div>
  );
}
