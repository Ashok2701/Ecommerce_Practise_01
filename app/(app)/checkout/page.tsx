'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CloudOff, MapPin, FileText, Loader2, Building2, ChevronLeft, ShoppingCart, ShieldAlert, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { requestService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { usePricedCart } from '@/lib/cart/CartProvider';
import { useUI } from '@/lib/ui/UIProvider';
import { useSite } from '@/lib/sites/SiteProvider';
import { useErrorText, useT } from '@/lib/i18n';
import { fmtMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PageHeader, EmptyState, LoadingState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { OrderContextBar } from '@/features/orders/OrderContextBar';
import { OrderSummary } from '@/features/orders/OrderSummary';
import { FreeLineRow, LineOfferChip } from '@/features/offers/OfferBits';
import type { Address, SalesRequest } from '@/types/domain';

const Addr = ({ a }: { a?: Address }) => (a ? <p className="text-sm text-muted-foreground">{a.line1}<br />{a.city}, {a.state} {a.postalCode}<br />{a.country}</p> : null);

/** What happened after submit: converted straight away, submitted for review, or saved offline. */
function Confirmation({ r }: { r: SalesRequest }) {
  const { t } = useT();
  const draft = r.status === 'draft';
  const converted = r.status === 'converted' || r.status === 'partly_converted';
  const title = draft ? t('checkout.done.draftTitle') : converted ? t('checkout.done.convertedTitle', { number: r.orderNumbers[0] }) : t('checkout.done.submittedTitle', { number: r.number });
  const text = draft ? t('checkout.done.draftText') : converted ? t('checkout.done.convertedText', { request: r.number }) : t('checkout.done.submittedText');
  const Icon = draft ? CloudOff : converted ? CheckCircle2 : Clock;
  return (
    <div className="mx-auto max-w-xl py-8 text-center" data-testid="order-confirmation">
      <div className={cn('mx-auto flex h-14 w-14 items-center justify-center rounded-full', draft ? 'bg-signal/15 text-signal-foreground dark:text-signal' : 'bg-accent text-accent-foreground')}><Icon className="h-7 w-7" aria-hidden="true" /></div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight" data-testid="confirmation-title">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
      <Card className="mt-6 p-5 text-start">
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div><dt className="text-xs text-muted-foreground">{t('checkout.done.reference')}</dt><dd className="font-mono font-semibold" data-testid="confirmation-number">{r.number}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{t('common.status')}</dt><dd><StatusBadge status={r.status} /></dd></div>
          <div><dt className="text-xs text-muted-foreground">{t('common.customer')}</dt><dd className="font-medium">{r.customerName}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{t('checkout.done.total')}</dt><dd className="font-semibold tabular">{fmtMoney(r.total, true)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{t('checkout.done.items')}</dt><dd>{t('checkout.products', { count: r.lines.length })}</dd></div>
          {r.site && <div><dt className="text-xs text-muted-foreground">{t('sites.label')}</dt><dd>{r.site}</dd></div>}
        </dl>
      </Card>
      <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
        {converted && r.orderIds[0]
          ? <Button asChild><Link href={`/orders/${r.orderIds[0]}`}>{t('checkout.done.viewOrder')}</Link></Button>
          : <Button asChild><Link href={`/requests/${r.id}`} data-testid="view-request">{t('checkout.done.viewRequest')}</Link></Button>}
        <Button asChild variant="outline"><Link href="/requests">{t('checkout.done.allRequests')}</Link></Button>
        <Button asChild variant="ghost"><Link href="/catalog">{t('checkout.done.continue')}</Link></Button>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  const { t } = useT();
  const errorText = useErrorText();
  const user = useUser();
  const ui = useUI();
  const { current } = useSite();
  const router = useRouter();
  const qc = useQueryClient();
  const { cart, customer, totals, items, loading } = usePricedCart();
  const [po, setPo] = useState('');
  const [notes, setNotes] = useState('');
  const [placed, setPlaced] = useState<SalesRequest | null>(null);
  const [error, setError] = useState('');
  const retail = customer?.type === 'B2C';
  const m = useMutation({
    mutationFn: () => requestService.submit({ customerId: customer!.id, items: cart.items, notes, poNumber: po || undefined, actor: { id: user.id, name: user.name, role: user.role }, offline: !ui.online }),
    onSuccess: (r) => { setPlaced(r); cart.clear(); qc.invalidateQueries(); window.scrollTo({ top: 0 }); },
    onError: (e) => { setError(errorText(e)); toast.error(t('checkout.blockedTitle')); },
  });

  if (placed) return <Confirmation r={placed} />;
  if (loading) return <LoadingState variant="detail" />;
  if (!items.length || !customer) return <EmptyState icon={ShoppingCart} title={t('cart.empty')} action={<Button asChild><Link href="/catalog">{t('checkout.done.continue')}</Link></Button>} />;

  const buttonText = !ui.online ? t('checkout.saveOffline') : retail ? t('checkout.pay', { amount: fmtMoney(totals.total, true) }) : t('checkout.submit');

  return (
    <div>
      <OrderContextBar step="review" />
      <button onClick={() => router.push('/cart')} className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="me-1 h-4 w-4 rtl:rotate-180" aria-hidden="true" />{t('checkout.back')}</button>
      <PageHeader title={t('checkout.title')} description={retail ? t('checkout.introRetail') : t('checkout.intro')} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card className="grid gap-5 p-5 sm:grid-cols-3">
            <div>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Building2 className="h-4 w-4 text-primary" aria-hidden="true" />{t('common.customer')}</h2>
              <p className="text-sm font-medium">{customer.name}</p><p className="text-sm text-muted-foreground">{customer.code}</p>
              {current && <p className="mt-2 text-xs text-muted-foreground" data-testid="checkout-site">{t('checkout.site', { site: `${current.code} · ${current.name}` })}</p>}
            </div>
            <div><h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-primary" aria-hidden="true" />{t('checkout.delivery')}</h2><Addr a={customer.address} /></div>
            <div><h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-primary" aria-hidden="true" />{t('checkout.billing')}</h2><Addr a={customer.billingAddress} /></div>
          </Card>
          <Card className="overflow-hidden">
            <h2 className="border-b px-4 py-3 text-sm font-semibold">{t('checkout.products', { count: totals.lines.filter((l) => !l.free).length })}</h2>
            <ul className="divide-y">{totals.lines.map((l) => l.free ? <li key={`free-${l.offerId}-${l.productId}`}><FreeLineRow line={l} /></li> : (
              <li key={l.productId} className="flex items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1"><div className="font-medium">{l.name}</div><div className="font-mono text-[11px] text-muted-foreground">{l.sku}<LineOfferChip line={l} /></div></div>
                <div className="text-end text-muted-foreground tabular">{l.quantity} {l.uom} × {fmtMoney(l.unitPrice, true)}{l.discountPct ? <div className="text-xs text-primary">−{l.discountPct}%</div> : null}</div>
                <div className="w-28 text-end font-semibold tabular">{fmtMoney(l.lineTotal, true)}</div>
              </li>
            ))}</ul>
          </Card>
          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            {!retail && <div className="space-y-1.5"><Label htmlFor="po">{t('checkout.po')}</Label><Input id="po" value={po} onChange={(e) => setPo(e.target.value)} placeholder={t('checkout.poPlaceholder')} /></div>}
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="notes">{t('checkout.notes')}</Label><Textarea id="notes" data-testid="checkout-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('checkout.notesPlaceholder')} /></div>
          </Card>
        </div>
        <div className="lg:sticky lg:top-24 lg:self-start">
          <OrderSummary totals={totals}>
            {!ui.online && <div className="mt-4 flex gap-2 rounded-md bg-signal/10 p-3 text-xs text-signal-foreground dark:text-signal"><CloudOff className="h-4 w-4 shrink-0" aria-hidden="true" />{t('checkout.offlineNote')}</div>}
            {error && (
              <div role="alert" className="mt-4 flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive" data-testid="checkout-error">
                <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" /><div><div className="font-semibold">{t('checkout.blockedTitle')}</div>{error}</div>
              </div>
            )}
            <Button className="mt-4 h-11 w-full" onClick={() => { setError(''); m.mutate(); }} disabled={m.isPending} data-testid="submit-order">
              {m.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />}{buttonText}
            </Button>
            {retail && ui.online && <p className="mt-2 text-center text-[11px] text-muted-foreground">{t('checkout.payNote')}</p>}
            <p className="mt-2 text-center text-[11px] text-muted-foreground">{t('checkout.placedBy', { name: user.name, role: t(`roles.${user.role}`) })}</p>
          </OrderSummary>
        </div>
      </div>
    </div>
  );
}
