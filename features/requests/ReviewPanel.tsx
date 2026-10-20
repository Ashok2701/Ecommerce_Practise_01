'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, MessageSquareWarning, PackageX, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { requestService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useErrorText, useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings';
import { fmtMoney, fmtNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { REVIEWABLE_REQUEST, type SalesRequest } from '@/types/domain';

/** Credit, price and stock checks plus the reviewer's actions for one request. */
export function ReviewPanel({ request: r, onDone }: { request: SalesRequest; onDone?: (r: SalesRequest) => void }) {
  const { t } = useT();
  const errorText = useErrorText();
  const settings = useSettings();
  const user = useUser();
  const qc = useQueryClient();
  const actor = { id: user.id, name: user.name, role: user.role };
  const [comment, setComment] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const reviewable = REVIEWABLE_REQUEST.includes(r.status);
  const p = useQuery({ queryKey: ['request-preview', r.id, r.status, r.orderIds.length], queryFn: () => requestService.preview(r.id), enabled: reviewable });

  const done = (next: SalesRequest, msg: string) => { qc.invalidateQueries(); toast.success(msg); setComment(''); onDone?.(next); };
  const review = useMutation({
    mutationFn: (d: 'changes' | 'reject') => requestService.review(r.id, d, actor, comment),
    onSuccess: (next, d) => done(next, d === 'reject' ? t('requests.review.rejected') : t('requests.review.sentBack')),
    onError: (e) => toast.error(errorText(e)),
  });
  const needComment = (d: 'changes' | 'reject') => {
    if (!comment.trim()) { toast.error(t('errors.requests.commentRequired')); return; }
    if (d === 'reject') setRejectOpen(true); else review.mutate('changes');
  };

  const pv = p.data;
  const needsDialog = !!pv && (pv.priceChanged || pv.shortLines > 0 || pv.creditIssue);

  return (
    <div className="space-y-4" data-testid="review-panel">
      {r.credit && (
        <Card className="p-4" data-testid="credit-panel">
          {r.credit.over || r.credit.onHold ? (
            r.creditOverride
              ? <p className="flex gap-2 text-sm"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{t('requests.review.overridden', { name: r.creditOverride.by, reason: r.creditOverride.reason })}</p>
              : <div className="flex gap-2 text-sm text-destructive" role="alert" data-testid="credit-hold-alert"><ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" /><div><div className="font-semibold">{r.credit.onHold ? t('requests.review.hold') : t('requests.review.over', { amount: fmtMoney(r.credit.exceededBy) })}</div><div className="text-xs">{t('requests.review.available')}: {fmtMoney(r.credit.available)}</div></div></div>
          ) : <p className="flex items-center gap-2 text-sm text-primary"><ShieldCheck className="h-4 w-4" aria-hidden="true" />{t('requests.review.within')}</p>}
        </Card>
      )}

      {reviewable && pv && (pv.priceChanged || pv.shortLines > 0) && (
        <Card className="space-y-2 p-4 text-sm">
          {pv.priceChanged && <p className="flex gap-2" data-testid="price-changed"><AlertTriangle className="h-4 w-4 shrink-0 text-signal" aria-hidden="true" />{t('requests.review.priceChanged', { then: fmtMoney(pv.totalThen, true), now: fmtMoney(pv.totalNow, true) })}</p>}
          {pv.shortLines > 0 && <p className="flex gap-2" data-testid="stock-short"><PackageX className="h-4 w-4 shrink-0 text-signal" aria-hidden="true" />{t('requests.review.short', { count: pv.shortLines, site: r.site ?? '' })}</p>}
        </Card>
      )}

      {reviewable ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`rc-${r.id}`}>{t('requests.review.comment')}</Label>
            <Textarea id={`rc-${r.id}`} data-testid="review-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
            <p className="text-xs text-muted-foreground">{t('requests.review.commentHint')}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button className="col-span-2 h-11" disabled={!pv || review.isPending} onClick={() => setConvertOpen(true)} data-testid="approve-btn">
              <CheckCircle2 className="me-2 h-4 w-4" aria-hidden="true" />{t('requests.review.approve')}
            </Button>
            <Button variant="outline" className="h-11" disabled={review.isPending} onClick={() => needComment('changes')} data-testid="changes-btn"><MessageSquareWarning className="me-2 h-4 w-4" aria-hidden="true" />{t('requests.review.changes')}</Button>
            <Button variant="outline" className="h-11 text-destructive" disabled={review.isPending} onClick={() => needComment('reject')} data-testid="reject-btn"><XCircle className="me-2 h-4 w-4" aria-hidden="true" />{t('requests.review.reject')}</Button>
          </div>
        </div>
      ) : <p className="text-sm text-muted-foreground">{t('requests.review.done')}</p>}

      {pv && <ConvertDialog open={convertOpen} onOpenChange={setConvertOpen} request={r} preview={pv} needsChecks={needsDialog} erp={settings.erpName}
        onConverted={(next) => { setConvertOpen(false); done(next, t('requests.convert.done', { number: next.orderNumbers.at(-1) ?? '' })); }} />}
      <ConfirmDialog open={rejectOpen} onOpenChange={setRejectOpen} title={t('requests.review.rejectTitle', { number: r.number })} description={t('requests.review.rejectText')}
        confirmLabel={t('requests.review.reject')} destructive onConfirm={() => { setRejectOpen(false); review.mutate('reject'); }} />
    </div>
  );
}

