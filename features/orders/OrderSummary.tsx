'use client';
import { Card } from '@/components/ui/card';
import { useT } from '@/lib/i18n';
import { fmtMoney } from '@/lib/format';

export function OrderSummary({ totals, children }: { totals: { subtotal: number; discount: number; freeValue?: number; tax: number; total: number }; children?: React.ReactNode }) {
  const { t } = useT();
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold">{t('checkout.summary')}</h2>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between"><dt className="text-muted-foreground">{t('common.subtotal')}</dt><dd className="tabular">{fmtMoney(totals.subtotal, true)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">{t('common.discount')}</dt><dd className="tabular text-primary">−{fmtMoney(totals.discount, true)}</dd></div>
        {!!totals.freeValue && <div className="flex justify-between" data-testid="free-value"><dt className="text-muted-foreground">{t('offers.freeGoods')}</dt><dd className="tabular text-emerald-700 dark:text-emerald-400">{t('offers.freeWorth', { amount: fmtMoney(totals.freeValue, true) })}</dd></div>}
        <div className="flex justify-between"><dt className="text-muted-foreground">{t('common.tax')}</dt><dd className="tabular">{fmtMoney(totals.tax, true)}</dd></div>
        <div className="flex justify-between border-t pt-3 text-base font-semibold"><dt>{t('common.total')}</dt><dd className="tabular" data-testid="order-total">{fmtMoney(totals.total, true)}</dd></div>
      </dl>
      <p className="mt-2 text-[11px] text-muted-foreground">{t('checkout.indicative')}</p>
      {children}
    </Card>
  );
}
