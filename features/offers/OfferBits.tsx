'use client';
import Link from 'next/link';
import { Gift, Sparkles, TrendingUp } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Offer, OrderLine, Product } from '@/types/domain';
import type { OfferNudge } from '@/lib/domain/pricing';

type T = ReturnType<typeof useT>['t'];

/** Portal title in the viewer's language, else the ERP label. */
export function offerTitle(o: Offer, locale: string) { return o.presentation.title?.[locale] || o.presentation.title?.en || o.title; }
export function offerText(o: Offer, locale: string) { return o.presentation.text?.[locale] || o.presentation.text?.en || o.description; }

/** Short rule: "10% off", "Up to 12% off from 20", "Buy 10, get 1 free". */
export function offerRule(o: Offer, t: T, freeName?: string) {
  if (o.kind === 'percent') return t('offers.rule.percent', { pct: o.discountPct ?? 0 });
  if (o.kind === 'tier') {
    const tiers = [...(o.tiers ?? [])].sort((a, b) => a.minQty - b.minQty);
    return t('offers.rule.tier', { pct: tiers.at(-1)?.discountPct ?? 0, qty: tiers[0]?.minQty ?? 0 });
  }
  return freeName ? t('offers.rule.freeOther', { buy: o.buyQty ?? 0, free: o.freeQty ?? 0, name: freeName }) : t('offers.rule.freeSame', { buy: o.buyQty ?? 0, free: o.freeQty ?? 0 });
}

const ICON = { percent: Sparkles, tier: TrendingUp, free_goods: Gift } as const;

/** Compact badge for catalog cards and lists. */
export function OfferBadge({ offer, freeName, className, link = false }: { offer: Offer; freeName?: string; className?: string; link?: boolean }) {
  const { t } = useT();
  const Icon = ICON[offer.kind];
  const body = <><Icon className="h-3 w-3 shrink-0" aria-hidden="true" />{offerRule(offer, t, freeName)}</>;
  const cls = cn('inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300', className);
  return link ? <Link href={`/offers/${offer.id}`} className={cn(cls, 'hover:underline')} data-testid={`offer-badge-${offer.id}`}>{body}</Link> : <span className={cls} data-testid={`offer-badge-${offer.id}`}>{body}</span>;
}

/** A free-goods line under the line that earned it. */
export function FreeLineRow({ line, compact = false }: { line: OrderLine; compact?: boolean }) {
  const { t } = useT();
  return (
    <div className={cn('flex items-center justify-between gap-3 bg-emerald-50/60 text-sm dark:bg-emerald-500/5', compact ? 'px-3 py-2' : 'px-4 py-2.5')} data-testid={`free-line-${line.productId}`}>
      <div className="flex min-w-0 items-center gap-2">
        <Gift className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
        <div className="min-w-0"><div className="truncate font-medium">{line.name}</div><div className="text-[11px] text-muted-foreground">{t('offers.freeLine', { code: line.offerCode ?? '' })}</div></div>
      </div>
      <div className="shrink-0 text-end"><div className="font-semibold tabular">{line.quantity} {line.uom}</div><div className="text-[11px] font-semibold uppercase text-emerald-700 dark:text-emerald-400">{t('offers.free')}</div></div>
    </div>
  );
}

/** "Add 3 more to get 8% off" with a one-tap add. */
export function NudgeRow({ nudge, products, onAdd }: { nudge: OfferNudge; products: Product[]; onAdd?: (qty: number) => void }) {
  const { t } = useT();
  const freeName = nudge.freeProductId ? products.find((p) => p.id === nudge.freeProductId)?.name : undefined;
  const text = nudge.kind === 'tier'
    ? t('offers.nudge.tier', { count: nudge.needed, pct: nudge.discountPct ?? 0 })
    : freeName ? t('offers.nudge.freeOther', { count: nudge.needed, free: nudge.freeQty ?? 1, name: freeName }) : t('offers.nudge.freeSame', { count: nudge.needed, free: nudge.freeQty ?? 1 });
  return (
    <div className="flex items-center justify-between gap-3 bg-amber-50/70 px-4 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200" role="status" data-testid={`nudge-${nudge.productId}`}>
      <span className="flex items-center gap-1.5">{nudge.kind === 'tier' ? <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> : <Gift className="h-3.5 w-3.5" aria-hidden="true" />}{text}</span>
      {onAdd && <button type="button" className="shrink-0 rounded-md border border-amber-300 bg-white/70 px-2 py-1 font-semibold hover:bg-white dark:border-amber-500/40 dark:bg-transparent" onClick={() => onAdd(nudge.needed)} data-testid={`nudge-add-${nudge.productId}`}>{t('offers.nudge.add', { count: nudge.needed })}</button>}
    </div>
  );
}

/** Offer chip on a priced line (order, request, invoice). */
export function LineOfferChip({ line }: { line: OrderLine }) {
  if (!line.offerCode || line.free) return null;
  return <span className="ms-1 rounded bg-emerald-50 px-1 py-px font-mono text-[10px] text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">{line.offerCode}</span>;
}

/** "Free" tag (with the offer code) for a zero-priced line in documents. */
export function FreeTag({ line }: { line: OrderLine }) {
  const { t } = useT();
  if (!line.free) return null;
  return <span className="ms-1 inline-flex items-center gap-1 rounded bg-emerald-100 px-1 py-px text-[10px] font-semibold uppercase text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" data-testid="free-tag"><Gift className="h-2.5 w-2.5" aria-hidden="true" />{t('offers.free')}{line.offerCode ? ` · ${line.offerCode}` : ''}</span>;
}
