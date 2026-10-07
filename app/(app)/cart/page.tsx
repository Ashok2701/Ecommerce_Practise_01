'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShoppingCart, Trash2, Truck, AlertTriangle, ArrowRight } from 'lucide-react';
import { usePricedCart } from '@/lib/cart/CartProvider';
import { useT } from '@/lib/i18n';
import { fmtMoney } from '@/lib/format';
import { PageHeader, EmptyState, LoadingState } from '@/components/common';
import { ProductImage, QtyStepper } from '@/components/common/ProductBits';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { OrderContextBar } from '@/features/orders/OrderContextBar';
import { OrderSummary } from '@/features/orders/OrderSummary';

export default function CartPage() {
  const { t } = useT();
  const router = useRouter();
  const { cart, customer, totals, items, loading } = usePricedCart();
  const available = customer ? Math.max(0, customer.creditLimit - customer.outstanding) : 0;
  const overCredit = !!customer && totals.total > available;
  if (loading) return <LoadingState />;
  return (
    <div>
      <OrderContextBar step="cart" />
      <PageHeader title={t('cart.title')} description={items.length ? `${items.length} products${customer ? ` · ${customer.name}` : ''}` : undefined} actions={items.length ? <Button variant="ghost" onClick={cart.clear} className="text-muted-foreground"><Trash2 className="mr-2 h-4 w-4" />Clear cart</Button> : null} />
      {!items.length ? (
        <EmptyState icon={ShoppingCart} title={t('cart.empty')} description={t('cart.emptyHint')} action={<Button asChild><Link href="/catalog">Browse catalog</Link></Button>} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <Card className="divide-y" data-testid="cart-lines">
              <div className="hidden grid-cols-[1fr_120px_140px_110px_120px_40px] gap-3 bg-muted/50 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid"><span>Product</span><span className="text-right">{t('common.unitPrice')}</span><span className="text-center">{t('common.quantity')}</span><span className="text-right">{t('common.discount')}</span><span className="text-right">Line total</span><span /></div>
              {totals.lines.map((l) => { const p = items.find((i) => i.product.id === l.productId)!.product; return (
                <div key={l.productId} className="grid grid-cols-[64px_1fr] gap-3 p-4 md:grid-cols-[1fr_120px_140px_110px_120px_40px] md:items-center">
                  <div className="flex min-w-0 gap-3 md:col-span-1 max-md:contents">
                    <ProductImage src={l.image} alt={l.name} className="h-16 w-16 shrink-0 rounded-md" />
                    <div className="min-w-0"><Link href={`/catalog/${l.productId}`} className="line-clamp-2 text-sm font-medium hover:text-primary">{l.name}</Link><div className="font-mono text-[11px] text-muted-foreground">{l.sku} · {p.packSize}</div>{l.quantity < p.moq && <div className="mt-1 flex items-center gap-1 text-xs text-amber-700"><AlertTriangle className="h-3 w-3" />Below MOQ of {p.moq}</div>}<div className="mt-1 text-xs text-muted-foreground md:hidden">{fmtMoney(l.unitPrice, true)} / {l.uom}{l.discountPct ? <span className="text-emerald-700"> · −{l.discountPct}%</span> : null}</div></div>
                  </div>
                  <div className="hidden text-right text-sm tabular md:block">{fmtMoney(l.unitPrice, true)}<div className="text-[11px] text-muted-foreground">per {l.uom}</div></div>
                  <div className="col-start-2 flex items-center justify-between gap-2 md:col-start-auto md:justify-center">
                    <QtyStepper value={l.quantity} onChange={(v) => cart.setQty(l.productId, v)} step={p.moq} min={0} size="sm" label={`Quantity for ${l.name}`} />
                    <span className="text-sm font-semibold tabular md:hidden">{fmtMoney(l.lineTotal, true)}</span>
                  </div>
                  <div className="hidden text-right text-sm tabular text-emerald-700 md:block">{l.discountPct ? `−${l.discountPct}%` : '—'}</div>
                  <div className="hidden text-right text-sm font-semibold tabular md:block">{fmtMoney(l.lineTotal, true)}</div>
                  <div className="col-start-2 md:col-start-auto"><Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => cart.remove(l.productId)} aria-label={`Remove ${l.name}`}><Trash2 className="h-4 w-4" /></Button></div>
                </div>
              ); })}
            </Card>
            <Card className="p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><Truck className="h-4 w-4 text-primary" />{t('cart.deliveryInfo')}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{customer?.address.line1}, {customer?.address.city}, {customer?.address.state} {customer?.address.postalCode}</p>
              <p className="mt-1 text-xs text-muted-foreground">Standard delivery from Hyderabad DC · estimated 4–6 business days · freight calculated by ERP.</p>
            </Card>
          </div>
          <div className="space-y-3 lg:sticky lg:top-24 lg:self-start">
            <OrderSummary totals={totals}>
              {overCredit && <div className="mt-4 flex gap-2 rounded-md bg-amber-50 p-3 text-xs text-amber-900" role="alert"><AlertTriangle className="h-4 w-4 shrink-0" />Order exceeds available credit ({fmtMoney(available)}). It will require additional manager approval.</div>}
              <Button className="mt-4 hidden h-11 w-full md:flex" onClick={() => router.push('/checkout')} data-testid="cart-checkout">{t('cart.checkout')}<ArrowRight className="ml-2 h-4 w-4" /></Button>
              <Button variant="outline" className="mt-2 hidden w-full md:flex" asChild><Link href="/catalog">Continue shopping</Link></Button>
            </OrderSummary>
          </div>
          <div className="fixed inset-x-0 bottom-16 z-20 border-t bg-card p-3 pb-safe md:hidden">
            <Button className="h-12 w-full justify-between" onClick={() => router.push('/checkout')} data-testid="cart-checkout-mobile"><span>{t('cart.checkout')}</span><span className="tabular">{fmtMoney(totals.total)} →</span></Button>
          </div>
        </div>
      )}
    </div>
  );
}
