'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Download, Eye, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { invoiceService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { fmtDate, fmtMoney } from '@/lib/format';
import { PageHeader, QueryView, DataTable, KpiCard } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Invoice } from '@/types/domain';

export default function InvoicesPage() {
  const user = useUser();
  const [tab, setTab] = useState('all');
  const q = useQuery({ queryKey: ['invoices', user.customerId], queryFn: () => invoiceService.getInvoices(user.customerId) });
  const all = q.data ?? [];
  const rows = all.filter((i) => tab === 'all' || (tab === 'open' ? i.status !== 'paid' : i.status === tab));
  const bal = (i: Invoice) => i.amount - i.paid;
  const pdf = (i: Invoice) => toast.info(`${i.number}.pdf will be served by the ERP document service`, { description: 'Placeholder in prototype' });
  const Actions = ({ i }: { i: Invoice }) => <div className="flex justify-end gap-1"><Button asChild size="sm" variant="ghost" className="h-8"><Link href={`/orders/${i.orderId}`} aria-label={`View order for ${i.number}`}><Eye className="h-4 w-4" /></Link></Button><Button size="sm" variant="outline" className="h-8" onClick={() => pdf(i)}><Download className="mr-1 h-3.5 w-3.5" />PDF</Button></div>;
  return (
    <div>
      <PageHeader title="Invoices" description="Tax invoices issued by the ERP at dispatch." actions={<Button variant="outline" asChild><Link href="/account">Account summary</Link></Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Total invoices" value={all.length} icon={FileText} />
        <KpiCard label="Open balance" value={fmtMoney(all.reduce((s, i) => s + bal(i), 0))} tone="warning" />
        <KpiCard label="Overdue" value={fmtMoney(all.filter((i) => i.status === 'overdue').reduce((s, i) => s + bal(i), 0))} tone="danger" />
        <KpiCard label="Paid (all time)" value={fmtMoney(all.reduce((s, i) => s + i.paid, 0))} tone="success" />
      </div>
      <div className="mb-4 flex gap-1.5 overflow-x-auto scrollbar-none" role="tablist">
        {['all', 'open', 'overdue', 'partially_paid', 'unpaid', 'paid'].map((k) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium capitalize', tab === k ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground')}>{k.replace('_', ' ')}</button>)}
      </div>
      <QueryView query={q}>
        {() => (
          <DataTable<Invoice> testId="invoices-table" rows={rows} rowKey={(i) => i.id}
            columns={[
              { key: 'n', header: 'Invoice', cell: (i) => <div><div className="font-mono text-xs font-semibold">{i.number}</div><div className="font-mono text-[11px] text-muted-foreground">{i.orderNumber}</div></div> },
              { key: 'd', header: 'Date', cell: (i) => fmtDate(i.date) },
              { key: 'due', header: 'Due date', cell: (i) => <span className={i.status === 'overdue' ? 'font-medium text-rose-600' : ''}>{fmtDate(i.dueDate)}</span> },
              { key: 'a', header: 'Amount', cell: (i) => fmtMoney(i.amount, true), align: 'right' },
              { key: 'b', header: 'Balance', cell: (i) => <span className="font-medium">{fmtMoney(bal(i), true)}</span>, align: 'right' },
              { key: 's', header: 'Status', cell: (i) => <StatusBadge status={i.status} /> },
              { key: 'x', header: '', cell: (i) => <Actions i={i} />, align: 'right' },
            ]}
            mobileCard={(i) => (
              <div><div className="flex items-start justify-between"><div><div className="font-mono text-xs font-semibold">{i.number}</div><div className="text-xs text-muted-foreground">Issued {fmtDate(i.date)} · due {fmtDate(i.dueDate)}</div></div><StatusBadge status={i.status} /></div>
                <div className="mt-2 flex items-center justify-between"><span className="text-sm">Balance <b className="tabular">{fmtMoney(bal(i))}</b> <span className="text-xs text-muted-foreground">of {fmtMoney(i.amount)}</span></span><Actions i={i} /></div></div>
            )}
          />
        )}
      </QueryView>
    </div>
  );
}
