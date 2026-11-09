'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CloudUpload, Search } from 'lucide-react';
import { toast } from 'sonner';
import { requestService, type RequestQuery } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useAccess } from '@/lib/auth/permissions';
import { useUI } from '@/lib/ui/UIProvider';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PageHeader, QueryView, DataTable, EmptyState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isCustomerRole, OPEN_REQUEST, REVIEWABLE_REQUEST, type SalesRequest } from '@/types/domain';

type View = NonNullable<RequestQuery['view']>;

function RequestsInner() {
  const { t } = useT();
  const user = useUser();
  const access = useAccess(user.role);
  const ui = useUI();
  const router = useRouter();
  const qc = useQueryClient();
  const reviewer = access.can('approvals');
  const [view, setView] = useState<View>((useSearchParams().get('view') as View) ?? (reviewer ? 'review' : 'open'));
  const [search, setSearch] = useState('');
  const scope: RequestQuery = isCustomerRole(user.role) ? { customerId: user.customerId } : user.role === 'SALES_REP' ? { salesRepId: user.id } : {};
  const q = useQuery({ queryKey: ['requests', scope], queryFn: () => requestService.list(scope) });
  const all = q.data ?? [];
  const drafts = all.filter((r) => r.status === 'draft' && r.source === 'offline');

  const sync = useMutation({
    mutationFn: () => requestService.syncDrafts({ id: user.id, name: user.name, role: user.role }),
    onSuccess: ({ sent, blocked }) => {
      qc.invalidateQueries();
      if (sent) toast.success(t('requests.sent', { count: sent }));
      if (blocked) toast.error(t('requests.notSent', { count: blocked }));
    },
  });
  // drafts are sent automatically by the app shell when the connection comes back (see DraftSync)

  const inView = (r: SalesRequest, v: View) => v === 'all' || (v === 'open' ? OPEN_REQUEST.includes(r.status) : v === 'review' ? REVIEWABLE_REQUEST.includes(r.status) : !OPEN_REQUEST.includes(r.status));
  const s = search.trim().toLowerCase();
  const rows = all.filter((r) => inView(r, view) && (!s || [r.number, r.customerName, r.poNumber ?? '', ...r.orderNumbers, ...r.lines.map((l) => l.name)].some((v) => v.toLowerCase().includes(s))));
  const tabs: View[] = reviewer ? ['review', 'open', 'closed', 'all'] : ['open', 'closed', 'all'];
  const showCustomer = !isCustomerRole(user.role);
  const intro = isCustomerRole(user.role) ? t('requests.introCustomer') : user.role === 'SALES_REP' ? t('requests.introRep') : t('requests.introReviewer');

  return (
    <div>
      <PageHeader title={t('requests.title')} description={intro} />
      {drafts.length > 0 && (
        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-dashed border-signal/60 bg-signal/10 p-3 text-sm sm:flex-row sm:items-center" data-testid="drafts-banner">
          <CloudUpload className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="flex-1">{t('requests.drafts', { count: drafts.length })}</span>
          <Button size="sm" variant="outline" className="bg-card" disabled={!ui.online || sync.isPending} onClick={() => sync.mutate()} data-testid="send-drafts">{t('requests.sendDrafts')}</Button>
        </div>
      )}
      <div className="mb-4 flex flex-col gap-3">
        <div className="relative max-w-md">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input aria-label={t('requests.search')} data-testid="requests-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('requests.search')} className="h-10 bg-card ps-9" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none" role="tablist">
          {tabs.map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} data-testid={`requests-tab-${v}`}
              className={cn('shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium', view === v ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}>
              {t(`requests.tabs.${v}`)} <span className="ms-1 tabular opacity-70">{all.filter((r) => inView(r, v)).length}</span>
            </button>
          ))}
        </div>
      </div>
      <QueryView query={q}>
        {() => rows.length ? (
          <DataTable<SalesRequest> testId="requests-table" rows={rows} rowKey={(r) => r.id} onRowClick={(r) => router.push(`/requests/${r.id}`)}
            columns={[
              { key: 'n', header: t('requests.col.request'), cell: (r) => <div><div className="font-mono text-xs font-semibold">{r.number}{r.site && <span className="ms-2 rounded bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground">{r.site}</span>}</div>{r.poNumber && <div className="text-[11px] text-muted-foreground">{r.poNumber}</div>}</div> },
              ...(showCustomer ? [{ key: 'c', header: t('requests.col.customer'), cell: (r: SalesRequest) => <span className="font-medium">{r.customerName}</span> }] : []),
              { key: 'd', header: t('requests.col.date'), cell: (r) => <span className="text-muted-foreground">{fmtDate(r.date)}</span> },
              { key: 'i', header: t('requests.col.items'), cell: (r) => t('requests.items', { count: r.lines.length }) },
              { key: 't', header: t('requests.col.total'), cell: (r) => <span className="font-medium tabular">{fmtMoney(r.total)}</span>, align: 'right' },
              { key: 's', header: t('requests.col.status'), cell: (r) => <StatusBadge status={r.status} /> },
              { key: 'o', header: t('requests.col.orders'), cell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.orderNumbers.join(', ') || '—'}</span> },
            ]}
            mobileCard={(r) => (
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="font-mono text-xs font-semibold">{r.number}</div>{showCustomer && <div className="truncate text-sm font-medium">{r.customerName}</div>}<div className="text-xs text-muted-foreground">{fmtDate(r.date)} · {t('requests.items', { count: r.lines.length })}</div></div>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mt-2 flex justify-between text-sm"><span className="font-mono text-xs text-muted-foreground">{r.orderNumbers.join(', ')}</span><span className="font-semibold tabular">{fmtMoney(r.total)}</span></div>
              </div>
            )}
          />
        ) : <EmptyState title={t('requests.empty')} description={t('requests.emptyHint')} />}
      </QueryView>
    </div>
  );
}

export default function RequestsPage() { return <Suspense><RequestsInner /></Suspense>; }
