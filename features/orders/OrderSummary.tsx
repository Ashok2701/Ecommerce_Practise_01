'use client';
import { Card } from '@/components/ui/card';
import { useT } from '@/lib/i18n';
import { fmtMoney } from '@/lib/format';

export function OrderSummary({ totals, children }: { totals: { subtotal: number; discount: number; tax: number; total: number }; children?: React.ReactNode }) {
  const { t } = useT();
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold">Order summary</h2>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between"><dt className="text-muted-foreground">{t('common.subtotal')}</dt><dd className="tabular">{fmtMoney(totals.subtotal, true)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">{t('common.discount')} (offers)</dt><dd className="tabular text-emerald-700">−{fmtMoney(totals.discount, true)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">{t('common.tax')} <span className="text-[11px]">(estimate)</span></dt><dd className="tabular">{fmtMoney(totals.tax, true)}</dd></div>
        <div className="flex justify-between border-t pt-3 text-base font-semibold"><dt>{t('common.total')}</dt><dd className="tabular" data-testid="order-total">{fmtMoney(totals.total, true)}</dd></div>
      </dl>
      <p className="mt-2 text-[11px] text-muted-foreground">Final tax and freight are calculated by the ERP on confirmation.</p>
      {children}
    </Card>
  );
}
