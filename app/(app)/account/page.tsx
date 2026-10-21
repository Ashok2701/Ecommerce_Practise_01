'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Wallet, CreditCard, AlertTriangle, CalendarClock, Download, Building2, Landmark, Send } from 'lucide-react';
import { toast } from 'sonner';
import { invoiceService, customerService, paymentService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useSettings } from '@/lib/settings';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtMoney } from '@/lib/format';
import { PageHeader, QueryView, KpiCard, SectionCard, LoadingState, EmptyState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { PayOnlineDialog, RecordPaymentDialog } from '@/features/payments/PaymentDialogs';

export default function AccountPage() {
  const { t } = useT();
  const user = useUser();
  const settings = useSettings();
  const b2c = user.role === 'CUSTOMER_B2C';
  const q = useQuery({ queryKey: ['account', user.customerId], queryFn: () => invoiceService.getAccountSummary(user.customerId!) });
  const c = useQuery({ queryKey: ['customer', user.customerId], queryFn: () => customerService.getCustomer(user.customerId!) });
  // includes advices still waiting for verification
  const pays = useQuery({ queryKey: ['payments', user.customerId], queryFn: () => paymentService.list({ customerId: user.customerId }) });
  const [payOpen, setPayOpen] = useState(false);
  const [adviceOpen, setAdviceOpen] = useState(false);
  return (
    <div>
      <PageHeader title={t('account.title')} description={t('account.intro', { erp: settings.erpName })}
        actions={<Button variant="outline" onClick={() => toast.info(t('account.statementInfo', { erp: settings.erpName }))} data-testid="download-statement"><Download className="me-2 h-4 w-4" aria-hidden="true" />{t('account.statement')}</Button>} />
      <QueryView query={q} loading={<LoadingState variant="kpis" />}>
        {(a) => {
          const due = a.invoices.filter((i) => i.status !== 'paid');
          return (
            <div className="space-y-4">
              {!b2c && (<>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <KpiCard testId="acct-outstanding" label={t('account.outstanding')} value={fmtMoney(a.outstanding)} icon={Wallet} />
                  <KpiCard label={t('account.creditLimit')} value={fmtMoney(a.creditLimit)} icon={CreditCard} hint={a.paymentTerms} />
                  <KpiCard label={t('account.available')} value={fmtMoney(a.available)} icon={CreditCard} tone="success" />
                  <KpiCard label={t('account.overdue')} value={fmtMoney(a.overdue)} icon={AlertTriangle} tone={a.overdue ? 'danger' : 'success'} hint={a.dueSoon ? t('account.dueSoon', { amount: fmtMoney(a.dueSoon) }) : undefined} />
                </div>
                {a.creditLimit > 0 && <div><Progress value={Math.min(100, (a.outstanding / a.creditLimit) * 100)} className="h-2" aria-label={t('account.utilisation')} /><p className="mt-1 text-xs text-muted-foreground">{t('account.used', { pct: Math.round((a.outstanding / a.creditLimit) * 100) })}</p></div>}
              </>)}
              <div className="grid gap-4 lg:grid-cols-3">
                <SectionCard title={t('account.dueInvoices')} className="lg:col-span-2" action={<Link href="/invoices" className="text-xs font-medium text-primary">{t('account.allInvoices')}</Link>}>
                  {due.length ? (<>
                    <ul className="divide-y">{due.map((i) => (
                      <li key={i.id} className="flex items-center gap-3 px-4 py-3"><CalendarClock className={i.status === 'overdue' ? 'h-4 w-4 text-rose-600' : 'h-4 w-4 text-muted-foreground'} aria-hidden="true" /><div className="min-w-0 flex-1"><div className="font-mono text-xs font-semibold">{i.number}</div><div className="text-xs text-muted-foreground">{t('invoices.due', { date: fmtDate(i.dueDate) })}</div></div><StatusBadge status={i.status} /><span className="w-24 text-end text-sm font-semibold tabular">{fmtMoney(i.amount - i.paid)}</span></li>
                    ))}</ul>
                    <div className="flex flex-wrap justify-end gap-2 border-t p-3">
                      <Button variant="outline" onClick={() => setAdviceOpen(true)} data-testid="acct-advice"><Send className="me-2 h-4 w-4" aria-hidden="true" />{t('payments.tellUs')}</Button>
                      <Button onClick={() => setPayOpen(true)} data-testid="acct-pay"><CreditCard className="me-2 h-4 w-4" aria-hidden="true" />{t('payments.payOnline')}</Button>
                    </div>
                  </>) : <div className="p-4"><EmptyState title={t('account.noDues')} description={t('account.noDuesText')} /></div>}
                </SectionCard>
                <SectionCard title={t('account.bankDetails')} bodyClassName="p-4 text-sm">
                  <div className="flex items-start gap-3"><Landmark className="mt-0.5 h-4 w-4 text-primary" aria-hidden="true" /><div><div className="font-medium">{settings.companyName}</div><div className="text-muted-foreground">HDFC Bank · A/c 50200041128890<br />IFSC HDFC0000521 · Hyderabad</div></div></div>
                  <p className="mt-3 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">{t('account.bankHint')}</p>
                </SectionCard>
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <SectionCard title={t('account.paymentHistory')} className="lg:col-span-2">
                  <div className="overflow-x-auto"><table className="w-full text-sm" data-testid="acct-payments"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>
                    <th className="px-4 py-2 text-start font-medium">{t('payments.date')}</th><th className="px-4 py-2 text-start font-medium">{t('payments.reference')}</th><th className="hidden px-4 py-2 text-start font-medium sm:table-cell">{t('nav.invoices')}</th><th className="px-4 py-2 text-start font-medium">{t('payments.method')}</th><th className="px-4 py-2 text-start font-medium">{t('common.status')}</th><th className="px-4 py-2 text-end font-medium">{t('payments.amount')}</th></tr></thead>
                    <tbody className="divide-y">{(pays.data ?? a.payments).slice(0, 12).map((p) => <tr key={p.id}><td className="whitespace-nowrap px-4 py-2.5">{fmtDate(p.date)}</td><td className="px-4 py-2.5 font-mono text-xs">{p.reference}</td><td className="hidden px-4 py-2.5 font-mono text-xs sm:table-cell">{p.invoiceNumbers.join(', ') || '—'}</td><td className="px-4 py-2.5">{t(`payments.methods.${p.method}`)}</td><td className="px-4 py-2.5"><StatusBadge status={p.status ?? 'posted'} /></td><td className="px-4 py-2.5 text-end font-medium tabular">{fmtMoney(p.amount)}</td></tr>)}</tbody></table>
                    {!(pays.data ?? a.payments).length && <div className="p-4"><EmptyState title={t('account.noPayments')} /></div>}</div>
                </SectionCard>
                <SectionCard title={<span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" aria-hidden="true" />{t('account.profile')}</span>} bodyClassName="p-4">
                  {c.data ? <dl className="space-y-2.5 text-sm">{([['company', c.data.name], ['code', c.data.code], ['gstin', c.data.gstin || '—'], ['contact', `${c.data.contactName} · ${c.data.phone}`], ['email', c.data.email], ['address', `${c.data.address.line1}, ${c.data.address.city}, ${c.data.address.state} ${c.data.address.postalCode}`], ...(b2c ? [] : [['tier', t('account.tierValue', { tier: c.data.priceTier })]])] as [string, string][]).map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{t(`account.field.${k}`)}</dt><dd className="break-words font-medium">{v}</dd></div>)}</dl> : <LoadingState rows={3} />}
                  <Button variant="outline" size="sm" className="mt-4 w-full" asChild><Link href="/messages">{t('account.requestChange')}</Link></Button>
                </SectionCard>
              </div>
              {payOpen && <PayOnlineDialog open={payOpen} onOpenChange={setPayOpen} customerId={user.customerId!} invoices={a.invoices} />}
              <RecordPaymentDialog open={adviceOpen} onOpenChange={setAdviceOpen} customerId={user.customerId!} invoices={a.invoices} staff={false} />
            </div>
          );
        }}
      </QueryView>
    </div>
  );
}
