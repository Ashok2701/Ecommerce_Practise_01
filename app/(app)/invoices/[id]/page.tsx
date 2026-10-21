'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, Download, HandCoins, Send } from 'lucide-react';
import { toast } from 'sonner';
import { invoiceService, type InvoiceDetail } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useAccess } from '@/lib/auth/permissions';
import { useSettings } from '@/lib/settings';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtMoney, fmtNumber } from '@/lib/format';
import { QueryView, LoadingState, SectionCard } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { BackLink, Facts, RefLink } from '@/features/detail/DetailBits';
import { PayOnlineDialog, RecordPaymentDialog } from '@/features/payments/PaymentDialogs';
import { isCustomerRole } from '@/types/domain';

export default function InvoicePage() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const user = useUser();
  const { can } = useAccess(user.role);
  const q = useQuery({
    queryKey: ['invoice', id],
    queryFn: async () => {
      const d = await invoiceService.getInvoice(id);
      // customers only ever see their own invoices (the backend enforces this too)
      if (isCustomerRole(user.role) && d.invoice.customerId !== user.customerId) throw new Error('errors.notFound');
      // reps only see their own customers' invoices
      if (user.role === 'SALES_REP' && d.customer.salesRepId !== user.id) throw new Error('errors.notFound');
      return d;
    },
  });
  return (
    <div>
      {can('invoices') ? <BackLink href="/invoices" label={t('invoices.title')} /> : <BackLink href="/collections" label={t('collections.title')} />}
      <QueryView query={q} loading={<LoadingState variant="detail" />}>{(d) => <Detail d={d} />}</QueryView>
    </div>
  );
}

