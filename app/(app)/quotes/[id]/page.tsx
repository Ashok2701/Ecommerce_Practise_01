'use client';
import { useEffect, useState } from 'react';
import { ProductRef, RefLink } from '@/features/detail/DetailBits';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ChevronLeft, MessageSquareWarning, Pencil, Save, Send, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { quoteService, discountPct, REP_MAX_DISCOUNT_PCT, DEFAULT_QUOTE_DAYS } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useErrorText, useT } from '@/lib/i18n';
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber } from '@/lib/format';
import { QueryView, LoadingState, SectionCard } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { isCustomerRole, type Quote } from '@/types/domain';

export default function QuotePage() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const user = useUser();
  const q = useQuery({ queryKey: ['quote', id], queryFn: async () => {
    const x = await quoteService.get(id);
    if (isCustomerRole(user.role) && x.customerId !== user.customerId) throw new Error('errors.quotes.notFound');
    return x;
  } });
  return (
    <div>
      <Link href="/quotes" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="me-1 h-4 w-4 rtl:rotate-180" aria-hidden="true" />{t('quotes.title')}</Link>
      <QueryView query={q} loading={<LoadingState variant="detail" />}>{(x) => <Detail key={`${x.id}-${x.status}-${x.version}`} q={x} />}</QueryView>
    </div>
  );
}

const inDays = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

