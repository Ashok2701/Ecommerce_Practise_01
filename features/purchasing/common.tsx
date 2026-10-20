'use client';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { PO_FLOW, type PurchaseOrderStatus } from '@/types/domain';

export type ListView = 'open' | 'closed' | 'all';

/** Open / closed / all tabs with counts (shared by purchasing lists). */
export function ViewTabs({ value, onChange, counts, testId }: { value: ListView; onChange: (v: ListView) => void; counts: Record<ListView, number>; testId: string }) {
  const { t } = useT();
  return (
    <div className="mb-4 flex gap-1.5" role="tablist">
      {(['open', 'closed', 'all'] as const).map((v) => (
        <button key={v} role="tab" aria-selected={value === v} onClick={() => onChange(v)} data-testid={`${testId}-${v}`}
          className={cn('rounded-md border px-3 py-1.5 text-xs font-medium', value === v ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}>
          {t(`requests.tabs.${v}`)} <span className="ms-1 tabular opacity-70">{counts[v]}</span>
        </button>
      ))}
    </div>
  );
}

/** Issued → Acknowledged → Pickup confirmed → In transit → Received. */
export function PoStepper({ status }: { status: PurchaseOrderStatus }) {
  const { t } = useT();
  const idx = status === 'partly_received' ? 3 : PO_FLOW.indexOf(status);
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label={t(`status.${status}`)} data-testid="po-stepper">
      {PO_FLOW.map((s, i) => (
        <li key={s} className="flex flex-col items-center gap-1.5 text-center">
          <span className={cn('h-1.5 w-full rounded-full', status === 'cancelled' ? 'bg-muted' : i <= idx ? 'bg-primary' : 'bg-muted')} />
          <span className={cn('text-[11px] leading-tight', i === idx ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{t(`status.${s}`)}</span>
        </li>
      ))}
    </ol>
  );
}
