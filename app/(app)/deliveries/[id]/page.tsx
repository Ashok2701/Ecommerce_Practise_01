'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ClipboardSignature, MapPin, RotateCcw, Truck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { deliveryService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useErrorText, useT } from '@/lib/i18n';
import { fmtDate, fmtDateTime, fmtNumber } from '@/lib/format';
import { QueryView, LoadingState, SectionCard } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PodForm, PodView } from '@/features/deliveries/PodForm';
import { cn } from '@/lib/utils';
import { DELIVERY_FLOW, type Delivery } from '@/types/domain';

export default function DeliveryPage() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['delivery', id], queryFn: () => deliveryService.get(id) });
  return (
    <div>
      <Link href="/deliveries" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="me-1 h-4 w-4 rtl:rotate-180" aria-hidden="true" />{t('deliveries.title')}</Link>
      <QueryView query={q} loading={<LoadingState variant="detail" />}>{(d) => <Detail d={d} />}</QueryView>
    </div>
  );
}

function Detail({ d }: { d: Delivery }) {
  const { t } = useT();
  const errorText = useErrorText();
  const user = useUser();
  const qc = useQueryClient();
  const actor = { id: user.id, name: user.name, role: user.role };
  const [dialog, setDialog] = useState<'dispatch' | 'pod' | 'fail' | 'reschedule' | null>(null);
  const [driver, setDriver] = useState(d.driver ?? '');
  const [vehicle, setVehicle] = useState(d.vehicle ?? '');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const done = (msg: string) => { qc.invalidateQueries(); toast.success(msg); setDialog(null); };
  const fail = (e: unknown) => toast.error(errorText(e));
  const dispatch = useMutation({ mutationFn: () => deliveryService.dispatch(d.id, actor, driver, vehicle), onSuccess: () => done(t('deliveries.msg.out')), onError: fail });
  const pod = useMutation({ mutationFn: (v: Parameters<typeof deliveryService.recordPod>[2]) => deliveryService.recordPod(d.id, actor, v), onSuccess: () => done(t('deliveries.msg.delivered')), onError: fail });
  const failed = useMutation({ mutationFn: () => deliveryService.fail(d.id, actor, reason), onSuccess: () => done(t('deliveries.msg.failed')), onError: fail });
  const resched = useMutation({ mutationFn: () => deliveryService.reschedule(d.id, actor, new Date(date).toISOString()), onSuccess: () => done(t('deliveries.msg.rescheduled')), onError: fail });
  const idx = d.status === 'failed' ? 1 : DELIVERY_FLOW.indexOf(d.status);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2"><h1 className="font-mono text-xl font-semibold" data-testid="del-number">{d.number}</h1><StatusBadge status={d.status} /><Link href={`/orders/${d.orderId}`} className="rounded-md border px-2 py-0.5 font-mono text-xs text-primary hover:underline">{d.orderNumber}</Link></div>
        <p className="mt-1 text-sm text-muted-foreground">{d.customerName} · {t('deliveries.plannedFor', { date: fmtDate(d.plannedDate) })} · {d.carrier}{d.trackingRef ? ` · ${d.trackingRef}` : ''}</p>
      </div>
      <Card className="p-4">
        <ol className="grid grid-cols-3 gap-1" data-testid="del-stepper">
          {DELIVERY_FLOW.map((s, i) => (
            <li key={s} className="flex flex-col items-center gap-1.5 text-center">
              <span className={cn('h-1.5 w-full rounded-full', i <= idx ? (d.status === 'failed' && i === 1 ? 'bg-destructive' : 'bg-primary') : 'bg-muted')} />
              <span className={cn('text-[11px]', i === idx ? 'font-semibold' : 'text-muted-foreground')}>{t(`status.${d.status === 'failed' && i === 1 ? 'failed' : s}`)}</span>
            </li>
          ))}
        </ol>
        {d.failReason && <p className="mt-3 text-center text-sm text-destructive">{d.failReason}</p>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-4 py-2 text-start font-medium">{t('inventory.col.product')}</th><th className="px-3 py-2 text-end font-medium">{t('deliveries.col.shipped')}</th><th className="px-3 py-2 text-end font-medium">{t('deliveries.pod.received')}</th><th className="px-4 py-2 text-end font-medium">{t('deliveries.pod.damaged')}</th></tr></thead>
              <tbody className="divide-y">{d.lines.map((l) => (
                <tr key={l.productId}><td className="px-4 py-2.5"><div className="font-medium">{l.name}</div><div className="font-mono text-[11px] text-muted-foreground">{l.sku}</div></td>
                  <td className="px-3 py-2.5 text-end tabular">{fmtNumber(l.quantity)} {l.uom}</td>
                  <td className={cn('px-3 py-2.5 text-end tabular', l.receivedQty !== undefined && l.receivedQty < l.quantity && 'font-semibold text-destructive')}>{l.receivedQty !== undefined ? fmtNumber(l.receivedQty) : '—'}</td>
                  <td className={cn('px-4 py-2.5 text-end tabular', (l.damagedQty ?? 0) > 0 && 'font-semibold text-destructive')}>{l.damagedQty ? fmtNumber(l.damagedQty) : '—'}</td></tr>
              ))}</tbody>
            </table>
          </Card>
          {d.pod && <SectionCard title={t('deliveries.pod.title')}><div className="p-4"><PodView d={d} /></div></SectionCard>}
        </div>
        <div className="space-y-4">
          {d.status !== 'delivered' && (
            <Card className="space-y-2 p-4">
              {d.status === 'scheduled' && <Button className="w-full" onClick={() => setDialog('dispatch')} data-testid="del-dispatch"><Truck className="me-2 h-4 w-4" aria-hidden="true" />{t('deliveries.outForDelivery')}</Button>}
              {['scheduled', 'out_for_delivery'].includes(d.status) && <Button className="w-full" variant={d.status === 'scheduled' ? 'outline' : 'default'} onClick={() => setDialog('pod')} data-testid="del-pod"><ClipboardSignature className="me-2 h-4 w-4" aria-hidden="true" />{t('deliveries.recordPod')}</Button>}
              {d.status === 'out_for_delivery' && <Button className="w-full text-destructive" variant="outline" onClick={() => { setReason(''); setDialog('fail'); }} data-testid="del-fail"><XCircle className="me-2 h-4 w-4" aria-hidden="true" />{t('deliveries.markFailed')}</Button>}
              {d.status === 'failed' && <Button className="w-full" onClick={() => setDialog('reschedule')} data-testid="del-reschedule"><RotateCcw className="me-2 h-4 w-4" aria-hidden="true" />{t('deliveries.reschedule')}</Button>}
            </Card>
          )}
          <SectionCard title={<span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" aria-hidden="true" />{t('deliveries.address')}</span>}>
            <div className="p-4 text-sm text-muted-foreground">{d.address.line1}<br />{d.address.city}, {d.address.state} {d.address.postalCode}
              {(d.driver || d.vehicle) && <p className="mt-2 text-xs">{[d.driver, d.vehicle].filter(Boolean).join(' · ')}</p>}</div>
          </SectionCard>
          <SectionCard title={t('requests.detail.timeline')}>
            <ol className="space-y-3 p-4">{[...d.timeline].reverse().map((e, i) => (
              <li key={i} className="flex gap-3 text-sm"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" /><div><div className="flex flex-wrap items-center gap-2"><StatusBadge status={e.status} /><span className="text-xs text-muted-foreground">{fmtDateTime(e.at)}</span></div><div className="mt-0.5 text-xs text-muted-foreground">{e.by}{e.note ? ` · ${e.note}` : ''}</div></div></li>
            ))}</ol>
          </SectionCard>
        </div>
      </div>

      <Dialog open={dialog === 'dispatch'} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('deliveries.outForDelivery')}</DialogTitle><DialogDescription>{t('deliveries.dispatchText')}</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="dr">{t('purchaseOrders.driver')}</Label><Input id="dr" value={driver} onChange={(e) => setDriver(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="vh">{t('purchaseOrders.vehicle')}</Label><Input id="vh" value={vehicle} onChange={(e) => setVehicle(e.target.value)} /></div>
          </div>
          <DialogFooter className="gap-2"><Button variant="ghost" onClick={() => setDialog(null)}>{t('common.cancel')}</Button><Button onClick={() => dispatch.mutate()} disabled={dispatch.isPending} data-testid="del-dispatch-confirm">{t('purchaseOrders.confirm')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === 'pod'} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>{t('deliveries.recordPod')}</DialogTitle><DialogDescription>{t('deliveries.podText')}</DialogDescription></DialogHeader>
          {dialog === 'pod' && <PodForm delivery={d} customer={false} pending={pod.isPending} onCancel={() => setDialog(null)} onSubmit={(v) => pod.mutate(v)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === 'fail'} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('deliveries.markFailed')}</DialogTitle><DialogDescription>{t('deliveries.failText')}</DialogDescription></DialogHeader>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('deliveries.failPlaceholder')} aria-label={t('purchaseOrders.reason')} data-testid="del-fail-reason" />
          <DialogFooter className="gap-2"><Button variant="ghost" onClick={() => setDialog(null)}>{t('common.cancel')}</Button><Button variant="destructive" disabled={!reason.trim() || failed.isPending} onClick={() => failed.mutate()} data-testid="del-fail-confirm">{t('deliveries.markFailed')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === 'reschedule'} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('deliveries.reschedule')}</DialogTitle><DialogDescription>{t('deliveries.rescheduleText')}</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="rd">{t('deliveries.col.planned')}</Label><Input id="rd" type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="del-resched-date" /></div>
          <DialogFooter className="gap-2"><Button variant="ghost" onClick={() => setDialog(null)}>{t('common.cancel')}</Button><Button onClick={() => resched.mutate()} disabled={!date || resched.isPending} data-testid="del-resched-confirm">{t('purchaseOrders.confirm')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
