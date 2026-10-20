'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronLeft, MessageSquareWarning, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { purchaseRequestService, expectedDefault } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useSettings } from '@/lib/settings';
import { useErrorText, useT } from '@/lib/i18n';
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber } from '@/lib/format';
import { QueryView, LoadingState, SectionCard } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { PurchaseRequest } from '@/types/domain';

export default function PurchaseRequestPage() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['purchase-request', id], queryFn: () => purchaseRequestService.get(id) });
  return (
    <div>
      <Link href="/purchase-requests" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="me-1 h-4 w-4 rtl:rotate-180" aria-hidden="true" />{t('purchaseRequests.title')}</Link>
      <QueryView query={q} loading={<LoadingState variant="detail" />}>{(r) => <Detail r={r} />}</QueryView>
    </div>
  );
}

function Detail({ r }: { r: PurchaseRequest }) {
  const { t } = useT();
  const errorText = useErrorText();
  const settings = useSettings();
  const user = useUser();
  const qc = useQueryClient();
  const actor = { id: user.id, name: user.name, role: user.role };
  const supplier = user.role === 'SUPPLIER';
  const open = ['submitted', 'changes_requested'].includes(r.status);
  const [comment, setComment] = useState('');
  const [convertOpen, setConvertOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [expected, setExpected] = useState(r.proposedDate ? r.proposedDate.slice(0, 10) : expectedDefault());
  const ok = (msg: string) => { qc.invalidateQueries(); toast.success(msg); setComment(''); };
  const fail = (e: unknown) => toast.error(errorText(e));
  const convert = useMutation({ mutationFn: () => purchaseRequestService.convert(r.id, actor, new Date(expected).toISOString()), onSuccess: (x) => { setConvertOpen(false); ok(t('purchaseRequests.converted', { number: x.orderNumber ?? '' })); }, onError: fail });
  const review = useMutation({ mutationFn: (d: 'changes' | 'reject') => purchaseRequestService.review(r.id, d, actor, comment), onSuccess: (_, d) => ok(d === 'reject' ? t('requests.review.rejected') : t('requests.review.sentBack')), onError: fail });
  const cancel = useMutation({ mutationFn: () => purchaseRequestService.cancel(r.id, actor), onSuccess: () => ok(t('purchaseRequests.cancelled')), onError: fail });
  const addComment = useMutation({ mutationFn: () => purchaseRequestService.comment(r.id, actor, comment), onSuccess: () => { setComment(''); qc.invalidateQueries(); } });
  const needComment = (d: 'changes' | 'reject') => (!comment.trim() ? toast.error(t('errors.requests.commentRequired')) : d === 'reject' ? setRejectOpen(true) : review.mutate('changes'));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h1 className="font-mono text-xl font-semibold" data-testid="pr-number">{r.number}</h1><StatusBadge status={r.status} />
            <span className="rounded-md border px-2 py-0.5 text-xs text-muted-foreground">{t(`purchaseRequests.source.${r.source}`)}</span>{r.site && <span className="rounded-md border px-2 py-0.5 text-xs text-muted-foreground">{t('sites.label')} {r.site}</span>}</div>
          <p className="mt-1 text-sm text-muted-foreground">{r.supplierName} · {t('requests.detail.createdBy', { name: r.createdBy.name })} · {fmtDateTime(r.date)}</p>
          {r.proposedDate && <p className="mt-1 text-sm">{t('purchaseRequests.proposedDate')}: <span className="font-medium">{fmtDate(r.proposedDate)}</span></p>}
          {r.orderId && <Link href={`/purchase-orders/${r.orderId}`} className="mt-1 inline-block text-sm font-medium text-primary hover:underline" data-testid="pr-po-link">{r.orderNumber}</Link>}
        </div>
        {supplier && open && <Button variant="outline" className="text-destructive" onClick={() => cancel.mutate()} data-testid="pr-cancel"><XCircle className="me-2 h-4 w-4" aria-hidden="true" />{t('purchaseRequests.cancel')}</Button>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-4 py-2 text-start font-medium">{t('requests.detail.lines')}</th><th className="px-3 py-2 text-end font-medium">{t('requests.detail.qty')}</th><th className="px-3 py-2 text-end font-medium">{t('purchaseRequests.cost')}</th><th className="px-4 py-2 text-end font-medium">{t('requests.detail.lineTotal')}</th></tr></thead>
              <tbody className="divide-y">{r.lines.map((l) => (
                <tr key={l.productId}><td className="px-4 py-2.5"><div className="font-medium">{l.name}</div><div className="font-mono text-[11px] text-muted-foreground">{l.sku}</div></td><td className="px-3 py-2.5 text-end tabular">{fmtNumber(l.quantity)} {l.uom}</td><td className="px-3 py-2.5 text-end tabular">{fmtMoney(l.unitCost, true)}</td><td className="px-4 py-2.5 text-end font-medium tabular">{fmtMoney(l.lineTotal, true)}</td></tr>
              ))}</tbody>
              <tfoot className="border-t bg-muted/20"><tr><td className="px-4 py-2.5 font-semibold" colSpan={3}>{t('common.total')}</td><td className="px-4 py-2.5 text-end font-semibold tabular">{fmtMoney(r.total, true)}</td></tr></tfoot>
            </table>
          </Card>
          {r.notes && <p className="rounded-md bg-muted/60 p-3 text-sm">{r.notes}</p>}
          <SectionCard title={t('requests.detail.comments')}>
            <div className="space-y-3 p-4">
              {r.comments.length ? <ul className="space-y-2 text-sm">{r.comments.map((c, i) => <li key={i}><span className="font-medium">{c.by}</span> <span className="text-xs text-muted-foreground">{fmtDateTime(c.at)}</span><p className="text-muted-foreground">{c.text}</p></li>)}</ul>
                : <p className="text-sm text-muted-foreground">{t('requests.detail.noComments')}</p>}
              <div className="flex gap-2"><Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('requests.detail.addComment')} aria-label={t('requests.detail.addComment')} rows={2} data-testid="pr-comment" />
                {supplier && <Button variant="outline" className="self-end" disabled={!comment.trim()} onClick={() => addComment.mutate()}>{t('requests.detail.send')}</Button>}</div>
            </div>
          </SectionCard>
        </div>
        <div className="space-y-4">
          {!supplier && open && (
            <SectionCard title={t('requests.review.title')}>
              <div className="grid grid-cols-2 gap-2 p-4">
                <Button className="col-span-2 h-11" onClick={() => setConvertOpen(true)} data-testid="pr-convert"><CheckCircle2 className="me-2 h-4 w-4" aria-hidden="true" />{t('purchaseRequests.convert')}</Button>
                <Button variant="outline" onClick={() => needComment('changes')} data-testid="pr-changes"><MessageSquareWarning className="me-2 h-4 w-4" aria-hidden="true" />{t('requests.review.changes')}</Button>
                <Button variant="outline" className="text-destructive" onClick={() => needComment('reject')} data-testid="pr-reject"><XCircle className="me-2 h-4 w-4" aria-hidden="true" />{t('requests.review.reject')}</Button>
                <p className="col-span-2 text-xs text-muted-foreground">{t('requests.review.commentHint')}</p>
              </div>
            </SectionCard>
          )}
          <SectionCard title={t('requests.detail.timeline')}>
            <ol className="space-y-3 p-4">{[...r.timeline].reverse().map((e, i) => (
              <li key={i} className="flex gap-3 text-sm"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" /><div><div className="flex flex-wrap items-center gap-2"><StatusBadge status={e.status} /><span className="text-xs text-muted-foreground">{fmtDateTime(e.at)}</span></div><div className="mt-0.5 text-xs text-muted-foreground">{e.by}{e.note ? ` · ${e.note}` : ''}</div></div></li>
            ))}</ol>
          </SectionCard>
        </div>
      </div>

      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('purchaseRequests.convert')}</DialogTitle><DialogDescription>{t('purchaseRequests.convertText', { erp: settings.erpName, supplier: r.supplierName })}</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="ed">{t('purchaseRequests.expectedDate')}</Label><Input id="ed" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} /></div>
          <DialogFooter className="gap-2"><Button variant="ghost" onClick={() => setConvertOpen(false)}>{t('requests.convert.back')}</Button><Button onClick={() => convert.mutate()} disabled={!expected || convert.isPending} data-testid="pr-convert-confirm">{t('requests.convert.confirm')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={rejectOpen} onOpenChange={setRejectOpen} title={t('requests.review.rejectTitle', { number: r.number })} description={t('requests.review.rejectText')} confirmLabel={t('requests.review.reject')} destructive onConfirm={() => { setRejectOpen(false); review.mutate('reject'); }} />
    </div>
  );
}
