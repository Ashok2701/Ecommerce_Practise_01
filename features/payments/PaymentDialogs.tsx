'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CreditCard, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { paymentService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useErrorText, useT } from '@/lib/i18n';
import { fmtDate, fmtMoney } from '@/lib/format';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { Invoice, PaymentMethod } from '@/types/domain';

const bal = (i: Invoice) => Math.round((i.amount - i.paid) * 100) / 100;

/** Pick open invoices (oldest due first). */
function InvoicePicker({ invoices, selected, onChange }: { invoices: Invoice[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const { t } = useT();
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <ul className="max-h-60 divide-y overflow-y-auto rounded-md border" data-testid="invoice-picker">
      {invoices.map((i) => (
        <li key={i.id}>
          <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40">
            <Checkbox checked={selected.includes(i.id)} onCheckedChange={() => toggle(i.id)} aria-label={i.number} data-testid={`pick-${i.number}`} />
            <div className="min-w-0 flex-1"><div className="font-mono text-xs font-semibold">{i.number}</div><div className="text-xs text-muted-foreground">{t('invoices.due', { date: fmtDate(i.dueDate) })}</div></div>
            <StatusBadge status={i.status} />
            <span className="w-24 text-end font-semibold tabular">{fmtMoney(bal(i))}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/**
 * Online payment through the client's payment provider. In this prototype the
 * provider step is simulated; the backend creates the provider session and
 * posts the receipt when the provider confirms.
 */
export function PayOnlineDialog({ open, onOpenChange, customerId, invoices, preselect }: { open: boolean; onOpenChange: (v: boolean) => void; customerId: string; invoices: Invoice[]; preselect?: string[] }) {
  const { t } = useT();
  const errorText = useErrorText();
  const user = useUser();
  const qc = useQueryClient();
  const open_ = useMemo(() => invoices.filter((i) => i.status !== 'paid').sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [invoices]);
  const [sel, setSel] = useState<string[]>(preselect ?? open_.filter((i) => i.status === 'overdue').map((i) => i.id));
  const [method, setMethod] = useState<PaymentMethod>('UPI');
  const [step, setStep] = useState<'pick' | 'provider' | 'done'>('pick');
  const total = open_.filter((i) => sel.includes(i.id)).reduce((s, i) => s + bal(i), 0);
  const pay = useMutation({
    mutationFn: async () => { setStep('provider'); await new Promise((r) => setTimeout(r, 1200)); return paymentService.payOnline({ customerId, invoiceIds: sel, method, actor: { id: user.id, name: user.name, role: user.role } }); },
    onSuccess: (p) => { setStep('done'); qc.invalidateQueries(); toast.success(t('payments.msg.paid', { number: p.number ?? '' })); },
    onError: (e) => { setStep('pick'); toast.error(errorText(e)); },
  });
  const close = (v: boolean) => { if (!v) { setStep('pick'); } onOpenChange(v); };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{t('payments.payOnline')}</DialogTitle><DialogDescription>{t('payments.payOnlineText')}</DialogDescription></DialogHeader>
        {step === 'pick' && (<>
          <InvoicePicker invoices={open_} selected={sel} onChange={setSel} />
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('payments.method')}>
            {(['UPI', 'Card', 'NEFT'] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)} data-testid={`pay-method-${m}`}
                className={cn('rounded-md border px-3 py-2 text-sm font-medium', method === m ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted')}>{t(`payments.methods.${m}`)}</button>
            ))}
          </div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />{t('payments.secure')}</p>
          <DialogFooter className="gap-2"><Button variant="ghost" onClick={() => close(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => pay.mutate()} disabled={!sel.length || pay.isPending} data-testid="pay-confirm"><CreditCard className="me-2 h-4 w-4" aria-hidden="true" />{t('payments.payAmount', { amount: fmtMoney(total, true) })}</Button></DialogFooter>
        </>)}
        {step === 'provider' && <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground" role="status"><Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />{t('payments.provider')}</div>}
        {step === 'done' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center" data-testid="pay-done">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" aria-hidden="true" />
            <div className="font-semibold">{t('payments.thanks')}</div>
            <p className="text-sm text-muted-foreground">{t('payments.thanksText')}</p>
            <Button onClick={() => close(false)}>{t('common.close')}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Tell us about a bank transfer or cheque (customer), or record a collection (rep). Finance verifies it. */
export function RecordPaymentDialog({ open, onOpenChange, customerId, invoices, staff }: { open: boolean; onOpenChange: (v: boolean) => void; customerId: string; invoices: Invoice[]; staff: boolean }) {
  const { t } = useT();
  const errorText = useErrorText();
  const user = useUser();
  const qc = useQueryClient();
  const open_ = useMemo(() => invoices.filter((i) => i.status !== 'paid').sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [invoices]);
  const [sel, setSel] = useState<string[]>([]);
  const suggested = open_.filter((i) => sel.includes(i.id)).reduce((s, i) => s + bal(i), 0);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>(staff ? 'Cheque' : 'NEFT');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const value = amount === '' ? suggested : Number(amount) || 0;
  const save = useMutation({
    mutationFn: () => paymentService.record({ customerId, invoiceIds: sel, amount: value, method, reference, date: new Date(date).toISOString(), note, actor: { id: user.id, name: user.name, role: user.role } }),
    onSuccess: (p) => { qc.invalidateQueries(); onOpenChange(false); setSel([]); setAmount(''); setReference(''); setNote(''); toast.success(t('payments.msg.recorded', { number: p.number ?? '' })); },
    onError: (e) => toast.error(errorText(e)),
  });
  const methods: PaymentMethod[] = staff ? ['Cheque', 'NEFT', 'RTGS', 'UPI', 'Cash'] : ['NEFT', 'RTGS', 'Cheque', 'UPI'];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{staff ? t('payments.recordCollection') : t('payments.tellUs')}</DialogTitle><DialogDescription>{staff ? t('payments.recordCollectionText') : t('payments.tellUsText')}</DialogDescription></DialogHeader>
        {open_.length > 0 && <InvoicePicker invoices={open_} selected={sel} onChange={setSel} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="pa">{t('payments.amount')}</Label><Input id="pa" type="number" min={0} step="0.01" inputMode="decimal" value={amount === '' && suggested ? String(Math.round(suggested * 100) / 100) : amount} onChange={(e) => setAmount(e.target.value)} data-testid="rec-amount" /></div>
          <div className="space-y-1.5"><Label>{t('payments.method')}</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}><SelectTrigger data-testid="rec-method"><SelectValue /></SelectTrigger><SelectContent>{methods.map((m) => <SelectItem key={m} value={m}>{t(`payments.methods.${m}`)}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="pr">{method === 'Cheque' ? t('payments.chequeNo') : t('payments.reference')}</Label><Input id="pr" value={reference} onChange={(e) => setReference(e.target.value)} disabled={method === 'Cash'} placeholder={method === 'Cash' ? '—' : t('payments.referencePlaceholder')} data-testid="rec-reference" /></div>
          <div className="space-y-1.5"><Label htmlFor="pd">{t('payments.date')}</Label><Input id="pd" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="pnote">{t('payments.note')}</Label><Textarea id="pnote" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <p className="text-xs text-muted-foreground">{t('payments.verifyHint')}</p>
        <DialogFooter className="gap-2"><Button variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={() => save.mutate()} disabled={!(value > 0) || (method !== 'Cash' && !reference.trim()) || save.isPending} data-testid="rec-save">{staff ? t('payments.saveCollection') : t('payments.sendAdvice')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
