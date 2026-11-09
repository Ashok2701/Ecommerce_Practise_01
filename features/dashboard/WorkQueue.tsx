'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, ChevronRight, CircleCheck, FileText, PackageCheck, Truck, Wallet, Warehouse, type LucideIcon } from 'lucide-react';
import { deliveryService, paymentService, purchaseOrderService, quoteService, transferService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useAccess } from '@/lib/auth/permissions';
import { useSite } from '@/lib/sites/SiteProvider';
import { useT } from '@/lib/i18n';
import { SectionCard } from '@/components/common';
import { isCustomerRole } from '@/types/domain';
import { cn } from '@/lib/utils';

interface Item { key: string; icon: LucideIcon; count: number; href: string; tone: 'warning' | 'info' | 'danger' }

const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); };

/**
 * "Needs your attention": one line per work queue the viewer can act on, with a count and a link.
 * Each queue is fetched only when the role has that module, so the card never links to a page the user can't open.
 */
export function WorkQueue({ className, hideWhenClear }: { className?: string; hideWhenClear?: boolean }) {
  const { t } = useT();
  const user = useUser();
  const access = useAccess(user.role);
  const { site } = useSite();
  const customer = isCustomerRole(user.role);
  const rep = user.role === 'SALES_REP';
  const scope = customer ? { customerId: user.customerId } : rep ? { salesRepId: user.id } : {};

  const quotes = useQuery({ queryKey: ['quotes', 'queue', scope, site], queryFn: () => quoteService.list({ ...scope, view: 'open' }), enabled: access.can('quotes') });
  const deliveries = useQuery({ queryKey: ['deliveries', 'queue', scope, site], queryFn: () => deliveryService.list({ ...scope, view: 'open' }), enabled: access.can('deliveries') || (customer && access.can('orders')) });
  const payments = useQuery({ queryKey: ['payments', 'queue'], queryFn: () => paymentService.list({ status: 'pending_verification' }), enabled: !customer && !rep && access.can('collections') });
  const transfers = useQuery({ queryKey: ['transfers', 'queue', site], queryFn: () => transferService.list({ view: 'open' }), enabled: !customer && access.can('transfers') });
  const pos = useQuery({ queryKey: ['purchase-orders', 'queue', site], queryFn: () => purchaseOrderService.list({ view: 'open' }), enabled: !customer && !rep && access.can('purchase_orders') });

  const q = quotes.data ?? [];
  const d = deliveries.data ?? [];
  const tr = transfers.data ?? [];
  const items: Item[] = customer
    ? [
        { key: 'quotesToAnswer', icon: FileText, count: q.filter((x) => x.status === 'sent').length, href: '/quotes', tone: 'warning' },
        { key: 'quotesPending', icon: FileText, count: q.filter((x) => x.status === 'requested').length, href: '/quotes', tone: 'info' },
        { key: 'onTheWay', icon: Truck, count: d.filter((x) => x.status === 'out_for_delivery').length, href: '/orders', tone: 'info' },
      ]
    : [
        { key: 'quotesToPrice', icon: FileText, count: q.filter((x) => x.status === 'requested').length, href: '/quotes', tone: 'warning' },
        { key: 'quotesWaiting', icon: FileText, count: q.filter((x) => x.status === 'sent').length, href: '/quotes', tone: 'info' },
        { key: 'paymentsToVerify', icon: Wallet, count: payments.data?.length ?? 0, href: '/collections?tab=verify', tone: 'warning' },
        { key: 'deliveriesDue', icon: Truck, count: d.filter((x) => x.status !== 'delivered' && new Date(x.plannedDate).getTime() <= endOfToday()).length, href: '/deliveries', tone: 'warning' },
        { key: 'deliveriesFailed', icon: Truck, count: d.filter((x) => x.status === 'failed').length, href: '/deliveries', tone: 'danger' },
        { key: 'transfersToApprove', icon: ArrowLeftRight, count: rep ? 0 : tr.filter((x) => x.status === 'pending').length, href: '/transfers', tone: 'warning' },
        { key: 'transfersToReceive', icon: Warehouse, count: tr.filter((x) => x.status === 'transferred' && (!site || x.toSite === site)).length, href: '/transfers', tone: 'info' },
        { key: 'posInTransit', icon: PackageCheck, count: (pos.data ?? []).filter((x) => x.status === 'in_transit').length, href: '/purchase-orders', tone: 'info' },
      ];
  const shown = items.filter((i) => i.count > 0);
  const loading = [quotes, deliveries, payments, transfers, pos].some((x) => x.isLoading && x.fetchStatus !== 'idle');
  const anyQueue = [quotes, deliveries, payments, transfers, pos].some((x) => x.fetchStatus !== 'idle' || x.data);
  if (!anyQueue || (hideWhenClear && !loading && !shown.length)) return null;

  return (
    <SectionCard className={className} title={t('workQueue.title')}>
      {loading ? <div className="h-24 animate-pulse bg-muted/40" /> : shown.length ? (
        <ul className="divide-y" data-testid="work-queue">{shown.map((i) => (
          <li key={i.key}><Link href={i.href} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40" data-testid={`wq-${i.key}`}>
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md', i.tone === 'warning' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : i.tone === 'danger' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' : 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300')}><i.icon className="h-4 w-4" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1 text-sm">{t(`workQueue.${i.key}`, { count: i.count })}</span>
            <span className="text-lg font-semibold tabular">{i.count}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
          </Link></li>
        ))}</ul>
      ) : <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground" data-testid="work-queue-clear"><CircleCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />{t('workQueue.clear')}</p>}
    </SectionCard>
  );
}
