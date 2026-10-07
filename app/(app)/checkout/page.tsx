'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CloudOff, MapPin, FileText, Loader2, Building2, ChevronLeft, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { orderService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { usePricedCart } from '@/lib/cart/CartProvider';
import { useUI } from '@/lib/ui/UIProvider';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtMoney } from '@/lib/format';
import { PageHeader, EmptyState, LoadingState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { OrderContextBar } from '@/features/orders/OrderContextBar';
import { OrderSummary } from '@/features/orders/OrderSummary';
import type { Address, Order } from '@/types/domain';

const Addr = ({ a }: { a?: Address }) => (a ? <p className="text-sm text-muted-foreground">{a.line1}<br />{a.city}, {a.state} {a.postalCode}<br />{a.country}</p> : null);

function Confirmation({ order }: { order: Order }) {
  const offline = order.status === 'pending_sync';
  return (
    <div className="mx-auto max-w-xl py-8 text-center" data-testid="order-confirmation">
      <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${offline ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{offline ? <CloudOff className="h-7 w-7" /> : <CheckCircle2 className="h-7 w-7" />}</div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{offline ? 'Order saved on this device' : 'Order submitted successfully'}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{offline ? 'You are offline. This order is queued and will be sent when you reconnect. It is NOT confirmed until the ERP accepts it.' : 'Your order has been sent for approval. You will be notified as soon as it is confirmed in the ERP.'}</p>
      <Card className="mt-6 p-5 text-left">
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div><dt className="text-xs text-muted-foreground">Order reference</dt><dd className="font-mono font-semibold" data-testid="confirmation-number">{order.number}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Status</dt><dd><StatusBadge status={order.status} /></dd></div>
          <div><dt className="text-xs text-muted-foreground">Customer</dt><dd className="font-medium">{order.customerName}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Total</dt><dd className="font-semibold tabular">{fmtMoney(order.total, true)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Items</dt><dd>{order.lines.length} products</dd></div>
          <div><dt className="text-xs text-muted-foreground">Expected delivery</dt><dd>{offline ? 'After sync' : fmtDate(order.expectedDelivery)}</dd></div>
        </dl>
      </Card>
      <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
        <Button asChild><Link href={`/orders/${order.id}`}>View order</Link></Button>
        <Button asChild variant="outline"><Link href="/orders">All orders</Link></Button>
        <Button asChild variant="ghost"><Link href="/catalog">Continue shopping</Link></Button>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  const { t } = useT();
  const user = useUser();
  const ui = useUI();
  const router = useRouter();
  const qc = useQueryClient();
  const { cart, customer, totals, items, loading } = usePricedCart();
  const [po, setPo] = useState('');
  const [notes, setNotes] = useState('');
  const [placed, setPlaced] = useState<Order | null>(null);
  const m = useMutation({
    mutationFn: () => orderService.createOrder({ customerId: customer!.id, items: cart.items, notes, poNumber: po || undefined, actor: { id: user.id, name: user.name, role: user.role }, offline: !ui.online }),
    onSuccess: (o) => { setPlaced(o); cart.clear(); qc.invalidateQueries(); toast.success(o.status === 'pending_sync' ? t('checkout.successOffline') : t('checkout.success'), { description: o.number }); window.scrollTo({ top: 0 }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (placed) return <Confirmation order={placed} />;
  if (loading) return <LoadingState variant="detail" />;
  if (!items.length || !customer) return <EmptyState icon={ShoppingCart} title={t('cart.empty')} action={<Button asChild><Link href="/catalog">Browse catalog</Link></Button>} />;

  return (
    <div>
      <OrderContextBar step="review" />
      <button onClick={() => router.push('/cart')} className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="mr-1 h-4 w-4" />Back to cart</button>
      <PageHeader title={t('checkout.title')} description="Check the details below. Orders are reviewed by a supervisor before confirmation in Sage X3." />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card className="grid gap-5 p-5 sm:grid-cols-3">
            <div><h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Building2 className="h-4 w-4 text-primary" />{t('common.customer')}</h2><p className="text-sm font-medium">{customer.name}</p><p className="text-sm text-muted-foreground">{customer.code}<br />{customer.contactName}<br />GSTIN {customer.gstin}</p></div>
            <div><h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-primary" />Delivery address</h2><Addr a={customer.address} /></div>
            <div><h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-primary" />Billing address</h2><Addr a={customer.billingAddress} /></div>
          </Card>
          <Card className="overflow-hidden">
            <h2 className="border-b px-4 py-3 text-sm font-semibold">Products ({totals.lines.length})</h2>
            <ul className="divide-y">{totals.lines.map((l) => (
              <li key={l.productId} className="flex items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1"><div className="font-medium">{l.name}</div><div className="font-mono text-[11px] text-muted-foreground">{l.sku}</div></div>
                <div className="text-right text-muted-foreground tabular">{l.quantity} {l.uom} × {fmtMoney(l.unitPrice, true)}{l.discountPct ? <div className="text-xs text-emerald-700">−{l.discountPct}% offer</div> : null}</div>
                <div className="w-28 text-right font-semibold tabular">{fmtMoney(l.lineTotal, true)}</div>
              </li>
            ))}</ul>
          </Card>
          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="po">Customer PO number (optional)</Label><Input id="po" value={po} onChange={(e) => setPo(e.target.value)} placeholder="e.g. PO/HYD/2741" /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="notes">Notes for the warehouse</Label><Textarea id="notes" data-testid="checkout-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery window, contact at gate, special packing…" rows={3} /></div>
          </Card>
        </div>
        <div className="lg:sticky lg:top-24 lg:self-start">
          <OrderSummary totals={totals}>
            {!ui.online && <div className="mt-4 flex gap-2 rounded-md bg-amber-50 p-3 text-xs text-amber-900"><CloudOff className="h-4 w-4 shrink-0" />You are offline. The order will be saved as <b>Pending Sync</b> and submitted when you reconnect.</div>}
            <Button className="mt-4 h-11 w-full" onClick={() => m.mutate()} disabled={m.isPending} data-testid="submit-order">
              {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{ui.online ? t('checkout.submit') : t('checkout.submitOffline')}
            </Button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">Placed by {user.name} ({t(`roles.${user.role}`)})</p>
          </OrderSummary>
        </div>
      </div>
    </div>
  );
}
