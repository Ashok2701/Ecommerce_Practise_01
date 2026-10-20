'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, ChevronLeft, PackageCheck, Truck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { transferService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useErrorText, useT } from '@/lib/i18n';
import { fmtDate, fmtDateTime, fmtNumber } from '@/lib/format';
import { QueryView, LoadingState, SectionCard } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { isManagerRole, TRANSFER_FLOW, type StockTransfer, type TransferStatus } from '@/types/domain';

export default function TransferPage() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['transfer', id], queryFn: () => transferService.get(id) });
  return (
    <div>
      <Link href="/transfers" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="me-1 h-4 w-4 rtl:rotate-180" aria-hidden="true" />{t('transfers.title')}</Link>
      <QueryView query={q} loading={<LoadingState variant="detail" />}>{(x) => <Detail x={x} />}</QueryView>
    </div>
  );
}

/** Pending → Approved → Transfer initiated → Transferred → Completed. */
function Stepper({ status }: { status: TransferStatus }) {
  const { t } = useT();
  const idx = TRANSFER_FLOW.indexOf(status);
  const stopped = status === 'rejected' || status === 'cancelled';
  return (
    <ol className="grid grid-cols-5 gap-1" data-testid="tr-stepper">
      {TRANSFER_FLOW.map((s, i) => (
        <li key={s} className="flex flex-col items-center gap-1.5 text-center">
          <span className={cn('h-1.5 w-full rounded-full', !stopped && i <= idx ? 'bg-primary' : 'bg-muted')} />
          <span className={cn('text-[11px] leading-tight', i === idx ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{t(`status.${s}`)}</span>
        </li>
      ))}
    </ol>
  );
}

function Detail({ x }: { x: StockTransfer }) {
  const { t } = useT();
  const errorText = useErrorText();
  const user = useUser();
  const qc = useQueryClient();
  const actor = { id: user.id, name: user.name, role: user.role };
  const manager = isManagerRole(user.role);
  const [comment, setComment] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [recvOpen, setRecvOpen] = useState(false);
  const [recv, setRecv] = useState<Record<string, number>>(() => Object.fromEntries(x.lines.map((l) => [l.productId, l.quantity])));
  const done = (msg: string) => { qc.invalidateQueries(); toast.success(msg); setComment(''); setRecvOpen(false); };
  const fail = (e: unknown) => toast.error(errorText(e));
  const useAct = (fn: () => Promise<unknown>, msg: string) => useMutation({ mutationFn: fn, onSuccess: () => done(msg), onError: fail });
  const approve = useAct(() => transferService.approve(x.id, actor), t('transfers.msg.approved'));
  const reject = useAct(() => transferService.reject(x.id, actor, comment), t('transfers.msg.rejected'));
  const initiate = useAct(() => transferService.initiate(x.id, actor), t('transfers.msg.initiated'));
  const receive = useAct(() => transferService.receive(x.id, actor, Object.entries(recv).map(([productId, quantity]) => ({ productId, quantity }))), t('transfers.msg.received'));
  const complete = useAct(() => transferService.complete(x.id, actor), t('transfers.msg.completed'));
  const cancel = useAct(() => transferService.cancel(x.id, actor), t('transfers.msg.cancelled'));
  const addComment = useAct(() => transferService.comment(x.id, actor, comment), t('transfers.msg.commented'));
  const canCancel = ['pending', 'approved'].includes(x.status) && (manager || x.createdBy.id === user.id);

  const actions = manager && (
    <>
      {x.status === 'pending' && <>
        <Button className="w-full" onClick={() => approve.mutate()} disabled={approve.isPending} data-testid="tr-approve"><CheckCircle2 className="me-2 h-4 w-4" aria-hidden="true" />{t('transfers.approve')}</Button>
        <Button variant="outline" className="w-full text-destructive" onClick={() => (comment.trim() ? setRejectOpen(true) : toast.error(t('errors.requests.commentRequired')))} data-testid="tr-reject"><XCircle className="me-2 h-4 w-4" aria-hidden="true" />{t('transfers.reject')}</Button>
        <p className="text-xs text-muted-foreground">{t('requests.review.commentHint')}</p>
      </>}
      {x.status === 'approved' && <Button className="w-full" onClick={() => initiate.mutate()} disabled={initiate.isPending} data-testid="tr-initiate"><Truck className="me-2 h-4 w-4" aria-hidden="true" />{t('transfers.initiate', { site: x.fromSite })}</Button>}
      {x.status === 'initiated' && <Button className="w-full" onClick={() => setRecvOpen(true)} data-testid="tr-receive"><PackageCheck className="me-2 h-4 w-4" aria-hidden="true" />{t('transfers.receive', { site: x.toSite })}</Button>}
      {x.status === 'transferred' && <Button className="w-full" onClick={() => complete.mutate()} disabled={complete.isPending} data-testid="tr-complete"><CheckCircle2 className="me-2 h-4 w-4" aria-hidden="true" />{t('transfers.complete')}</Button>}
    </>
  );
  const hint: Partial<Record<TransferStatus, string>> = { pending: 'pending', approved: 'approved', initiated: 'initiated', transferred: 'transferred' };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h1 className="font-mono text-xl font-semibold" data-testid="tr-number">{x.number}</h1><StatusBadge status={x.status} />{x.erpRef && <span className="font-mono text-xs text-muted-foreground">{x.erpRef}</span>}</div>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm"><span className="font-mono font-semibold">{x.fromSite}</span><ArrowRight className="h-3.5 w-3.5 text-muted-foreground rtl:rotate-180" aria-hidden="true" /><span className="font-mono font-semibold">{x.toSite}</span>
            <span className="text-muted-foreground">· {t('requests.detail.createdBy', { name: x.createdBy.name })} · {fmtDateTime(x.date)}{x.neededBy ? ` · ${t('transfers.neededByDate', { date: fmtDate(x.neededBy) })}` : ''}</span></p>
          <p className="mt-1 text-sm text-muted-foreground">{x.reason}</p>
        </div>
        {canCancel && <Button variant="outline" className="text-destructive" onClick={() => cancel.mutate()} data-testid="tr-cancel">{t('transfers.cancel')}</Button>}
      </div>
      <Card className="p-4"><Stepper status={x.status} />{hint[x.status] && <p className="mt-3 text-center text-xs text-muted-foreground">{t(`transfers.hint.${hint[x.status]}`, { from: x.fromSite, to: x.toSite })}</p>}</Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-4 py-2 text-start font-medium">{t('requests.detail.lines')}</th><th className="px-3 py-2 text-end font-medium">{t('transfers.requested')}</th><th className="px-4 py-2 text-end font-medium">{t('transfers.received')}</th></tr></thead>
              <tbody className="divide-y">{x.lines.map((l) => (
                <tr key={l.productId}><td className="px-4 py-2.5"><div className="font-medium">{l.name}</div><div className="font-mono text-[11px] text-muted-foreground">{l.sku}</div></td>
                  <td className="px-3 py-2.5 text-end tabular">{fmtNumber(l.quantity)} {l.uom}</td>
                  <td className={cn('px-4 py-2.5 text-end tabular', ['transferred', 'completed'].includes(x.status) && l.receivedQty < l.quantity && 'font-semibold text-destructive')} data-testid={`tr-recv-${l.productId}`}>{['transferred', 'completed'].includes(x.status) ? fmtNumber(l.receivedQty) : '—'}</td></tr>
              ))}</tbody>
            </table>
          </Card>
          <SectionCard title={t('requests.detail.comments')}>
            <div className="space-y-3 p-4">
              {x.comments.length ? <ul className="space-y-2 text-sm">{x.comments.map((c, i) => <li key={i}><span className="font-medium">{c.by}</span> <span className="text-xs text-muted-foreground">{fmtDateTime(c.at)}</span><p className="text-muted-foreground">{c.text}</p></li>)}</ul>
                : <p className="text-sm text-muted-foreground">{t('requests.detail.noComments')}</p>}
              <div className="flex gap-2"><Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('requests.detail.addComment')} aria-label={t('requests.detail.addComment')} rows={2} data-testid="tr-comment" />
                <Button variant="outline" className="self-end" disabled={!comment.trim()} onClick={() => addComment.mutate()}>{t('requests.detail.send')}</Button></div>
            </div>
          </SectionCard>
        </div>
        <div className="space-y-4">
          {actions && ['pending', 'approved', 'initiated', 'transferred'].includes(x.status) && <Card className="space-y-2 p-4">{actions}</Card>}
          <SectionCard title={t('requests.detail.timeline')}>
            <ol className="space-y-3 p-4">{[...x.timeline].reverse().map((e, i) => (
              <li key={i} className="flex gap-3 text-sm"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" /><div><div className="flex flex-wrap items-center gap-2"><StatusBadge status={e.status} /><span className="text-xs text-muted-foreground">{fmtDateTime(e.at)}</span></div><div className="mt-0.5 text-xs text-muted-foreground">{e.by}{e.note ? ` · ${e.note}` : ''}</div></div></li>
            ))}</ol>
          </SectionCard>
        </div>
      </div>

      <Dialog open={recvOpen} onOpenChange={setRecvOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('transfers.receive', { site: x.toSite })}</DialogTitle><DialogDescription>{t('transfers.receiveText')}</DialogDescription></DialogHeader>
          <ul className="divide-y rounded-md border">{x.lines.map((l) => (
            <li key={l.productId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0"><div className="truncate font-medium">{l.name}</div><div className="text-xs text-muted-foreground">{t('transfers.sent', { qty: fmtNumber(l.quantity), uom: l.uom })}</div></div>
              <Input type="number" min={0} max={l.quantity} className="h-9 w-24 text-end" aria-label={l.name} data-testid={`tr-in-${l.productId}`} value={recv[l.productId] ?? 0}
                onChange={(e) => setRecv((s) => ({ ...s, [l.productId]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))} />
            </li>
          ))}</ul>
          <DialogFooter className="gap-2"><Button variant="ghost" onClick={() => setRecvOpen(false)}>{t('common.cancel')}</Button><Button onClick={() => receive.mutate()} disabled={receive.isPending} data-testid="tr-receive-confirm">{t('transfers.receiveConfirm')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={rejectOpen} onOpenChange={setRejectOpen} title={t('transfers.rejectTitle', { number: x.number })} description={t('transfers.rejectText')} confirmLabel={t('transfers.reject')} destructive onConfirm={() => { setRejectOpen(false); reject.mutate(); }} />
    </div>
  );
}
