'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Clock, CreditCard, MapPin, PencilLine, Sparkles, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { requestService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useAccess } from '@/lib/auth/permissions';
import { useCart } from '@/lib/cart/CartProvider';
import { useErrorText, useT } from '@/lib/i18n';
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber } from '@/lib/format';
import { QueryView, LoadingState, SectionCard } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ReviewPanel } from '@/features/requests/ReviewPanel';
import { isCustomerRole, type SalesRequest } from '@/types/domain';

export default function RequestDetailPage() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['request', id], queryFn: () => requestService.get(id) });
  return (
    <div>
      <Link href="/requests" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="me-1 h-4 w-4 rtl:rotate-180" aria-hidden="true" />{t('requests.title')}</Link>
      <QueryView query={q} loading={<LoadingState variant="detail" />}>{(r) => <Detail r={r} />}</QueryView>
    </div>
  );
}

function Detail({ r }: { r: SalesRequest }) {
  const { t } = useT();
  const errorText = useErrorText();
  const user = useUser();
  const access = useAccess(user.role);
  const cart = useCart();
  const router = useRouter();
  const qc = useQueryClient();
  const actor = { id: user.id, name: user.name, role: user.role };
  const [cancelOpen, setCancelOpen] = useState(false);
  const [comment, setComment] = useState('');
  const isRequester = (isCustomerRole(user.role) && user.customerId === r.customerId) || (user.role === 'SALES_REP' && r.salesRepId === user.id);
  const canWithdraw = isRequester && ['draft', 'submitted', 'changes_requested', 'approved'].includes(r.status);

  const refresh = () => qc.invalidateQueries();
  const cancel = useMutation({ mutationFn: (note?: string) => requestService.cancel(r.id, actor, note), onSuccess: () => { refresh(); toast.success(t('requests.detail.cancelled')); }, onError: (e) => toast.error(errorText(e)) });
  const addComment = useMutation({ mutationFn: () => requestService.comment(r.id, actor, comment), onSuccess: () => { setComment(''); refresh(); } });
  const editInCart = async () => {
    cart.replace(r.lines.map((l) => ({ productId: l.productId, quantity: l.quantity - l.convertedQty })).filter((l) => l.quantity > 0), r.customerId);
    await cancel.mutateAsync(t('requests.detail.replaced'));
    toast.success(t('requests.detail.editDone'));
    router.push('/cart');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-xl font-semibold" data-testid="request-number">{r.number}</h1><StatusBadge status={r.status} />
            {r.site && <span className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs text-muted-foreground"><MapPin className="h-3 w-3" aria-hidden="true" />{t('sites.label')} {r.site}</span>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{r.customerName} · {t('requests.detail.createdBy', { name: r.createdBy.name })} · {fmtDateTime(r.date)} · {t(`requests.detail.source.${r.source}`)}</p>
        </div>
        {canWithdraw && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={editInCart} disabled={cancel.isPending} data-testid="request-edit"><PencilLine className="me-2 h-4 w-4" aria-hidden="true" />{t('requests.detail.edit')}</Button>
            <Button variant="outline" className="text-destructive" onClick={() => setCancelOpen(true)} data-testid="request-cancel"><XCircle className="me-2 h-4 w-4" aria-hidden="true" />{t('requests.detail.cancel')}</Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {r.quoteId && <Link href={`/quotes/${r.quoteId}`} className="rounded-md bg-primary/10 px-2 py-1 font-medium text-primary hover:underline" data-testid="request-quote">{t('quotes.col.number')} {r.quoteNumber}</Link>}
        {r.consignmentId && <Link href={`/consignment/${r.consignmentId}`} className="rounded-md bg-primary/10 px-2 py-1 font-medium text-primary hover:underline" data-testid="request-consignment">{t('consignment.callOffChip')}</Link>}
        {r.poNumber && <span className="rounded-md bg-muted px-2 py-1">{t('requests.detail.po')}: {r.poNumber}</span>}
        {r.paid && <span className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-accent-foreground"><CreditCard className="h-3 w-3" aria-hidden="true" />{t('requests.detail.paid')}</span>}
        {r.autoApproved && <span className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-accent-foreground"><Sparkles className="h-3 w-3" aria-hidden="true" />{t('requests.detail.autoApproved')}</span>}
        {r.holdUntil && <span className="inline-flex items-center gap-1 rounded-md bg-signal/15 px-2 py-1" data-testid="stock-hold"><Clock className="h-3 w-3" aria-hidden="true" />{t('requests.detail.held', { time: fmtDateTime(r.holdUntil) })}</span>}
        {r.expiresAt && ['submitted', 'changes_requested', 'approved'].includes(r.status) && <span className="rounded-md bg-muted px-2 py-1">{t('requests.detail.expires')}: {fmtDate(r.expiresAt)}</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <h2 className="border-b px-4 py-3 text-sm font-semibold">{t('requests.detail.lines')}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
                  <th className="px-4 py-2 text-start font-medium">{t('requests.detail.lines')}</th><th className="px-3 py-2 text-end font-medium">{t('requests.detail.qty')}</th>
                  <th className="px-3 py-2 text-end font-medium">{t('requests.detail.ordered')}</th><th className="px-3 py-2 text-end font-medium">{t('requests.detail.price')}</th><th className="px-4 py-2 text-end font-medium">{t('requests.detail.lineTotal')}</th>
                </tr></thead>
                <tbody className="divide-y">{r.lines.map((l) => (
                  <tr key={l.productId}>
                    <td className="px-4 py-2.5"><div className="font-medium">{l.name}</div><div className="font-mono text-[11px] text-muted-foreground">{l.sku}</div></td>
                    <td className="px-3 py-2.5 text-end tabular">{fmtNumber(l.quantity)} {l.uom}</td>
                    <td className="px-3 py-2.5 text-end tabular">{fmtNumber(l.convertedQty)}</td>
                    <td className="px-3 py-2.5 text-end tabular">{fmtMoney(l.unitPrice, true)}</td>
                    <td className="px-4 py-2.5 text-end font-medium tabular">{fmtMoney(l.lineTotal, true)}</td>
                  </tr>
                ))}</tbody>
                <tfoot className="border-t bg-muted/20"><tr><td className="px-4 py-2.5 font-semibold" colSpan={4}>{t('common.total')}</td><td className="px-4 py-2.5 text-end font-semibold tabular" data-testid="request-total">{fmtMoney(r.total, true)}</td></tr></tfoot>
              </table>
            </div>
            <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">{t('checkout.indicative')}</p>
          </Card>

          {r.orderNumbers.length > 0 && (
            <SectionCard title={t('requests.detail.orders')}>
              <ul className="divide-y">{r.orderIds.map((oid, i) => (
                <li key={oid}><Link href={`/orders/${oid}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/40" data-testid="request-order-link"><span className="font-mono font-semibold">{r.orderNumbers[i]}</span><ChevronLeft className="h-4 w-4 rotate-180 text-muted-foreground rtl:rotate-0" aria-hidden="true" /></Link></li>
              ))}</ul>
            </SectionCard>
          )}

          <SectionCard title={t('requests.detail.comments')}>
            <div className="space-y-3 p-4">
              {r.comments.length ? (
                <ul className="space-y-2.5 text-sm">{r.comments.map((c, i) => (
                  <li key={i}><span className="font-medium">{c.by}</span> <span className="text-xs text-muted-foreground">{fmtDateTime(c.at)}</span><p className="text-muted-foreground">{c.text.startsWith('errors.') ? t(c.text) : c.text}</p></li>
                ))}</ul>
              ) : <p className="text-sm text-muted-foreground">{t('requests.detail.noComments')}</p>}
              <div className="flex gap-2">
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('requests.detail.addComment')} aria-label={t('requests.detail.addComment')} rows={2} />
                <Button variant="outline" className="self-end" disabled={!comment.trim() || addComment.isPending} onClick={() => addComment.mutate()}>{t('requests.detail.send')}</Button>
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-4">
          {access.can('approvals') && <SectionCard title={t('requests.review.title')}><div className="p-4"><ReviewPanel request={r} /></div></SectionCard>}
          <SectionCard title={t('requests.detail.timeline')}>
            <ol className="space-y-3 p-4" data-testid="request-timeline">{[...r.timeline].reverse().map((e, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                <div><div className="flex flex-wrap items-center gap-2"><StatusBadge status={e.status} /><span className="text-xs text-muted-foreground">{fmtDateTime(e.at)}</span></div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{e.by}{e.note ? ` · ${e.note}` : ''}</div></div>
              </li>
            ))}</ol>
          </SectionCard>
        </div>
      </div>

      <ConfirmDialog open={cancelOpen} onOpenChange={setCancelOpen} title={t('requests.detail.cancelTitle', { number: r.number })} description={t('requests.detail.cancelText')}
        confirmLabel={t('requests.detail.cancel')} cancelLabel={t('requests.detail.keep')} destructive onConfirm={() => { setCancelOpen(false); cancel.mutate(undefined); }} />
    </div>
  );
}
