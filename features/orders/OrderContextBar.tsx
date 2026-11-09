'use client';
import Link from 'next/link';
import { Building2, Check, ArrowLeftRight } from 'lucide-react';
import { useUser } from '@/lib/auth/AuthProvider';
import { usePricedCart } from '@/lib/cart/CartProvider';
import { fmtMoney } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const STEPS = [
  { key: 'customer', href: '/orders/new' },
  { key: 'products', href: '/catalog' },
  { key: 'cart', href: '/cart' },
  { key: 'review', href: '/checkout' },
];

/** Sales-rep order workflow indicator + "ordering for" context bar. */
export function OrderContextBar({ step }: { step: 'customer' | 'products' | 'cart' | 'review' }) {
  const { t } = useT();
  const user = useUser();
  const { customer } = usePricedCart();
  if (user.role !== 'SALES_REP') return null;
  const idx = STEPS.findIndex((s) => s.key === step);
  return (
    <div className="mb-5 space-y-3">
      <ol className="flex items-center gap-1 overflow-x-auto text-xs scrollbar-none" aria-label={t('newOrder.progress')}>
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex items-center gap-1">
            <Link href={i <= idx || customer ? s.href : '#'} className={cn('flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 font-medium', i < idx ? 'text-primary' : i === idx ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')} aria-current={i === idx ? 'step' : undefined}>
              <span className={cn('flex h-4 w-4 items-center justify-center rounded-full text-[10px]', i < idx ? 'bg-primary text-white' : i === idx ? 'bg-white/20' : 'border')}>{i < idx ? <Check className="h-3 w-3" /> : i + 1}</span>{t(`newOrder.steps.${s.key}`)}
            </Link>
            {i < STEPS.length - 1 && <span className="h-px w-4 bg-border" />}
          </li>
        ))}
      </ol>
      {customer && step !== 'customer' && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-accent/60 px-3 py-2.5" data-testid="ordering-for">
          <Building2 className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1 text-sm"><span className="text-muted-foreground">{t('newOrder.orderingForLabel')} </span><span className="font-semibold">{customer.name}</span><span className="hidden text-muted-foreground sm:inline"> · {customer.code} · {t('newOrder.tier', { tier: customer.priceTier })} · {t('newOrder.credit', { amount: fmtMoney(Math.max(0, customer.creditLimit - customer.outstanding)) })}</span></div>
          <Button asChild variant="ghost" size="sm" className="h-8 shrink-0"><Link href="/orders/new"><ArrowLeftRight className="me-1 h-3.5 w-3.5" aria-hidden="true" />{t('newOrder.change')}</Link></Button>
        </div>
      )}
    </div>
  );
}