function Detail({ q }: { q: Quote }) {
  const { t } = useT();
  const errorText = useErrorText();
  const user = useUser();
  const router = useRouter();
  const qc = useQueryClient();
  const actor = { id: user.id, name: user.name, role: user.role };
  const customer = isCustomerRole(user.role);
  const staff = !customer;
  const editableStatus = ['requested', 'draft'].includes(q.status);
  const [editing, setEditing] = useState(staff && editableStatus);
  const [lines, setLines] = useState(() => q.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice })));
  const [validUntil, setValidUntil] = useState(q.validUntil ? q.validUntil.slice(0, 10) : inDays(DEFAULT_QUOTE_DAYS));
  const [terms, setTerms] = useState(q.terms ?? '');
  const [comment, setComment] = useState('');
  const [dialog, setDialog] = useState<'accept' | 'decline' | 'revise' | null>(null);
  const [po, setPo] = useState('');
  const [reason, setReason] = useState('');
  useEffect(() => { setEditing(staff && editableStatus); }, [staff, editableStatus]);

  const view = q.lines.map((l) => {
    const e = lines.find((x) => x.productId === l.productId)!;
    const draft = { ...l, quantity: e.quantity, unitPrice: e.unitPrice, lineTotal: Math.round(e.unitPrice * e.quantity * 100) / 100 };
    return editing ? draft : l;
  });
  const subtotal = view.reduce((s, l) => s + l.lineTotal, 0);
  const tax = Math.round(subtotal * 0.18 * 100) / 100;
  const overLimit = user.role === 'SALES_REP' && view.some((l) => discountPct(l) > REP_MAX_DISCOUNT_PCT);
  const done = (msg: string) => { qc.invalidateQueries(); toast.success(msg); setDialog(null); setComment(''); };
  const fail = (e: unknown) => toast.error(errorText(e));
  const payload = () => ({ lines, validUntil: new Date(`${validUntil}T23:59:00`).toISOString(), terms });
  const save = useMutation({ mutationFn: () => quoteService.save(q.id, actor, payload()), onSuccess: () => done(t('quotes.msg.saved')), onError: fail });
  const send = useMutation({ mutationFn: async () => { await quoteService.save(q.id, actor, payload()); return quoteService.send(q.id, actor); }, onSuccess: () => done(t('quotes.msg.sent')), onError: (e) => { qc.invalidateQueries(); fail(e); } });
  const accept = useMutation({ mutationFn: () => quoteService.accept(q.id, actor, po || undefined), onSuccess: (r) => { qc.invalidateQueries(); toast.success(t('quotes.msg.accepted', { number: r.request.number })); router.push(`/requests/${r.request.id}`); }, onError: fail });
  const decline = useMutation({ mutationFn: () => quoteService.decline(q.id, actor, reason), onSuccess: () => done(t('quotes.msg.declined')), onError: fail });
  const revise = useMutation({ mutationFn: () => quoteService.askRevision(q.id, actor, reason), onSuccess: () => done(t('quotes.msg.revisionAsked')), onError: fail });
  const cancel = useMutation({ mutationFn: () => quoteService.cancel(q.id, actor), onSuccess: () => done(t('quotes.msg.cancelled')), onError: fail });
  const addComment = useMutation({ mutationFn: () => quoteService.comment(q.id, actor, comment), onSuccess: () => done(t('transfers.msg.commented')), onError: fail });
  const setLine = (pid: string, k: 'quantity' | 'unitPrice', v: string) => setLines((ls) => ls.map((l) => (l.productId === pid ? { ...l, [k]: Math.max(0, Number(v) || 0) } : l)));
  const showPrices = staff || !['requested'].includes(q.status);
  const showTarget = staff || q.lines.some((l) => l.targetPrice);
  const span = 2 + (staff ? 1 : 0) + (showTarget ? 1 : 0) + 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h1 className="font-mono text-xl font-semibold" data-testid="quote-number">{q.number}</h1><StatusBadge status={q.status} />{q.version > 1 && <span className="rounded-md border px-2 py-0.5 text-xs text-muted-foreground">{t('quotes.version', { n: q.version })}</span>}</div>
          <p className="mt-1 text-sm text-muted-foreground"><RefLink href={`/customers/${q.customerId}`}>{q.customerName}</RefLink> · {t('requests.detail.createdBy', { name: q.createdBy.name })} · {fmtDateTime(q.date)}</p>
          {q.validUntil && q.status === 'sent' && <p className="mt-1 text-sm">{t('quotes.validUntilDate', { date: fmtDate(q.validUntil) })}</p>}
          {q.requestId && <Link href={`/requests/${q.requestId}`} className="mt-1 inline-block text-sm font-medium text-primary hover:underline" data-testid="quote-request-link">{t('quotes.becameRequest', { number: q.requestNumber ?? '' })}</Link>}
        </div>
        <div className="flex flex-wrap gap-2">
          {staff && q.status === 'sent' && !editing && <Button variant="outline" onClick={() => setEditing(true)} data-testid="quote-edit"><Pencil className="me-2 h-4 w-4" aria-hidden="true" />{t('quotes.revise')}</Button>}
          {staff && ['requested', 'draft', 'sent'].includes(q.status) && <Button variant="outline" className="text-destructive" onClick={() => cancel.mutate()} data-testid="quote-cancel">{t('quotes.cancel')}</Button>}
        </div>
      </div>

      {q.customerNote && <Card className="border-primary/20 bg-primary/5 p-4 text-sm"><div className="text-xs font-medium text-muted-foreground">{t('quotes.customerAsked')}</div><p className="mt-1">{q.customerNote}</p></Card>}
      {customer && q.status === 'requested' && <Card className="p-4 text-sm text-muted-foreground" data-testid="quote-waiting">{t('quotes.waiting')}</Card>}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px] [&>*]:min-w-0">
        <div className="space-y-4">
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm" data-testid="quote-lines">
              <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
                <th className="px-4 py-2.5 text-start font-medium">{t('inventory.col.product')}</th>
                <th className="px-3 py-2.5 text-end font-medium">{t('requests.detail.qty')}</th>
                {staff && <th className="px-3 py-2.5 text-end font-medium">{t('quotes.yourPrice')}</th>}
                {showTarget && <th className="px-3 py-2.5 text-end font-medium">{t('quotes.targetPrice')}</th>}
                {showPrices && <th className="px-3 py-2.5 text-end font-medium">{t('quotes.quotedPrice')}</th>}
                {showPrices && <th className="px-4 py-2.5 text-end font-medium">{t('requests.detail.lineTotal')}</th>}
              </tr></thead>
              <tbody className="divide-y">{view.map((l) => {
                const d = discountPct(l);
                return (
                  <tr key={l.productId}>
                    <td className="px-4 py-2.5"><ProductRef id={l.productId} name={l.name} /><div className="font-mono text-[11px] text-muted-foreground">{l.sku}</div></td>
                    <td className="px-3 py-2.5 text-end tabular">{editing ? <Input type="number" min={0} aria-label={`${t('requests.detail.qty')}: ${l.name}`} className="ms-auto h-9 w-20 text-end" value={l.quantity} onChange={(e) => setLine(l.productId, 'quantity', e.target.value)} /> : `${fmtNumber(l.quantity)} ${l.uom}`}</td>
                    {staff && <td className="px-3 py-2.5 text-end tabular text-muted-foreground">{fmtMoney(l.listPrice, true)}</td>}
                    {showTarget && <td className="px-3 py-2.5 text-end tabular text-muted-foreground">{l.targetPrice ? fmtMoney(l.targetPrice, true) : '—'}</td>}
                    {showPrices && <td className="px-3 py-2.5 text-end tabular">
                      {editing ? <Input type="number" min={0} step="0.01" aria-label={`${t('quotes.quotedPrice')}: ${l.name}`} className={cn('ms-auto h-9 w-28 text-end', user.role === 'SALES_REP' && d > REP_MAX_DISCOUNT_PCT && 'border-amber-500')} value={l.unitPrice} data-testid={`quote-price-${l.productId}`} onChange={(e) => setLine(l.productId, 'unitPrice', e.target.value)} /> : fmtMoney(l.unitPrice, true)}
                      {staff && d !== 0 && <div className={cn('mt-0.5 text-[11px]', d > REP_MAX_DISCOUNT_PCT ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400')}>{d > 0 ? `−${d}%` : `+${-d}%`}</div>}
                    </td>}
                    {showPrices && <td className="px-4 py-2.5 text-end font-medium tabular">{fmtMoney(l.lineTotal, true)}</td>}
                  </tr>
                );
              })}</tbody>
              {showPrices && <tfoot className="border-t bg-muted/20 text-sm">
                <tr><td className="px-4 py-2" colSpan={span}>{t('common.subtotal')}</td><td className="px-4 py-2 text-end tabular">{fmtMoney(subtotal, true)}</td></tr>
                <tr><td className="px-4 py-2 text-muted-foreground" colSpan={span}>{t('quotes.tax')}</td><td className="px-4 py-2 text-end tabular text-muted-foreground">{fmtMoney(tax, true)}</td></tr>
                <tr><td className="px-4 py-2.5 font-semibold" colSpan={span}>{t('common.total')}</td><td className="px-4 py-2.5 text-end font-semibold tabular" data-testid="quote-total">{fmtMoney(subtotal + tax, true)}</td></tr>
              </tfoot>}
            </table>
          </Card>

          {editing && (
            <Card className="space-y-3 p-4">
              <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
                <div className="space-y-1.5"><Label htmlFor="vu">{t('quotes.col.validUntil')}</Label><Input id="vu" type="date" value={validUntil} min={inDays(0)} onChange={(e) => setValidUntil(e.target.value)} data-testid="quote-valid" /></div>
                <div className="space-y-1.5"><Label htmlFor="tm">{t('quotes.terms')}</Label><Textarea id="tm" rows={2} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder={t('quotes.termsPlaceholder')} /></div>
              </div>
              {overLimit && <p className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200" role="status" data-testid="quote-over-limit"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{t('quotes.overLimit', { pct: REP_MAX_DISCOUNT_PCT })}</p>}
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => save.mutate()} disabled={save.isPending} data-testid="quote-save"><Save className="me-2 h-4 w-4" aria-hidden="true" />{t('quotes.saveDraft')}</Button>
                <Button onClick={() => send.mutate()} disabled={send.isPending || !validUntil} data-testid="quote-send"><Send className="me-2 h-4 w-4" aria-hidden="true" />{q.timeline.some((e) => e.status === 'sent') ? t('quotes.sendRevised') : t('quotes.send')}</Button>
              </div>
            </Card>
          )}
          {!editing && q.terms && <Card className="p-4 text-sm"><div className="text-xs font-medium text-muted-foreground">{t('quotes.terms')}</div><p className="mt-1 whitespace-pre-line">{q.terms}</p></Card>}

          {customer && q.status === 'sent' && (
            <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="quote-decision">
              <p className="text-sm text-muted-foreground">{t('quotes.decideText')}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => { setReason(''); setDialog('revise'); }} data-testid="quote-ask-revision"><MessageSquareWarning className="me-2 h-4 w-4" aria-hidden="true" />{t('quotes.askRevision')}</Button>
                <Button variant="outline" className="text-destructive" onClick={() => { setReason(''); setDialog('decline'); }} data-testid="quote-decline"><XCircle className="me-2 h-4 w-4" aria-hidden="true" />{t('quotes.decline')}</Button>
                <Button onClick={() => setDialog('accept')} data-testid="quote-accept"><CheckCircle2 className="me-2 h-4 w-4" aria-hidden="true" />{t('quotes.accept')}</Button>
              </div>
            </Card>
          )}

          <SectionCard title={t('requests.detail.comments')}>
            <div className="space-y-3 p-4">
              {q.comments.length ? <ul className="space-y-2 text-sm">{q.comments.map((c, i) => <li key={i}><span className="font-medium">{c.by}</span> <span className="text-xs text-muted-foreground">{fmtDateTime(c.at)}</span><p className="text-muted-foreground">{c.text}</p></li>)}</ul>
                : <p className="text-sm text-muted-foreground">{t('requests.detail.noComments')}</p>}
              <div className="flex gap-2"><Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('requests.detail.addComment')} aria-label={t('requests.detail.addComment')} rows={2} />
                <Button variant="outline" className="self-end" disabled={!comment.trim()} onClick={() => addComment.mutate()}>{t('requests.detail.send')}</Button></div>
            </div>
          </SectionCard>
        </div>
        <SectionCard title={t('requests.detail.timeline')} className="self-start">
          <ol className="space-y-3 p-4">{[...q.timeline].reverse().map((e, i) => (
            <li key={i} className="flex gap-3 text-sm"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" /><div><div className="flex flex-wrap items-center gap-2"><StatusBadge status={e.status} /><span className="text-xs text-muted-foreground">{fmtDateTime(e.at)}</span></div><div className="mt-0.5 text-xs text-muted-foreground">{e.by}{e.note ? ` · ${e.note}` : ''}</div></div></li>
          ))}</ol>
        </SectionCard>
      </div>

      <Dialog open={dialog === 'accept'} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('quotes.acceptTitle', { number: q.number })}</DialogTitle><DialogDescription>{t('quotes.acceptText', { total: fmtMoney(q.total, true) })}</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="qpo">{t('checkout.po')}</Label><Input id="qpo" value={po} onChange={(e) => setPo(e.target.value)} placeholder={t('checkout.poPlaceholder')} /></div>
          <DialogFooter className="gap-2"><Button variant="ghost" onClick={() => setDialog(null)}>{t('common.cancel')}</Button><Button onClick={() => accept.mutate()} disabled={accept.isPending} data-testid="quote-accept-confirm">{t('quotes.acceptConfirm')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === 'decline' || dialog === 'revise'} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialog === 'decline' ? t('quotes.decline') : t('quotes.askRevision')}</DialogTitle><DialogDescription>{dialog === 'decline' ? t('quotes.declineText') : t('quotes.reviseText')}</DialogDescription></DialogHeader>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} aria-label={t('purchaseOrders.reason')} data-testid="quote-reason" />
          <DialogFooter className="gap-2"><Button variant="ghost" onClick={() => setDialog(null)}>{t('common.cancel')}</Button>
            <Button variant={dialog === 'decline' ? 'destructive' : 'default'} disabled={!reason.trim() || decline.isPending || revise.isPending} onClick={() => (dialog === 'decline' ? decline.mutate() : revise.mutate())} data-testid="quote-reason-confirm">{dialog === 'decline' ? t('quotes.decline') : t('quotes.sendRevisionRequest')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
