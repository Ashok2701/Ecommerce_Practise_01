'use client';
import { Suspense, useEffect, useState } from 'react';
import { FreeTag } from '@/features/offers/OfferBits';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, ShieldAlert } from 'lucide-react';
import { requestService } from '@/lib/services';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings';
import { fmtMoney, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PageHeader, QueryView, EmptyState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Card } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ReviewPanel } from '@/features/requests/ReviewPanel';
import { REVIEWABLE_REQUEST, type SalesRequest } from '@/types/domain';

function Summary({ r }: { r: SalesRequest }) {
  const { t } = useT();
  return (
    <div className="space-y-3">
      <div>
        <div className="flex flex-wrap items-center gap-2"><Link href={`/requests/${r.id}`} className="font-mono text-lg font-semibold hover:underline">{r.number}</Link><StatusBadge status={r.status} /></div>
        <p className="text-sm text-muted-foreground">{r.customerName} · {t('requests.detail.createdBy', { name: r.createdBy.name })} · {timeAgo(r.date)}</p>
      </div>
      <Card className="overflow-hidden">
        <ul className="divide-y text-sm">{r.lines.map((l) => (
          <li key={`${l.productId}${l.free ? `-free-${l.offerId}` : ''}`} className="flex items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1 truncate">{l.name}<FreeTag line={l} /></span>
            <span className="tabular text-muted-foreground">{l.quantity - l.convertedQty} {l.uom}</span>
            <span className="w-24 text-end tabular">{fmtMoney(l.lineTotal, true)}</span>
          </li>
        ))}</ul>
        <div className="flex justify-between border-t bg-muted/30 px-3 py-2 text-sm font-semibold"><span>{t('common.total')}</span><span className="tabular">{fmtMoney(r.total, true)}</span></div>
      </Card>
      {r.notes && <p className="rounded-md bg-muted/60 p-3 text-sm">{r.notes}</p>}
    </div>
  );
}

function ApprovalsInner() {
  const { t } = useT();
  const settings = useSettings();
  const pre = useSearchParams().get('request');
  const [tab, setTab] = useState<'review' | 'decided'>('review');
  const [sel, setSel] = useState<string | null>(pre);
  const [sheet, setSheet] = useState(false);
  const q = useQuery({ queryKey: ['requests', 'approvals'], queryFn: () => requestService.list({}) });
  const all = q.data ?? [];
  const review = all.filter((r) => REVIEWABLE_REQUEST.includes(r.status));
  const decided = all.filter((r) => !REVIEWABLE_REQUEST.includes(r.status) && r.status !== 'draft' && r.timeline.length > 1).slice(0, 20);
  const rows = tab === 'review' ? review : decided;
  const current = all.find((r) => r.id === sel) ?? null;
  useEffect(() => { if (!sel && review[0] && window.matchMedia('(min-width: 1024px)').matches) setSel(review[0].id); }, [review.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (id: string) => { setSel(id); if (!window.matchMedia('(min-width: 1024px)').matches) setSheet(true); };
  const panel = current && (
    <div className="space-y-4">
      <Summary r={current} />
      <ReviewPanel request={current} onDone={(next) => { if (!REVIEWABLE_REQUEST.includes(next.status)) { setSheet(false); setSel(review.find((x) => x.id !== next.id)?.id ?? null); } }} />
    </div>
  );

  return (
    <div>
      <PageHeader title={t('approvals.title')} description={t('approvals.intro', { erp: settings.erpName })} />
      <div className="mb-4 flex gap-1.5" role="tablist">
        {(['review', 'decided'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`approvals-tab-${k}`}
            className={cn('rounded-md border px-3 py-1.5 text-xs font-medium', tab === k ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}>
            {t(`approvals.tabs.${k}`)} <span className="ms-1 tabular opacity-70">{(k === 'review' ? review : decided).length}</span>
          </button>
        ))}
      </div>
      <QueryView query={q}>
        {() => (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            {rows.length ? (
              <ul className="space-y-2" data-testid="approvals-list">{rows.map((r) => {
                const flag = (r.credit?.over || r.credit?.onHold) && !r.creditOverride;
                return (
                  <li key={r.id}>
                    <button onClick={() => open(r.id)} data-testid={`approval-item-${r.number}`}
                      className={cn('flex w-full items-center gap-3 rounded-lg border bg-card p-4 text-start transition-colors hover:border-primary/40', sel === r.id && 'border-primary ring-1 ring-primary')}>
                      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md', flag ? 'bg-destructive/10 text-destructive' : 'bg-accent text-accent-foreground')}>
                        {flag ? <ShieldAlert className="h-4 w-4" aria-hidden="true" /> : <ClipboardCheck className="h-4 w-4" aria-hidden="true" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-semibold">{r.number}</span><StatusBadge status={r.status} /></span>
                        <span className="block truncate text-sm font-medium">{r.customerName}</span>
                        <span className="block text-xs text-muted-foreground">{t('requests.items', { count: r.lines.length })} · {r.createdBy.name} · {timeAgo(r.date)}</span>
                      </span>
                      <span className="text-sm font-semibold tabular">{fmtMoney(r.total)}</span>
                    </button>
                  </li>
                );
              })}</ul>
            ) : <EmptyState icon={ClipboardCheck} title={t('approvals.empty')} description={t('approvals.emptyHint')} />}
            <div className="hidden lg:block">{panel && <Card className="sticky top-24 p-5" data-testid="approval-review">{panel}</Card>}</div>
          </div>
        )}
      </QueryView>
      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-xl">
          <SheetHeader className="sr-only"><SheetTitle>{t('requests.review.title')}</SheetTitle></SheetHeader>
          <div className="pt-2">{panel}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default function ApprovalsPage() { return <Suspense><ApprovalsInner /></Suspense>; }