function ConvertDialog({ open, onOpenChange, request: r, preview: pv, needsChecks, erp, onConverted }: {
  open: boolean; onOpenChange: (v: boolean) => void; request: SalesRequest; preview: NonNullable<Awaited<ReturnType<typeof requestService.preview>>>;
  needsChecks: boolean; erp: string; onConverted: (r: SalesRequest) => void;
}) {
  const { t } = useT();
  const errorText = useErrorText();
  const user = useUser();
  const [accept, setAccept] = useState(false);
  const [mode, setMode] = useState<'all' | 'available'>('available');
  const [reason, setReason] = useState('');
  // one key per dialog opening: double clicks and retries reuse it, so only one order is ever created
  const key = useMemo(() => `${r.id}:${r.orderIds.length}:${Date.now()}`, [r.id, r.orderIds.length, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = useMutation({
    mutationFn: () => requestService.convert(r.id, { id: user.id, name: user.name, role: user.role }, {
      idempotencyKey: key, acceptPriceChange: accept, onlyAvailable: pv.shortLines > 0 && mode === 'available', overrideCredit: pv.creditIssue, overrideReason: reason,
    }),
    onSuccess: onConverted,
    onError: (e) => toast.error(errorText(e)),
  });
  const ready = (!pv.priceChanged || accept) && (!pv.creditIssue || reason.trim().length > 2);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="convert-dialog">
        <DialogHeader>
          <DialogTitle>{t('requests.convert.title')}</DialogTitle>
          <DialogDescription>{t('requests.convert.text', { erp })}</DialogDescription>
        </DialogHeader>
        <div className="max-h-56 overflow-y-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-start font-medium">{t('requests.detail.lines')}</th><th className="px-3 py-2 text-end font-medium">{t('requests.convert.open')}</th><th className="px-3 py-2 text-end font-medium">{t('requests.convert.stock')}</th></tr></thead>
            <tbody className="divide-y">{pv.lines.map((l) => (
              <tr key={l.productId}><td className="px-3 py-2">{l.name}</td><td className="px-3 py-2 text-end tabular">{fmtNumber(l.open)}</td><td className={`px-3 py-2 text-end tabular ${l.stock < l.open ? 'font-semibold text-destructive' : ''}`}>{fmtNumber(l.stock)}</td></tr>
            ))}</tbody>
          </table>
        </div>
        {needsChecks && (
          <div className="space-y-4">
            {pv.priceChanged && (
              <label className="flex items-start gap-2.5 text-sm">
                <Checkbox checked={accept} onCheckedChange={(v) => setAccept(!!v)} data-testid="accept-prices" className="mt-0.5" />
                <span>{t('requests.convert.acceptPrices')}<span className="block text-xs text-muted-foreground">{t('requests.review.priceChanged', { then: fmtMoney(pv.totalThen, true), now: fmtMoney(pv.totalNow, true) })}</span></span>
              </label>
            )}
            {pv.shortLines > 0 && (
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as 'all' | 'available')} className="space-y-1.5">
                <label className="flex items-center gap-2.5 text-sm"><RadioGroupItem value="available" data-testid="convert-available" />{t('requests.convert.available')}</label>
                <label className="flex items-center gap-2.5 text-sm"><RadioGroupItem value="all" data-testid="convert-all" />{t('requests.convert.all')}</label>
              </RadioGroup>
            )}
            {pv.creditIssue && (
              <div className="space-y-1.5">
                <Label htmlFor="ovr" className="flex items-center gap-1.5 text-destructive"><ShieldAlert className="h-4 w-4" aria-hidden="true" />{t('requests.convert.override')}</Label>
                <Input id="ovr" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('requests.convert.reason')} data-testid="override-reason" />
              </div>
            )}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('requests.convert.back')}</Button>
          <Button onClick={() => m.mutate()} disabled={!ready || m.isPending} data-testid="convert-confirm">{t('requests.convert.confirm')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
