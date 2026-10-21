'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BellRing, CalendarCheck, CheckCircle2, Clock, HandCoins, NotebookPen, Wallet, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { invoiceService, paymentService, type AgingRow } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useErrorText, useT } from '@/lib/i18n';
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import { PageHeader, QueryView, EmptyState, KpiCard, LoadingState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RecordPaymentDialog } from '@/features/payments/PaymentDialogs';
import { cn } from '@/lib/utils';
import { isManagerRole, type Payment } from '@/types/domain';

type Tab = 'aging' | 'verify' | 'payments';
const BUCKETS = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90'] as const;

function Collections() {
  const { t } = useT();
  const user = useUser();
  const params = useSearchParams();
  const manager = isManagerRole(user.role);
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) ?? 'aging');
  const [cust, setCust] = useState<string | null>(params.get('customer'));
  const scope = user.role === 'SALES_REP' ? { salesRepId: user.id } : {};
  const aging = useQuery({ queryKey: ['aging', scope], queryFn: () => paymentService.aging(scope) });
  const pending = useQuery({ queryKey: ['payments', 'pending'], queryFn: () => paymentService.list({ status: 'pending_verification' }) });
  const recent = useQuery({ queryKey: ['payments', 'all'], queryFn: () => paymentService.list({ status: 'all' }), enabled: tab === 'payments' });
  const rows = aging.data ?? [];
  const mineIds = new Set(rows.map((r) => r.customerId));
  const pend = (pending.data ?? []).filter((p) => manager || mineIds.has(p.customerId));
  const sum = (k: keyof AgingRow) => rows.reduce((s, r) => s + (r[k] as number), 0);
  const tabs: Tab[] = ['aging', 'verify', 'payments'];
  return (
    <div>
      <PageHeader title={t('collections.title')} description={user.role === 'SALES_REP' ? t('collections.introRep') : t('collections.introManager')} />
      {aging.isLoading ? <LoadingState variant="kpis" /> : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard testId="col-kpi-total" label={t('collections.kpi.outstanding')} value={fmtMoney(sum('total'))} icon={Wallet} />
          <KpiCard testId="col-kpi-overdue" label={t('collections.kpi.overdue')} value={fmtMoney(sum('overdue'))} icon={AlertTriangle} tone="danger" />
          <KpiCard label={t('collections.kpi.over90')} value={fmtMoney(sum('d90'))} icon={Clock} tone="warning" />
          <KpiCard testId="col-kpi-pending" label={t('collections.kpi.toVerify')} value={fmtMoney(pend.reduce((s, p) => s + p.amount, 0))} hint={t('collections.kpi.toVerifyHint', { count: pend.length })} icon={HandCoins} onClick={() => setTab('verify')} />
        </div>
      )}
      <div className="mb-4 mt-5 flex gap-1.5" role="tablist">
        {tabs.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`col-tab-${k}`}
            className={cn('rounded-md border px-3 py-1.5 text-xs font-medium', tab === k ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}>
            {t(`collections.tabs.${k}`)}{k === 'verify' && pend.length ? <span className="ms-1 tabular opacity-70">{pend.length}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'aging' && (
        <QueryView query={aging}>
          {() => rows.length ? (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full min-w-[860px] text-sm" data-testid="aging-table">
                <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
                  <th className="px-4 py-2.5 text-start font-medium">{t('quotes.col.customer')}</th>
                  {BUCKETS.map((b) => <th key={b} className="px-3 py-2.5 text-end font-medium">{t(`collections.bucket.${b}`)}</th>)}
                  <th className="px-3 py-2.5 text-end font-medium">{t('common.total')}</th>
                  <th className="px-4 py-2.5 text-start font-medium">{t('collections.followUp')}</th>
                </tr></thead>
                <tbody className="divide-y">{rows.map((r) => (
                  <tr key={r.customerId} className="cursor-pointer hover:bg-muted/40" onClick={() => setCust(r.customerId)} data-testid={`aging-${r.customerId}`}>
                    <td className="px-4 py-2.5"><div className="font-medium">{r.customerName}</div><div className="flex items-center gap-2 text-[11px] text-muted-foreground"><span className="font-mono">{r.customerCode}</span>{r.status === 'on_hold' && <StatusBadge status="on_hold" />}</div></td>
                    {BUCKETS.map((b) => <td key={b} className={cn('px-3 py-2.5 text-end tabular', !r[b] && 'text-muted-foreground', r[b] && b === 'd90' && 'font-semibold text-rose-600', r[b] && ['d61_90', 'd31_60'].includes(b) && 'text-amber-700 dark:text-amber-400')}>{r[b] ? fmtMoney(r[b]) : '—'}</td>)}
                    <td className="px-3 py-2.5 text-end font-semibold tabular">{fmtMoney(r.total)}</td>
                    <td className="px-4 py-2.5 text-xs">
                      {r.openPromise ? <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />{t('collections.promised', { amount: fmtMoney(r.openPromise.promiseAmount ?? 0), date: fmtDate(r.openPromise.promiseDate!) })}</span>
                        : r.brokenPromises ? <span className="text-rose-600">{t('collections.broken', { count: r.brokenPromises })}</span> : <span className="text-muted-foreground">{r.lastPayment ? t('collections.lastPaid', { date: fmtDate(r.lastPayment.date) }) : '—'}</span>}
                      {r.pendingVerification > 0 && <div className="text-muted-foreground">{t('collections.pendingAmount', { amount: fmtMoney(r.pendingVerification) })}</div>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <EmptyState icon={HandCoins} title={t('collections.empty')} />}
        </QueryView>
      )}

      {tab === 'verify' && (pend.length ? (
        <div className="space-y-2" data-testid="verify-list">{pend.map((p) => <VerifyRow key={p.id} p={p} canVerify={manager} />)}</div>
      ) : <EmptyState icon={CheckCircle2} title={t('collections.nothingToVerify')} />)}

      {tab === 'payments' && (
        <QueryView query={recent}>
          {(list) => (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
                <th className="px-4 py-2.5 text-start font-medium">{t('payments.receipt')}</th><th className="px-3 py-2.5 text-start font-medium">{t('quotes.col.customer')}</th><th className="px-3 py-2.5 text-start font-medium">{t('payments.method')}</th><th className="px-3 py-2.5 text-start font-medium">{t('payments.source')}</th><th className="px-3 py-2.5 text-start font-medium">{t('common.status')}</th><th className="px-4 py-2.5 text-end font-medium">{t('payments.amount')}</th></tr></thead>
                <tbody className="divide-y">{list.filter((p) => manager || mineIds.has(p.customerId)).slice(0, 40).map((p) => (
                  <tr key={p.id}><td className="px-4 py-2.5"><Link href={`/payments/${p.id}`} className="font-mono text-xs font-semibold text-primary hover:underline" data-testid={`col-pay-${p.id}`}>{p.number ?? p.reference}</Link><div className="text-xs text-muted-foreground">{fmtDate(p.date)}</div></td><td className="px-3 py-2.5"><Link href={`/customers/${p.customerId}?tab=finance`} className="hover:text-primary">{p.customerName ?? p.customerId}</Link></td>
                    <td className="px-3 py-2.5">{t(`payments.methods.${p.method}`)} <span className="font-mono text-xs text-muted-foreground">{p.reference}</span></td><td className="px-3 py-2.5 text-xs text-muted-foreground">{t(`payments.sources.${p.source ?? 'erp'}`)}</td><td className="px-3 py-2.5"><StatusBadge status={p.status ?? 'posted'} /></td><td className="px-4 py-2.5 text-end font-medium tabular">{fmtMoney(p.amount)}</td></tr>
                ))}</tbody></table>
            </Card>
          )}
        </QueryView>
      )}
      <CustomerPanel customerId={cust} row={rows.find((r) => r.customerId === cust)} onClose={() => setCust(null)} />
    </div>
  );
}

function VerifyRow({ p, canVerify }: { p: Payment; canVerify: boolean }) {
  const { t } = useT();
  const errorText = useErrorText();
  const user = useUser();
  const qc = useQueryClient();
  const actor = { id: user.id, name: user.name, role: user.role };
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const verify = useMutation({ mutationFn: () => paymentService.verify(p.id, actor), onSuccess: () => { qc.invalidateQueries(); toast.success(t('payments.msg.verified', { number: p.number ?? '' })); }, onError: (e) => toast.error(errorText(e)) });
  const reject = useMutation({ mutationFn: () => paymentService.reject(p.id, actor, reason), onSuccess: () => { qc.invalidateQueries(); setRejectOpen(false); toast.success(t('payments.msg.rejected')); }, onError: (e) => toast.error(errorText(e)) });
  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid={`verify-${p.number}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><Link href={`/payments/${p.id}`} className="font-mono text-sm font-semibold text-primary hover:underline">{p.number}</Link><StatusBadge status="pending_verification" /><span className="text-xs text-muted-foreground">{t(`payments.sources.${p.source ?? 'advice'}`)}</span></div>
        <div className="mt-1 text-sm"><span className="font-medium">{p.customerName}</span> · {t(`payments.methods.${p.method}`)} <span className="font-mono text-xs">{p.reference}</span> · {fmtDate(p.date)}</div>
        <div className="text-xs text-muted-foreground">{p.invoiceNumbers.length ? p.invoiceNumbers.join(', ') : t('payments.onAccount')} · {t('payments.enteredBy', { name: p.enteredBy?.name ?? '' })}{p.note ? ` · ${p.note}` : ''}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="me-2 text-lg font-semibold tabular">{fmtMoney(p.amount, true)}</span>
        {canVerify && <><Button variant="outline" className="text-destructive" onClick={() => setRejectOpen(true)} data-testid={`reject-${p.number}`}><XCircle className="me-1.5 h-4 w-4" aria-hidden="true" />{t('payments.notFound')}</Button>
          <Button onClick={() => verify.mutate()} disabled={verify.isPending} data-testid={`verify-btn-${p.number}`}><CheckCircle2 className="me-1.5 h-4 w-4" aria-hidden="true" />{t('payments.verify')}</Button></>}
      </div>
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('payments.rejectTitle', { number: p.number ?? '' })}</DialogTitle><DialogDescription>{t('payments.rejectText')}</DialogDescription></DialogHeader>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} aria-label={t('purchaseOrders.reason')} />
          <DialogFooter className="gap-2"><Button variant="ghost" onClick={() => setRejectOpen(false)}>{t('common.cancel')}</Button><Button variant="destructive" disabled={!reason.trim() || reject.isPending} onClick={() => reject.mutate()} data-testid="reject-confirm">{t('payments.notFound')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** One customer's dues, follow-ups and actions. */
function CustomerPanel({ customerId, row, onClose }: { customerId: string | null; row?: AgingRow; onClose: () => void }) {
  const { t } = useT();
  const errorText = useErrorText();
  const user = useUser();
  const qc = useQueryClient();
  const actor = { id: user.id, name: user.name, role: user.role };
  const inv = useQuery({ queryKey: ['invoices', customerId], queryFn: () => invoiceService.getInvoices(customerId!), enabled: !!customerId });
  const notes = useQuery({ queryKey: ['col-notes', customerId], queryFn: () => paymentService.notes(customerId!), enabled: !!customerId });
  const [recordOpen, setRecordOpen] = useState(false);
  const [mode, setMode] = useState<'promise' | 'note' | null>(null);
  const [text, setText] = useState('');
  const [pDate, setPDate] = useState(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [pAmount, setPAmount] = useState('');
  const addNote = useMutation({
    mutationFn: () => paymentService.addNote(customerId!, actor, { kind: mode!, text, promiseDate: mode === 'promise' ? new Date(pDate).toISOString() : undefined, promiseAmount: mode === 'promise' ? Number(pAmount) || 0 : undefined }),
    onSuccess: () => { qc.invalidateQueries(); setMode(null); setText(''); setPAmount(''); toast.success(t('collections.msg.saved')); }, onError: (e) => toast.error(errorText(e)),
  });
  const remind = useMutation({ mutationFn: () => paymentService.remind(customerId!, actor), onSuccess: () => { qc.invalidateQueries(); toast.success(t('collections.msg.reminded')); }, onError: (e) => toast.error(errorText(e)) });
  const open = (inv.data ?? []).filter((i) => i.status !== 'paid').sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return (
    <Sheet open={!!customerId} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg" data-testid="col-panel">
        <SheetHeader className="text-start"><SheetTitle><Link href={`/customers/${customerId}?tab=finance`} className="hover:text-primary" data-testid="col-panel-customer">{row?.customerName ?? ''}</Link></SheetTitle><SheetDescription>{row ? t('collections.panelSummary', { total: fmtMoney(row.total), overdue: fmtMoney(row.overdue) }) : ''}</SheetDescription></SheetHeader>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Button size="sm" onClick={() => setRecordOpen(true)} data-testid="col-record"><HandCoins className="me-1.5 h-4 w-4" aria-hidden="true" />{t('collections.record')}</Button>
          <Button size="sm" variant="outline" onClick={() => setMode('promise')} data-testid="col-promise"><CalendarCheck className="me-1.5 h-4 w-4" aria-hidden="true" />{t('collections.promise')}</Button>
          <Button size="sm" variant="outline" onClick={() => remind.mutate()} disabled={remind.isPending || !open.some((i) => i.status === 'overdue')} data-testid="col-remind"><BellRing className="me-1.5 h-4 w-4" aria-hidden="true" />{t('collections.remind')}</Button>
        </div>
        {mode && (
          <Card className="mt-3 space-y-3 p-3">
            {mode === 'promise' && <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label htmlFor="pdt" className="text-xs">{t('collections.promiseDate')}</Label><Input id="pdt" type="date" value={pDate} onChange={(e) => setPDate(e.target.value)} data-testid="promise-date" /></div>
              <div className="space-y-1"><Label htmlFor="pam" className="text-xs">{t('payments.amount')}</Label><Input id="pam" type="number" min={0} value={pAmount} onChange={(e) => setPAmount(e.target.value)} data-testid="promise-amount" /></div>
            </div>}
            <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('collections.notePlaceholder')} aria-label={t('collections.note')} data-testid="col-note-text" />
            <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setMode(null)}>{t('common.cancel')}</Button><Button size="sm" onClick={() => addNote.mutate()} disabled={!text.trim() || addNote.isPending} data-testid="col-note-save">{t('common.save')}</Button></div>
          </Card>
        )}
        <section className="mt-5">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('collections.openInvoices')}</h3>
          {open.length ? <ul className="divide-y rounded-md border">{open.map((i) => {
            const days = Math.floor((Date.now() - new Date(i.dueDate).getTime()) / 86400000);
            return <li key={i.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm"><div><Link href={`/invoices/${i.id}`} className="font-mono text-xs font-semibold text-primary hover:underline" data-testid={`col-inv-${i.number}`}>{i.number}</Link><div className={cn('text-xs', days > 0 ? 'text-rose-600' : 'text-muted-foreground')}>{days > 0 ? t('collections.daysOverdue', { count: days }) : t('invoices.due', { date: fmtDate(i.dueDate) })}</div></div><span className="font-semibold tabular">{fmtMoney(i.amount - i.paid)}</span></li>;
          })}</ul> : <p className="text-sm text-muted-foreground">{t('account.noDues')}</p>}
        </section>
        <section className="mt-5">
          <div className="mb-1.5 flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('collections.history')}</h3><Button size="sm" variant="ghost" className="h-7" onClick={() => setMode('note')}><NotebookPen className="me-1 h-3.5 w-3.5" aria-hidden="true" />{t('collections.addNote')}</Button></div>
          {(notes.data ?? []).length ? <ul className="space-y-3">{notes.data!.map((n) => (
            <li key={n.id} className="text-sm"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-medium">{t(`collections.kind.${n.kind}`)}</span>{n.outcome && <StatusBadge status={n.outcome === 'open' ? 'open' : n.outcome} />}<span className="text-xs text-muted-foreground">{fmtDateTime(n.at)} · {n.by.name}</span></div>
              {n.kind === 'promise' && <div className="text-xs font-medium">{t('collections.promised', { amount: fmtMoney(n.promiseAmount ?? 0), date: fmtDate(n.promiseDate!) })}</div>}
              <p className="text-muted-foreground">{n.text}</p></li>
          ))}</ul> : <p className="text-sm text-muted-foreground">{t('collections.noHistory')}</p>}
        </section>
        {customerId && <RecordPaymentDialog open={recordOpen} onOpenChange={setRecordOpen} customerId={customerId} invoices={inv.data ?? []} staff />}
      </SheetContent>
    </Sheet>
  );
}

export default function CollectionsPage() { return <Suspense><Collections /></Suspense>; }
