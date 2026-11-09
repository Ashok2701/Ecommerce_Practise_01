'use client';
import { useState } from 'react';
import { FreeTag, LineOfferChip } from '@/features/offers/OfferBits';
import { OrderDelivery } from '@/features/deliveries/OrderDelivery';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, RotateCcw, XCircle, FileText, Truck, MapPin, Check, Circle, MessageSquare, Cpu, Download, ClipboardCheck, FastForward } from 'lucide-react';
import { toast } from 'sonner';
import { orderService, invoiceService, ORDER_FLOW } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings';
import { ProductRef, RefLink } from '@/features/detail/DetailBits';
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import { QueryView, LoadingState, SectionCard } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ProductImage } from '@/components/common/ProductBits';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { OrderSummary } from '@/features/orders/OrderSummary';
import { useReorder } from '@/features/orders/useReorder';
import { cn } from '@/lib/utils';
import { isCustomerRole } from '@/types/domain';
import type { Order } from '@/types/domain';

function Timeline({ o }: { o: Order }) {
  const { t } = useT();
  const terminal = ['cancelled', 'rejected', 'changes_requested', 'pending_sync'].includes(o.status);
  const steps = terminal ? o.timeline.map((e) => e.status) : ORDER_FLOW;
  return (
    <ol className="relative space-y-0" data-testid="order-timeline">
      {steps.map((s, i) => {
        const ev = [...o.timeline].reverse().find((e) => e.status === s);
        const done = !!ev;
        const current = s === o.status;
        return (
          <li key={s + i} className="relative flex gap-3 pb-5 last:pb-0">
            {i < steps.length - 1 && <span className={cn('absolute start-[11px] top-6 h-[calc(100%-12px)] w-px', done ? 'bg-primary' : 'bg-border')} />}
            <span className={cn('relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2', done ? 'border-primary bg-primary text-white' : 'border-border bg-card text-muted-foreground', current && 'ring-4 ring-primary/15', ['cancelled', 'rejected'].includes(s) && 'border-rose-500 bg-rose-500')}>{done ? <Check className="h-3 w-3" /> : <Circle className="h-2 w-2" />}</span>
            <div className="min-w-0 pt-0.5">
              <div className={cn('text-sm font-medium', !done && 'text-muted-foreground')}>{t(`status.${s}`)}</div>
              {ev && <div className="text-xs text-muted-foreground">{fmtDateTime(ev.at)} · {ev.by}</div>}
              {ev?.note && <div className="mt-0.5 text-xs text-muted-foreground">{ev.note}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT();
  const settings = useSettings();
  const user = useUser();
  const qc = useQueryClient();
  const reorder = useReorder();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [comment, setComment] = useState('');
  const q = useQuery({ queryKey: ['order', id], queryFn: () => orderService.getOrder(id) });
  const inv = useQuery({ queryKey: ['invoices', q.data?.customerId], queryFn: () => invoiceService.getInvoices(q.data!.customerId), enabled: !!q.data?.invoiceId });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['order', id] }); qc.invalidateQueries({ queryKey: ['orders'] }); };
  const cancel = useMutation({ mutationFn: () => orderService.cancel(id, user.name), onSuccess: () => { refresh(); toast.success(t('orders.detail.cancelled')); } });
  const advance = useMutation({ mutationFn: () => orderService.advance(id, 'Sage X3 (simulated)'), onSuccess: (o) => { refresh(); toast.success(t('orders.detail.statusUpdated', { status: t(`status.${o.status}`) })); } });
  const addComment = useMutation({ mutationFn: () => orderService.addComment(id, { id: user.id, name: user.name, role: user.role }, comment), onSuccess: () => { setComment(''); refresh(); } });

  return (
    <div>
      <Link href="/orders" className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="me-1 h-4 w-4 rtl:rotate-180" aria-hidden="true" />{t('nav.orders')}</Link>
      <QueryView query={q} loading={<LoadingState variant="detail" />}>
        {(o) => {
          const invoice = inv.data?.find((i) => i.id === o.invoiceId);
          const canCancel = ['pending_approval', 'pending_sync', 'changes_requested'].includes(o.status) && (isCustomerRole(user.role) || user.role === 'SALES_REP');
          const canAdvance = (user.role === 'ADMIN' || user.role === 'SUPERVISOR') && ['confirmed', 'processing', 'packed'].includes(o.status);
          return (
            <div className="space-y-4">
              <Card className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><h1 className="font-mono text-xl font-semibold" data-testid="order-number">{o.number}</h1><StatusBadge status={o.status} />{o.requestId && <Link href={`/requests/${o.requestId}`} className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs text-primary hover:underline" data-testid="order-request">{o.requestNumber}</Link>}{o.site && <span className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs text-muted-foreground" data-testid="order-site"><MapPin className="h-3 w-3" aria-hidden="true" />{t('sites.label')} {o.site}</span>}</div>
                    <p className="mt-1 text-sm text-muted-foreground">{isCustomerRole(user.role) ? o.customerName : <RefLink href={`/customers/${o.customerId}`}>{o.customerName}</RefLink>} · {t('orders.detail.placed', { date: fmtDateTime(o.date), name: o.createdBy.name, role: t(`roles.${o.createdBy.role}`) })} · {t(`orders.source.${o.source}`)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(isCustomerRole(user.role) || user.role === 'SALES_REP') && o.status !== 'pending_sync' && <Button variant="outline" onClick={() => reorder(o)} data-testid="order-reorder"><RotateCcw className="me-2 h-4 w-4" aria-hidden="true" />{t('orders.detail.repeat')}</Button>}
                    {user.role === 'SUPERVISOR' && o.status === 'pending_approval' && <Button asChild><Link href={`/approvals?order=${o.id}`}><ClipboardCheck className="me-2 h-4 w-4" aria-hidden="true" />{t('orders.detail.review')}</Link></Button>}
                    {canAdvance && <Button variant="outline" onClick={() => advance.mutate()} disabled={advance.isPending} data-testid="advance-status"><FastForward className="me-2 h-4 w-4" aria-hidden="true" />{t('orders.detail.simulate')}</Button>}
                    {canCancel && <Button variant="outline" className="text-destructive" onClick={() => setConfirmCancel(true)}><XCircle className="me-2 h-4 w-4" aria-hidden="true" />{t('common.cancel')}</Button>}
                  </div>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-4 border-t pt-4 text-sm md:grid-cols-5">
                  <div><dt className="text-xs text-muted-foreground">{t('orders.detail.total')}</dt><dd className="font-semibold tabular">{fmtMoney(o.total, true)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">{t('orders.detail.expected')}</dt><dd className="font-medium">{o.status === 'pending_sync' ? t('orders.detail.afterSync') : fmtDate(o.expectedDelivery)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">{t('invoices.detail.customerPo')}</dt><dd className="font-medium">{o.poNumber ?? '—'}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">{t('invoices.detail.erpRef')}</dt><dd className="flex items-center gap-1 font-mono text-xs"><Cpu className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />{o.erpRef ?? t('orders.detail.notInErp')}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">{t('orders.detail.items')}</dt><dd className="font-medium">{o.lines.length}</dd></div>
                </dl>
              </Card>
              <div className="grid gap-4 lg:grid-cols-[1fr_340px] [&>*]:min-w-0">
                <div className="space-y-4">
                  <SectionCard title={t('orders.detail.products')}>
                    <ul className="divide-y">{o.lines.map((l) => (
                      <li key={`${l.productId}${l.free ? `-free-${l.offerId}` : ''}`} className={cn('flex items-center gap-3 px-4 py-3', l.free && 'bg-emerald-50/60 dark:bg-emerald-500/5')}>
                        <ProductImage src={l.image} alt={l.name} className="h-12 w-12 shrink-0 rounded-md" />
                        <div className="min-w-0 flex-1"><ProductRef id={l.productId} name={l.name} className="block truncate text-sm" /><div className="font-mono text-[11px] text-muted-foreground">{l.sku}<LineOfferChip line={l} /><FreeTag line={l} /></div></div>
                        <div className="hidden text-end text-sm text-muted-foreground tabular sm:block">{l.quantity} {l.uom} × {fmtMoney(l.unitPrice, true)}{l.discountPct ? <div className="text-xs text-emerald-700">−{l.discountPct}%</div> : null}</div>
                        <div className="w-28 text-end text-sm font-semibold tabular">{fmtMoney(l.lineTotal, true)}<div className="text-[11px] font-normal text-muted-foreground sm:hidden">{l.quantity} {l.uom}</div></div>
                      </li>
                    ))}</ul>
                  </SectionCard>
                  <div className="grid gap-4 md:grid-cols-2">
                    <OrderDelivery order={o} />
                    <SectionCard title={<span className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" aria-hidden="true" />{t('orders.detail.invoice')}</span>} bodyClassName="p-4 text-sm">
                      {invoice ? (<div className="flex items-center justify-between gap-2"><div><RefLink href={`/invoices/${invoice.id}`} className="font-mono text-xs font-semibold" testId="order-invoice-link">{invoice.number}</RefLink><div className="text-xs text-muted-foreground">{t('invoices.due', { date: fmtDate(invoice.dueDate) })}</div><div className="mt-1"><StatusBadge status={invoice.status} /></div></div><Button size="sm" variant="outline" onClick={() => toast.info(t('invoices.pdfInfo', { erp: settings.erpName, number: invoice.number }))}><Download className="me-1 h-3.5 w-3.5" aria-hidden="true" />PDF</Button></div>)
                        : <p className="text-muted-foreground">{t('orders.detail.invoiceAtDispatch', { erp: settings.erpName })}</p>}
                    </SectionCard>
                  </div>
                  <SectionCard title={<span className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" aria-hidden="true" />{t('requests.detail.comments')}</span>} bodyClassName="p-4">
                    {o.notes && <p className="mb-3 rounded-md bg-muted/60 p-3 text-sm"><span className="text-xs font-medium text-muted-foreground">{t('orders.detail.notes')} </span>{o.notes}</p>}
                    <ul className="space-y-3">{o.comments.map((c, i) => <li key={i} className="text-sm"><span className="font-medium">{c.by}</span> <span className="text-xs text-muted-foreground">{fmtDateTime(c.at)}</span><p className="text-muted-foreground">{c.text}</p></li>)}</ul>
                    {!o.comments.length && !o.notes && <p className="text-sm text-muted-foreground">{t('requests.detail.noComments')}</p>}
                    <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (comment.trim()) addComment.mutate(); }}>
                      <Textarea aria-label={t('requests.detail.addComment')} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('requests.detail.addComment')} rows={1} className="min-h-10" />
                      <Button type="submit" disabled={!comment.trim() || addComment.isPending}>{t('common.send')}</Button>
                    </form>
                  </SectionCard>
                </div>
                <div className="space-y-4">
                  <SectionCard title={t('orders.detail.timeline')} bodyClassName="p-4"><Timeline o={o} /></SectionCard>
                  <OrderSummary totals={o} />
                </div>
              </div>
              <ConfirmDialog open={confirmCancel} onOpenChange={setConfirmCancel} title={t('orders.detail.cancelTitle', { number: o.number })} description={t('orders.detail.cancelText')} confirmLabel={t('orders.detail.cancelConfirm')} destructive onConfirm={() => cancel.mutate()} />
            </div>
          );
        }}
      </QueryView>
    </div>
  );
}
