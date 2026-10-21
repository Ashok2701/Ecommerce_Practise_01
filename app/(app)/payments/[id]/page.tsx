'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { paymentService, customerService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useAccess } from '@/lib/auth/permissions';
import { useSettings } from '@/lib/settings';
import { useErrorText, useT } from '@/lib/i18n';
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import { QueryView, LoadingState, SectionCard } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BackLink, Facts, RefLink } from '@/features/detail/DetailBits';
import { isCustomerRole, isManagerRole, type Invoice, type Payment } from '@/types/domain';

/** Payment receipt: how it was paid, which invoices it settled, and who checked it. */
export default function PaymentPage() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const user = useUser();
  const { can } = useAccess(user.role);
  const q = useQuery({
    queryKey: ['payment', id],
    queryFn: async () => {
      const d = await paymentService.get(id);
      if (isCustomerRole(user.role) && d.payment.customerId !== user.customerId) throw new Error('errors.payments.notFound');
      if (user.role === 'SALES_REP' && (await customerService.getCustomer(d.payment.customerId)).salesRepId !== user.id) throw new Error('errors.payments.notFound');
      return d;
    },
  });
  const back = can('collections') ? ['/collections?tab=payments', t('collections.title')] : can('account') ? ['/account', t('account.title')] : ['/invoices', t('invoices.title')];
  return (
    <div>
      <BackLink href={back[0]} label={back[1]} />
      <QueryView query={q} loading={<LoadingState variant="detail" />}>{(d) => <Detail p={d.payment} invoices={d.invoices} />}</QueryView>
    </div>
  );
}

function Detail({ p, invoices }: { p: Payment; invoices: Invoice[] }) {
  const { t } = useT();
  const errorText = useErrorText();
  const settings = useSettings();
  const user = useUser();
  const qc = useQueryClient();
  const actor = { id: user.id, name: user.name, role: user.role };
  const customer = isCustomerRole(user.role);
  const canVerify = isManagerRole(user.role) && p.status === 'pending_verification';
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const verify = useMutation({ mutationFn: () => paymentService.verify(p.id, actor), onSuccess: () => { qc.invalidateQueries(); toast.success(t('payments.msg.verified', { number: p.number ?? '' })); }, onError: (e) => toast.error(errorText(e)) });
  const reject = useMutation({ mutationFn: () => paymentService.reject(p.id, actor, reason), onSuccess: () => { qc.invalidateQueries(); setRejectOpen(false); toast.success(t('payments.msg.rejected')); }, onError: (e) => toast.error(errorText(e)) });
  const allocations = p.allocations ?? invoices.map((i) => ({ invoiceId: i.id, invoiceNumber: i.number, amount: undefined as number | undefined }));
  const allocated = (p.allocations ?? []).reduce((s, a) => s + a.amount, 0);
  const onAccount = p.status === 'posted' && p.allocations ? Math.round((p.amount - allocated) * 100) / 100 : 0;
  const status = p.status ?? 'posted';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h1 className="font-mono text-xl font-semibold" data-testid="payment-number">{p.number ?? p.reference}</h1><StatusBadge status={status} /></div>
          <p className="mt-1 text-sm text-muted-foreground">{customer ? p.customerName : <RefLink href={`/customers/${p.customerId}`}>{p.customerName}</RefLink>} · {fmtDate(p.date)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {status === 'posted' && <Button variant="outline" onClick={() => toast.info(t('payments.receiptInfo', { erp: settings.erpName }))}><Download className="me-2 h-4 w-4" aria-hidden="true" />{t('payments.receipt')}</Button>}
          {canVerify && <>
            <Button variant="outline" className="text-destructive" onClick={() => setRejectOpen(true)} data-testid="pay-reject"><XCircle className="me-2 h-4 w-4" aria-hidden="true" />{t('payments.notFound')}</Button>
            <Button onClick={() => verify.mutate()} disabled={verify.isPending} data-testid="pay-verify"><CheckCircle2 className="me-2 h-4 w-4" aria-hidden="true" />{t('payments.verify')}</Button>
          </>}
        </div>
      </div>

      {status === 'pending_verification' && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{t('payments.verifyHint')}</p>}
      {status === 'rejected' && p.note && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-500/10 dark:text-rose-200" data-testid="payment-rejected">{t('payments.rejectedBecause', { reason: p.note })}</p>}

      <Card className="p-4">
        <Facts cols={4} items={[
          [t('payments.amount'), <span className="text-lg tabular">{fmtMoney(p.amount, true)}</span>],
          [t('payments.method'), t(`payments.methods.${p.method}`)],
          [p.method === 'Cheque' ? t('payments.chequeNo') : t('payments.reference'), <span className="font-mono text-xs">{p.reference}</span>],
          [t('payments.source'), t(`payments.sources.${p.source ?? 'erp'}`)],
          [t('payments.detail.enteredBy'), p.enteredBy ? `${p.enteredBy.name} · ${t(`roles.${p.enteredBy.role}`)}` : undefined],
          [t('payments.detail.verifiedBy'), p.verifiedBy ? `${p.verifiedBy}${p.verifiedAt ? ` · ${fmtDateTime(p.verifiedAt)}` : ''}` : undefined],
          [t('payments.onAccount'), onAccount > 0 ? <span className="tabular">{fmtMoney(onAccount, true)}</span> : undefined],
          [t('payments.note'), status !== 'rejected' ? p.note : undefined],
        ]} />
      </Card>

      <SectionCard title={status === 'posted' ? t('payments.detail.allocated') : t('payments.detail.forInvoices')}>
        {allocations.length ? (
          <ul className="divide-y" data-testid="payment-allocations">{allocations.map((a) => {
            const inv = invoices.find((i) => i.id === a.invoiceId || i.number === a.invoiceNumber);
            return (
              <li key={a.invoiceNumber} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0"><RefLink href={`/invoices/${inv?.id ?? a.invoiceId}`} className="font-mono text-xs font-semibold">{a.invoiceNumber}</RefLink>{inv && <div className="text-xs text-muted-foreground">{t('invoices.due', { date: fmtDate(inv.dueDate) })}</div>}</div>
                <div className="flex items-center gap-2">{inv && <StatusBadge status={inv.status} />}{a.amount !== undefined && <span className="font-semibold tabular">{fmtMoney(a.amount, true)}</span>}</div>
              </li>
            );
          })}</ul>
        ) : <p className="p-4 text-sm text-muted-foreground">{t('payments.onAccount')}</p>}
      </SectionCard>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('payments.rejectTitle', { number: p.number ?? '' })}</DialogTitle><DialogDescription>{t('payments.rejectText')}</DialogDescription></DialogHeader>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} aria-label={t('purchaseOrders.reason')} data-testid="pay-reject-reason" />
          <DialogFooter className="gap-2"><Button variant="ghost" onClick={() => setRejectOpen(false)}>{t('common.cancel')}</Button><Button variant="destructive" disabled={!reason.trim() || reject.isPending} onClick={() => reject.mutate()} data-testid="pay-reject-confirm">{t('payments.notFound')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
