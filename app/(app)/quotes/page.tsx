'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { FileSignature, PlusCircle } from 'lucide-react';
import { quoteService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useSite } from '@/lib/sites/SiteProvider';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtMoney } from '@/lib/format';
import { PageHeader, QueryView, DataTable, EmptyState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { ViewTabs, type ListView } from '@/features/purchasing/common';
import { isCustomerRole, OPEN_QUOTE, type Quote } from '@/types/domain';

export default function QuotesPage() {
  const { t } = useT();
  const user = useUser();
  const { site } = useSite();
  const router = useRouter();
  const customer = isCustomerRole(user.role);
  const scope = customer ? { customerId: user.customerId } : user.role === 'SALES_REP' ? { salesRepId: user.id } : {};
  const q = useQuery({ queryKey: ['quotes', site, scope], queryFn: () => quoteService.list(scope) });
  const [view, setView] = useState<ListView>('open');
  const all = q.data ?? [];
  const inView = (x: Quote, v: ListView) => v === 'all' || (v === 'open' ? OPEN_QUOTE.includes(x.status) : !OPEN_QUOTE.includes(x.status));
  const rows = all.filter((x) => inView(x, view));
  return (
    <div>
      <PageHeader title={t('quotes.title')} description={customer ? t('quotes.introCustomer') : t('quotes.introStaff')}
        actions={<Button asChild><Link href="/quotes/new" data-testid="new-quote"><PlusCircle className="me-2 h-4 w-4" aria-hidden="true" />{customer ? t('quotes.request') : t('quotes.new')}</Link></Button>} />
      <ViewTabs value={view} onChange={setView} counts={{ open: all.filter((x) => inView(x, 'open')).length, closed: all.filter((x) => inView(x, 'closed')).length, all: all.length }} testId="quote-tab" />
      <QueryView query={q}>
        {() => rows.length ? (
          <DataTable<Quote> testId="quote-table" rows={rows} rowKey={(x) => x.id} onRowClick={(x) => router.push(`/quotes/${x.id}`)}
            columns={[
              { key: 'n', header: t('quotes.col.number'), cell: (x) => <span className="font-mono text-xs font-semibold">{x.number}{x.version > 1 ? <span className="ms-1 text-muted-foreground">v{x.version}</span> : null}</span> },
              ...(customer ? [] : [{ key: 'c', header: t('quotes.col.customer'), cell: (x: Quote) => <span className="font-medium">{x.customerName}</span> }]),
              { key: 'd', header: t('quotes.col.date'), cell: (x) => <span className="text-muted-foreground">{fmtDate(x.date)}</span> },
              { key: 'v', header: t('quotes.col.validUntil'), cell: (x) => (x.validUntil ? fmtDate(x.validUntil) : '—') },
              { key: 'i', header: t('quotes.col.items'), cell: (x) => t('requests.items', { count: x.lines.length }) },
              { key: 't', header: t('quotes.col.total'), cell: (x) => <span className="font-medium tabular">{x.status === 'requested' ? '—' : fmtMoney(x.total)}</span>, align: 'right' },
              { key: 's', header: t('quotes.col.status'), cell: (x) => <StatusBadge status={x.status} /> },
            ]}
            mobileCard={(x) => (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><div className="font-mono text-xs font-semibold">{x.number}</div>{!customer && <div className="truncate text-sm font-medium">{x.customerName}</div>}
                  <div className="text-xs text-muted-foreground">{fmtDate(x.date)} · {t('requests.items', { count: x.lines.length })}{x.status !== 'requested' ? ` · ${fmtMoney(x.total)}` : ''}</div></div>
                <StatusBadge status={x.status} />
              </div>
            )}
          />
        ) : <EmptyState icon={FileSignature} title={t('quotes.empty')} description={customer ? t('quotes.emptyCustomer') : t('quotes.emptyStaff')} />}
      </QueryView>
    </div>
  );
}