function Detail({ d }: { d: InvoiceDetail }) {
  const { t } = useT();
  const user = useUser();
  const settings = useSettings();
  const { can } = useAccess(user.role);
  const { invoice: i, order: o, customer: c } = d;
  const customer = isCustomerRole(user.role);
  const [pay, setPay] = useState(false);
  const [record, setRecord] = useState(false);
  const balance = Math.round((i.amount - i.paid) * 100) / 100;
  const open = i.status !== 'paid';
  // paid in the ERP before these payments were recorded in the portal
  const earlier = Math.round((i.paid - d.payments.reduce((s, x) => s + x.amount, 0)) * 100) / 100;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h1 className="font-mono text-xl font-semibold" data-testid="invoice-number">{i.number}</h1><StatusBadge status={i.status} />
            {d.daysOverdue > 0 && <span className="rounded-md bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{t('collections.daysOverdue', { count: d.daysOverdue })}</span>}</div>
          <p className="mt-1 text-sm text-muted-foreground">{customer ? c.name : <RefLink href={`/customers/${c.id}`}>{c.name}</RefLink>} · {t('invoices.issuedDue', { issued: fmtDate(i.date), due: fmtDate(i.dueDate) })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => toast.info(t('invoices.pdfInfo', { erp: settings.erpName, number: i.number }))}><Download className="me-2 h-4 w-4" aria-hidden="true" />PDF</Button>
          {customer && open && <>
            <Button variant="outline" onClick={() => setRecord(true)} data-testid="inv-advice"><Send className="me-2 h-4 w-4" aria-hidden="true" />{t('payments.tellUs')}</Button>
            <Button onClick={() => setPay(true)} data-testid="inv-pay"><CreditCard className="me-2 h-4 w-4" aria-hidden="true" />{t('invoices.payAmount', { amount: fmtMoney(balance, true) })}</Button>
          </>}
          {!customer && open && can('collections') && <Button onClick={() => setRecord(true)} data-testid="inv-record"><HandCoins className="me-2 h-4 w-4" aria-hidden="true" />{t('collections.record')}</Button>}
        </div>
      </div>

      <Card className="p-4">
        <Facts cols={4} items={[
          [t('invoices.col.amount'), <span className="tabular">{fmtMoney(i.amount, true)}</span>],
          [t('invoices.detail.paid'), <span className="tabular">{fmtMoney(i.paid, true)}</span>],
          [t('invoices.col.balance'), <span className="tabular" data-testid="invoice-balance">{fmtMoney(balance, true)}</span>],
          [t('invoices.detail.terms'), c.paymentTerms],
        ]} />
        <Progress value={i.amount ? Math.min(100, (i.paid / i.amount) * 100) : 0} className="mt-4 h-2" aria-label={t('invoices.detail.paid')} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px] [&>*]:min-w-0">
        <div className="space-y-4">
          {o && (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm" data-testid="invoice-lines">
                <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
                  <th className="px-4 py-2.5 text-start font-medium">{t('inventory.col.product')}</th>
                  <th className="px-3 py-2.5 text-end font-medium">{t('requests.detail.qty')}</th>
                  <th className="px-3 py-2.5 text-end font-medium">{t('common.unitPrice')}</th>
                  <th className="px-4 py-2.5 text-end font-medium">{t('requests.detail.lineTotal')}</th>
                </tr></thead>
                <tbody className="divide-y">{o.lines.map((l) => (
                  <tr key={l.productId}>
                    <td className="px-4 py-2.5"><RefLink href={customer ? `/catalog/${l.productId}` : `/inventory/${l.productId}`} className="font-medium">{l.name}</RefLink><div className="font-mono text-[11px] text-muted-foreground">{l.sku}</div></td>
                    <td className="px-3 py-2.5 text-end tabular">{fmtNumber(l.quantity)} {l.uom}</td>
                    <td className="px-3 py-2.5 text-end tabular">{fmtMoney(l.unitPrice, true)}{l.discountPct ? <div className="text-[11px] text-emerald-700 dark:text-emerald-400">−{l.discountPct}%</div> : null}</td>
                    <td className="px-4 py-2.5 text-end font-medium tabular">{fmtMoney(l.lineTotal, true)}</td>
                  </tr>
                ))}</tbody>
                <tfoot className="border-t bg-muted/20 text-sm">
                  <tr><td className="px-4 py-2" colSpan={3}>{t('common.subtotal')}</td><td className="px-4 py-2 text-end tabular">{fmtMoney(o.subtotal, true)}</td></tr>
                  {o.discount > 0 && <tr><td className="px-4 py-2 text-muted-foreground" colSpan={3}>{t('common.discount')}</td><td className="px-4 py-2 text-end tabular text-emerald-700 dark:text-emerald-400">−{fmtMoney(o.discount, true)}</td></tr>}
                  <tr><td className="px-4 py-2 text-muted-foreground" colSpan={3}>{t('common.tax')}</td><td className="px-4 py-2 text-end tabular text-muted-foreground">{fmtMoney(o.tax, true)}</td></tr>
                  <tr><td className="px-4 py-2.5 font-semibold" colSpan={3}>{t('common.total')}</td><td className="px-4 py-2.5 text-end font-semibold tabular">{fmtMoney(i.amount, true)}</td></tr>
                </tfoot>
              </table>
            </Card>
          )}
          <SectionCard title={t('invoices.detail.payments')}>
            {d.payments.length || d.pending.length || earlier > 0.009 ? (
              <ul className="divide-y" data-testid="invoice-payments">
                {d.payments.map(({ payment: p, amount }) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0"><RefLink href={`/payments/${p.id}`} className="font-mono text-xs font-semibold">{p.number ?? p.reference}</RefLink><div className="text-xs text-muted-foreground">{fmtDate(p.date)} · {t(`payments.methods.${p.method}`)} · {p.reference}</div></div>
                    <span className="font-semibold tabular">{fmtMoney(amount, true)}</span>
                  </li>
                ))}
                {earlier > 0.009 && (
                  <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm" data-testid="invoice-earlier">
                    <div className="min-w-0"><div className="text-xs font-semibold">{t('invoices.detail.earlier', { erp: settings.erpName })}</div><div className="text-xs text-muted-foreground">{t('invoices.detail.earlierHint')}</div></div>
                    <span className="font-semibold tabular">{fmtMoney(earlier, true)}</span>
                  </li>
                )}
                {d.pending.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0"><RefLink href={`/payments/${p.id}`} className="font-mono text-xs font-semibold">{p.number}</RefLink><div className="text-xs text-muted-foreground">{fmtDate(p.date)} · {t(`payments.methods.${p.method}`)} · {p.reference}</div></div>
                    <div className="flex items-center gap-2"><StatusBadge status="pending_verification" /><span className="font-semibold tabular text-muted-foreground">{fmtMoney(p.amount, true)}</span></div>
                  </li>
                ))}
              </ul>
            ) : <p className="p-4 text-sm text-muted-foreground">{t('account.noPayments')}</p>}
          </SectionCard>
        </div>
        <div className="space-y-4">
          <SectionCard title={t('invoices.detail.related')} bodyClassName="p-4">
            <Facts items={[
              [t('invoices.detail.order'), o ? <RefLink href={`/orders/${o.id}`} className="font-mono text-xs">{o.number}</RefLink> : i.orderNumber],
              [t('invoices.detail.customerPo'), o?.poNumber],
              [t('deliveries.col.number'), d.delivery ? <span className="inline-flex items-center gap-2"><RefLink href={customer ? `/orders/${o?.id}` : `/deliveries/${d.delivery.id}`} className="font-mono text-xs">{d.delivery.number}</RefLink><StatusBadge status={d.delivery.status} /></span> : undefined],
              [t('invoices.detail.erpRef'), o?.erpRef],
            ]} cols={1} />
          </SectionCard>
          <SectionCard title={t('invoices.detail.billTo')} bodyClassName="p-4 text-sm">
            <div className="font-medium">{c.name}</div>
            <p className="text-muted-foreground">{c.billingAddress.line1}<br />{c.billingAddress.city}, {c.billingAddress.state} {c.billingAddress.postalCode}</p>
            {c.gstin && <p className="mt-2 font-mono text-xs text-muted-foreground">GSTIN {c.gstin}</p>}
          </SectionCard>
        </div>
      </div>
      {customer && pay && <PayOnlineDialog open={pay} onOpenChange={setPay} customerId={c.id} invoices={[i]} preselect={[i.id]} />}
      <RecordPaymentDialog open={record} onOpenChange={setRecord} customerId={c.id} invoices={[i]} staff={!customer} preselect={[i.id]} />
    </div>
  );
}
