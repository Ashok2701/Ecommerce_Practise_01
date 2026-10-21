'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, Download, Eye, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { invoiceService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useSettings } from '@/lib/settings';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtMoney } from '@/lib/format';
import { PageHeader, QueryView, DataTable, KpiCard } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { PayOnlineDialog } from '@/features/payments/PaymentDialogs';
import { cn } from '@/lib/utils';
import type { Invoice } from '@/types/domain';

const TABS = ['all', 'open', 'overdue', 'partially_paid', 'unpaid', 'paid'] as const;

export default function InvoicesPage() {
  const { t } = useT();
  const user = useUser();
  const settings = useSettings();
  const [tab, setTab] = useState<(typeof TABS)[number]>('all');
  const [payFor, setPayFor] = useState<string[] | null>(null);
  const q = useQuery({ queryKey: ['invoices', user.customerId], queryFn: () => invoiceService.getInvoices(user.customerId) });
  const all = q.data ?? [];
  const rows = all.filter((i) => tab === 'all' || (tab === 'open' ? i.status !== 'paid' : i.status === tab));
  const bal = (i: Invoice) => i.amount - i.paid;
  const pdf = (i: Invoice) => toast.info(t('invoices.pdfInfo', { number: i.number, erp: settings.erpName }));
  const Actions = ({ i }: { i: Invoice }) => (
    <div className="flex justify-end gap-1">
      {i.status !== 'paid' && user.customerId && <Button size="sm" className="h-8" onClick={() => setPayFor([i.id])} data-testid={`pay-${i.number}`}>{t('invoices.pay')}</Button>}
      <Button asChild size="sm" variant="ghost" className="h-8"><Link href={`/orders/${i.orderId}`} aria-label={t('invoices.viewOrder', { number: i.number })}><Eye className="h-4 w-4" aria-hidden="true" /></Link></Button>
      <Button size="sm" variant="outline" className="h-8" onClick={() => pdf(i)}><Download className="me-1 h-3.5 w-3.5" aria-hidden="true" />PDF</Button>
    </div>
  );
  const openCount = all.filter((i) => i.status !== 'paid').length;
  return (
    <div>
      <PageHeader title={t('invoices.title')} description={t('invoices.intro', { erp: settings.erpName })}
        actions={<>
          {openCount > 0 && user.customerId && <Button onClick={() => setPayFor(all.filter((i) => i.status === 'overdue').map((i) => i.id))} data-testid="invoices-pay"><CreditCard className="me-2 h-4 w-4" aria-hidden="true" />{t('payments.payOnline')}</Button>}
          <Button variant="outline" asChild><Link href="/account">{t('invoices.accountSummary')}</Link></Button>
        </>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t('invoices.kpi.total')} value={all.length} icon={FileText} />
        <KpiCard label={t('invoices.kpi.open')} value={fmtMoney(all.reduce((s, i) => s + bal(i), 0))} tone="warning" />
        <KpiCard label={t('invoices.kpi.overdue')} value={fmtMoney(all.filter((i) => i.status === 'overdue').reduce((s, i) => s + bal(i), 0))} tone="danger" />
        <KpiCard label={t('invoices.kpi.paid')} value={fmtMoney(all.reduce((s, i) => s + i.paid, 0))} tone="success" />
      </div>
      <div className="mb-4 flex gap-1.5 overflow-x-auto scrollbar-none" role="tablist">
        {TABS.map((k) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium', tab === k ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground')}>{k === 'all' ? t('common.all') : k === 'open' ? t('requests.tabs.open') : t(`status.${k}`)}</button>)}
      </div>
      <QueryView query={q}>
        {() => (
          <DataTable<Invoice> testId="invoices-table" rows={rows} rowKey={(i) => i.id}
            columns={[
              { key: 'n', header: t('invoices.col.invoice'), cell: (i) => <div><div className="font-mono text-xs font-semibold">{i.number}</div><div className="font-mono text-[11px] text-muted-foreground">{i.orderNumber}</div></div> },
              { key: 'd', header: t('invoices.col.date'), cell: (i) => fmtDate(i.date) },
              { key: 'due', header: t('invoices.col.due'), cell: (i) => <span className={i.status === 'overdue' ? 'font-medium text-rose-600' : ''}>{fmtDate(i.dueDate)}</span> },
              { key: 'a', header: t('invoices.col.amount'), cell: (i) => fmtMoney(i.amount, true), align: 'right' },
              { key: 'b', header: t('invoices.col.balance'), cell: (i) => <span className="font-medium">{fmtMoney(bal(i), true)}</span>, align: 'right' },
              { key: 's', header: t('common.status'), cell: (i) => <StatusBadge status={i.status} /> },
              { key: 'x', header: '', cell: (i) => <Actions i={i} />, align: 'right' },
            ]}
            mobileCard={(i) => (
              <div><div className="flex items-start justify-between"><div><div className="font-mono text-xs font-semibold">{i.number}</div><div className="text-xs text-muted-foreground">{t('invoices.issuedDue', { issued: fmtDate(i.date), due: fmtDate(i.dueDate) })}</div></div><StatusBadge status={i.status} /></div>
                <div className="mt-2 flex items-center justify-between gap-2"><span className="text-sm">{t('invoices.balanceOf', { balance: fmtMoney(bal(i)), amount: fmtMoney(i.amount) })}</span><Actions i={i} /></div></div>
            )}
          />
        )}
      </QueryView>
      {payFor && user.customerId && <PayOnlineDialog open onOpenChange={(v) => !v && setPayFor(null)} customerId={user.customerId} invoices={all} preselect={payFor} />}
    </div>
  );
}
