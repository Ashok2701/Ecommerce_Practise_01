'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgePercent, CalendarRange, EyeOff, RefreshCw, Star } from 'lucide-react';
import { toast } from 'sonner';
import { offerService, productService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { canManageContent } from '@/lib/auth/permissions';
import { useSettings } from '@/lib/settings';
import { useT } from '@/lib/i18n';
import { fmtDate, timeAgo } from '@/lib/format';
import { PageHeader, QueryView, EmptyState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { OfferBadge, offerText, offerTitle } from '@/features/offers/OfferBits';
import { cn } from '@/lib/utils';
import { isCustomerRole, type Offer, type OfferKind } from '@/types/domain';

type Filter = 'all' | OfferKind | 'scheduled' | 'expired';

/** Offers from the ERP. Customers see the ones that apply to them; staff see everything and how it is shown. */
export default function OffersPage() {
  const { t, locale } = useT();
  const settings = useSettings();
  const user = useUser();
  const qc = useQueryClient();
  const manage = canManageContent(user.role);
  const staff = !isCustomerRole(user.role);
  const q = useQuery({ queryKey: ['offers', staff ? 'all' : user.customerId], queryFn: () => offerService.list(staff ? { manage: true } : { forCustomerId: user.customerId }) });
  const synced = useQuery({ queryKey: ['offers', 'synced'], queryFn: offerService.syncedAt, enabled: staff });
  const products = useQuery({ queryKey: ['products', 'all'], queryFn: productService.getAll, staleTime: 5 * 60_000 });
  const sync = useMutation({ mutationFn: offerService.sync, onSuccess: () => { qc.invalidateQueries({ queryKey: ['offers'] }); toast.success(t('offers.synced', { erp: settings.erpName })); } });
  const [filter, setFilter] = useState<Filter>('all');
  const all = q.data ?? [];
  const filters: Filter[] = staff ? ['all', 'percent', 'tier', 'free_goods', 'scheduled', 'expired'] : ['all', 'percent', 'tier', 'free_goods'];
  const match = (o: Offer, f: Filter) => f === 'all' ? o.status === 'active' || !staff : f === 'scheduled' || f === 'expired' ? o.status === f : o.kind === f && (o.status === 'active' || !staff);
  const rows = all.filter((o) => match(o, filter));
  const freeName = (o: Offer) => (o.freeProductId ? products.data?.find((p) => p.id === o.freeProductId)?.name : undefined);

  return (
    <div>
      <PageHeader title={t('nav.offers')} description={staff ? t('offers.introStaff', { erp: settings.erpName }) : t('offers.introCustomer')}
        actions={manage ? <Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending} data-testid="offers-sync"><RefreshCw className={cn('me-2 h-4 w-4', sync.isPending && 'animate-spin')} aria-hidden="true" />{t('offers.syncNow')}</Button> : undefined} />
      {staff && synced.data && <p className="-mt-2 mb-4 text-xs text-muted-foreground" data-testid="offers-synced-at">{t('offers.lastSynced', { erp: settings.erpName, ago: timeAgo(synced.data) })}</p>}
      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist">
        {filters.map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} data-testid={`offers-filter-${f}`}
            className={cn('rounded-md border px-3 py-1.5 text-xs font-medium', filter === f ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}>
            {t(`offers.filter.${f}`)} <span className="ms-1 tabular opacity-70">{all.filter((o) => match(o, f)).length}</span>
          </button>
        ))}
      </div>
      <QueryView query={q}>
        {() => rows.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="offers-grid">
            {rows.map((o) => (
              <Link key={o.id} href={`/offers/${o.id}`} data-testid={`offer-card-${o.id}`} className="group">
                <Card className={cn('flex h-full flex-col overflow-hidden transition-colors group-hover:border-primary/40', o.presentation.hidden && 'opacity-70')}>
                  {o.presentation.image
                    ? <div className="h-32 bg-muted bg-cover bg-center" style={{ backgroundImage: `url(${o.presentation.image})` }} aria-hidden="true" />
                    : <div className="flex h-20 items-center bg-gradient-to-r from-primary/10 to-emerald-500/10 px-4" aria-hidden="true"><BadgePercent className="h-7 w-7 text-primary/60" /></div>}
                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <OfferBadge offer={o} freeName={freeName(o)} />
                      {staff && o.status !== 'active' && <StatusBadge status={o.status} />}
                      {staff && o.presentation.featured && <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400"><Star className="h-3 w-3" aria-hidden="true" />{t('offers.featured')}</span>}
                      {staff && o.presentation.hidden && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><EyeOff className="h-3 w-3" aria-hidden="true" />{t('offers.hiddenTag')}</span>}
                    </div>
                    <h2 className="mt-2 font-semibold group-hover:text-primary">{offerTitle(o, locale)}</h2>
                    <p className="mt-1 line-clamp-3 flex-1 text-sm text-muted-foreground">{offerText(o, locale)}</p>
                    <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />{o.status === 'scheduled' ? t('offers.startsOn', { date: fmtDate(o.validFrom) }) : t('offers.until', { date: fmtDate(o.validTo) })}</span>
                      <span className="font-mono">{o.code}</span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        ) : <EmptyState icon={BadgePercent} title={t('offers.empty')} description={staff ? undefined : t('offers.emptyCustomer')} />}
      </QueryView>
    </div>
  );
}
