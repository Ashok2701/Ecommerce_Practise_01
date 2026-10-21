'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ShoppingCart, Trash2, Truck, AlertTriangle, ArrowRight, FileSignature } from 'lucide-react';
import { quoteService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePricedCart } from '@/lib/cart/CartProvider';
import { useErrorText, useT } from '@/lib/i18n';
import { fmtMoney } from '@/lib/format';
import { PageHeader, EmptyState, LoadingState } from '@/components/common';
import { ProductImage, QtyStepper } from '@/components/common/ProductBits';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { OrderContextBar } from '@/features/orders/OrderContextBar';
import { OrderSummary } from '@/features/orders/OrderSummary';

export default function CartPage() {
  const { t } = useT();
  const errorText = useErrorText();
  const router = useRouter();
  const user = useUser();
  const { cart, customer, totals, items, loading } = usePricedCart();
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [note, setNote] = useState('');
  // B2B customers and reps can ask for (or start) a quote instead of ordering at today's prices
  const canQuote = customer?.type === 'B2B' && ['CUSTOMER_B2B', 'SALES_REP', 'SUPERVISOR'].includes(user.role);
  const quote = useMutation({
    mutationFn: () => quoteService.create({ customerId: customer!.id, items: cart.items, note, actor: { id: user.id, name: user.name, role: user.role } }),
    onSuccess: (x) => { cart.clear(); setQuoteOpen(false); toast.success(t('quotes.requested', { number: x.number })); router.push(`/quotes/${x.id}`); },
    onError: (e) => toast.error(errorText(e)),
  });
  const available = customer ? Math.max(0, customer.creditLimit - customer.outstanding) : 0;
  const overCredit = !!customer && totals.total > available;
  if (loading) return <LoadingState />;
  return (
    <div>
      <OrderContextBar step="cart" />
      <PageHeader title={t('cart.title')} description={items.length ? `${t('cart.products', { count: items.length })}${customer ? ` · ${customer.name}` : ''}` : undefined} actions={items.length ? <Button variant="ghost" onClick={cart.clear} className="text-muted-foreground"><Trash2 className="me-2 h-4 w-4" aria-hidden="true" />{t('cart.clear')}</Button> : null} />
      {!items.length ? (
        <EmptyState icon={ShoppingCart} title={t('cart.empty')} description={t('cart.emptyHint')} action={<Button asChild><Link href="/catalog">{t('cart.browse')}</Link></Button>} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <Card className="divide-y" data-testid="cart-lines">
              <div className="hidden grid-cols-[1fr_120px_140px_110px_120px_40px] gap-3 bg-muted/50 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid"><span>{t('inventory.col.product')}</span><span className="text-right">{t('common.unitPrice')}</span><span className="text-center">{t('common.quantity')}</span><span className="text-right">{t('common.discount')}</span><span className="text-right">{t('requests.detail.lineTotal')}</span><span /></div>
              {totals.lines.map((l) => { const p = items.find((i) => i.product.id === l.productId)!.product; return (
                <div key={l.productId} className="grid grid-cols-[64px_1fr] gap-3 p-4 md:grid-cols-[1fr_120px_140px_110px_120px_40px] md:items-center">
                  <div className="flex min-w-0 gap-3 md:col-span-1 max-md:contents">
                    <ProductImage src={l.image} alt={l.name} className="h-16 w-16 shrink-0 rounded-md" />
                    <div className="min-w-0"><Link href={`/catalog/${l.productId}`} className="line-clamp-2 text-sm font-medium hover:text-primary">{l.name}</Link><div className="font-mono text-[11px] text-muted-foreground">{l.sku} · {p.packSize}</div>{l.quantity < p.moq && <div className="mt-1 flex items-center gap-1 text-xs text-amber-700"><AlertTriangle className="h-3 w-3" aria-hidden="true" />{t('cart.belowMoq', { moq: p.moq })}</div>}<div className="mt-1 text-xs text-muted-foreground md:hidden">{fmtMoney(l.unitPrice, true)} / {l.uom}{l.discountPct ? <span className="text-emerald-700"> · −{l.discountPct}%</span> : null}</div></div>
                  </div>
                  <div className="hidden text-right text-sm tabular md:block">{fmtMoney(l.unitPrice, true)}<div className="text-[11px] text-muted-foreground">{t('cart.perUom', { uom: l.uom })}</div></div>
                  <div className="col-start-2 flex items-center justify-between gap-2 md:col-start-auto md:justify-center">
                    <QtyStepper value={l.quantity} onChange={(v) => cart.setQty(l.productId, v)} step={p.moq} min={0} size="sm" label={t('cart.qtyFor', { name: l.name })} />
                    <span className="text-sm font-semibold tabular md:hidden">{fmtMoney(l.lineTotal, true)}</span>
                  </div>
                  <div className="hidden text-right text-sm tabular text-emerald-700 md:block">{l.discountPct ? `−${l.discountPct}%` : '—'}</div>
                  <div className="hidden text-right text-sm font-semibold tabular md:block">{fmtMoney(l.lineTotal, true)}</div>
                  <div className="col-start-2 md:col-start-auto"><Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => cart.remove(l.productId)} aria-label={t('cart.remove', { name: l.name })}><Trash2 className="h-4 w-4" /></Button></div>
                </div>
              ); })}
            </Card>
            <Card className="p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><Truck className="h-4 w-4 text-primary" aria-hidden="true" />{t('cart.deliveryInfo')}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{customer?.address.line1}, {customer?.address.city}, {customer?.address.state} {customer?.address.postalCode}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('cart.deliveryText')}</p>
            </Card>
          </div>
          <div className="space-y-3 lg:sticky lg:top-24 lg:self-start">
            <OrderSummary totals={totals}>
              {overCredit && <div className="mt-4 flex gap-2 rounded-md bg-amber-50 p-3 text-xs text-amber-900" role="alert"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />{t('cart.overCredit', { available: fmtMoney(available) })}</div>}
              <Button className="mt-4 hidden h-11 w-full md:flex" onClick={() => router.push('/checkout')} data-testid="cart-checkout">{t('cart.checkout')}<ArrowRight className="ms-2 h-4 w-4 rtl:rotate-180" aria-hidden="true" /></Button>
              {canQuote && <Button variant="outline" className="mt-2 w-full" onClick={() => setQuoteOpen(true)} data-testid="cart-request-quote"><FileSignature className="me-2 h-4 w-4" aria-hidden="true" />{user.role === 'CUSTOMER_B2B' ? t('cart.requestQuote') : t('cart.startQuote')}</Button>}
              <Button variant="ghost" className="mt-1 hidden w-full md:flex" asChild><Link href="/catalog">{t('cart.continue')}</Link></Button>
            </OrderSummary>
          </div>
          <Dialog open={quoteOpen} onOpenChange={setQuoteOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>{t('cart.requestQuote')}</DialogTitle><DialogDescription>{t('cart.quoteText')}</DialogDescription></DialogHeader>
              <div className="space-y-1.5"><Label htmlFor="qnote">{t('quotes.noteCustomer')}</Label><Textarea id="qnote" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('quotes.notePlaceholder')} data-testid="cart-quote-note" /></div>
              <DialogFooter className="gap-2"><Button variant="ghost" onClick={() => setQuoteOpen(false)}>{t('common.cancel')}</Button><Button onClick={() => quote.mutate()} disabled={quote.isPending} data-testid="cart-quote-send">{t('quotes.sendRequest')}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
          <div className="fixed inset-x-0 bottom-16 z-20 border-t bg-card p-3 pb-safe md:hidden">
            <Button className="h-12 w-full justify-between" onClick={() => router.push('/checkout')} data-testid="cart-checkout-mobile"><span>{t('cart.checkout')}</span><span className="tabular">{fmtMoney(totals.total)} →</span></Button>
          </div>
        </div>
      )}
    </div>
  );
}
