'use client';
import { cn } from '@/lib/utils';
import { useSettings } from '@/lib/settings';
import { useT } from '@/lib/i18n';

/** Product mark from settings: the client's logo image, or a monogram of the product name. */
export function Logo({ compact = false, onDark = true, className }: { compact?: boolean; onDark?: boolean; className?: string }) {
  const s = useSettings();
  const { t } = useT();
  const mono = s.productName.trim().charAt(0).toUpperCase() || 'N';
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      {s.logoUrl ? (
        <span className={cn('flex h-8 items-center', onDark && 'rounded-md bg-white px-1.5')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.logoUrl} alt={s.productName} className={cn('w-auto max-w-[140px] object-contain', onDark ? 'h-6' : 'h-8')} />
        </span>
      ) : (
        <span aria-hidden="true" className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[15px] font-bold',
          onDark ? 'bg-white text-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))]' : 'bg-primary text-primary-foreground')}>{mono}</span>
      )}
      {!compact && (
        <span className="leading-tight">
          <span className={cn('block text-[15px] font-semibold', onDark ? 'text-white' : 'text-foreground')}>{s.productName}</span>
          <span className={cn('block text-[11.5px]', onDark ? 'text-white/60' : 'text-muted-foreground')}>{t('shell.connectedTo', { erp: s.erpName })}</span>
        </span>
      )}
    </div>
  );
}
