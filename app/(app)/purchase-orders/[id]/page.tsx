'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronLeft, PackageCheck, Truck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { purchaseOrderService, expectedDefault } from '@/lib/services';
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
import { PoStepper } from '@/features/purchasing/common';
import type { PurchaseOrder } from '@/types/domain';

export default function PurchaseOrderPage() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['purchase-order', id], queryFn: () => purchaseOrderService.get(id) });
  return (
    <div>
      <Link href="/purchase-orders" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="me-1 h-4 w-4 rtl:rotate-180" aria-hidden="true" />{t('purchaseOrders.title')}</Link>
      <QueryView query={q} loading={<LoadingState variant="detail" />}>{(o) => <Detail o={o} />}</QueryView>
    </div>
  );
}

function Detail({ o }: { o: PurchaseOrder }) {
  const { t } = useT();
  const errorText = useErrorText();
  const user = useUser();
  const qc = useQueryClient();
  const actor = { id: user.id, name: user.name, role: user.role };
  const supplier = user.role === 'SUPPLIER';
  const [dialog, setDialog] = useState<'pickup' | 'receive' | 'cancel' | null>(null);
  const [pickup, setPickup] = useState({ date: o.pickup?.date.slice(0, 10) ?? expectedDefault(), vehicle: o.pickup?.vehicle ?? '', driver: o.pickup?.driver ?? '', documents: o.pickup?.documents ?? '' });
  const [recv, setRecv] = useState<Record<string, number>>(() => Object.fromEntries(o.lines.map((l) => [l.productId, l.quantity - l.receivedQty])));
  const [reason, setReason] = useState('');
  const done = (msg: string) => { setDialog(null); qc.invalidateQueries(); toast.success(msg); };
  const fail = (e: unknown) => toast.error(errorText(e));
  const ack = useMutation({ mutationFn: () => purchaseOrderService.acknowledge(o.id, actor), onSuccess: () => done(t('purchaseOrders.acknowledged')), onError: fail });
  const confirm = useMutation({ mutationFn: () => purchaseOrderService.confirmPickup(o.id, actor, { ...pickup, date: new Date(pickup.date).toISOString() }), onSuccess: () => done(t('purchaseOrders.pickupSaved')), onError: fail });
  const dispatch = useMutation({ mutationFn: () => purchaseOrderService.dispatch(o.id, actor), onSuccess: () => done(t('purchaseOrders.dispatched')), onError: fail });
  const receive = useMutation({ mutationFn: () => purchaseOrderService.receive(o.id, actor, Object.entries(recv).map(([productId, quantity]) => ({ productId, quantity }))), onSuccess: () => done(t('purchaseOrders.receivedMsg')), onError: fail });
  const cancel = useMutation({ mutationFn: () => purchaseOrderService.cancel(o.id, actor, reason), onSuccess: () => done(t('purchaseOrders.cancelledMsg')), onError: fail });

  const hasActions = supplier ? ['issued', 'acknowledged', 'pickup_confirmed'].includes(o.status) : ['issued', 'acknowledged', 'in_transit', 'partly_received'].includes(o.status);
  const actions = supplier ? (
    <>
      {o.status === 'issued' && <Button className="w-full" onClick={() => ack.mutate()} disabled={ack.isPending} data-testid="po-ack"><CheckCircle2 className="me-2 h-4 w-4" aria-hidden="true" />{t('purchaseOrders.acknowledge')}</Button>}
      {['acknowledged', 'pickup_confirmed'].includes(o.status) && <Button className="w-full" variant={o.status === 'pickup_confirmed' ? 'outline' : 'default'} onClick={() => setDialog('pickup')} data-testid="po-pickup"><Truck className="me-2 h-4 w-4" aria-hidden="true" />{t('purchaseOrders.confirmPickup')}</Button>}
      {o.status === 'pickup_confirmed' && <Button className="w-full" onClick={() => dispatch.mutate()} disabled={dispatch.isPending} data-testid="po-dispatch">{t('purchaseOrders.dispatch')}</Button>}
    </>
  ) : (
    <>
      {['in_transit', 'partly_received'].includes(o.status) && <Button className="w-full" onClick={() => setDialog('receive')} data-testid="po-receive"><PackageCheck className="me-2 h-4 w-4" aria-hidden="true" />{t('purchaseOrders.receive')}</Button>}
      {['issued', 'acknowledged'].includes(o.status) && <Button className="w-full text-destructive" variant="outline" onClick={() => setDialog('cancel')} data-testid="po-cancel"><XCircle className="me-2 h-4 w-4" aria-hidden="true" />{t('purchaseOrders.cancel')}</Button>}
    </>
  );

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2"><h1 className="font-mono text-xl font-semibold" data-testid="po-number">{o.number}</h1><StatusBadge status={o.status} />{o.site && <span className="rounded-md border px-2 py-0.5 text-xs text-muted-foreground">{t('sites.label')} {o.site}</span>}{o.erpRef && <span className="font-mono text-xs text-muted-foreground">{o.erpRef}</span>}</div>
        <p className="mt-1 text-sm text-muted-foreground">{o.supplierName} · {fmtDate(o.date)} · {t('purchaseOrders.expected', { date: fmtDate(o.expectedDate) })}</p>
        {o.requestId && <Link href={`/purchase-requests/${o.requestId}`} className="mt-1 inline-block text-sm text-primary hover:underline">{t('purchaseOrders.fromRequest', { number: o.requestNumber ?? '' })}</Link>}
      </div>
      <Card className="p-4"><PoStepper status={o.status} /></Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-4 py-2 text-start font-medium">{t('requests.detail.lines')}</th><th className="px-3 py-2 text-end font-medium">{t('purchaseOrders.ordered')}</th><th className="px-3 py-2 text-end font-medium">{t('purchaseOrders.received')}</th><th className="px-4 py-2 text-end font-medium">{t('requests.detail.lineTotal')}</th></tr></thead>
              <tbody className="divide-y">{o.lines.map((l) => (
                <tr key={l.productId}><td className="px-4 py-2.5"><div className="font-medium">{l.name}</div><div className="font-mono text-[11px] text-muted-foreground">{l.sku} · {fmtMoney(l.unitCost, true)}</div></td><td className="px-3 py-2.5 text-end tabular">{fmtNumber(l.quantity)} {l.uom}</td><td className="px-3 py-2.5 text-end tabular" data-testid={`po-recv-${l.productId}`}>{fmtNumber(l.receivedQty)}</td><td className="px-4 py-2.5 text-end font-medium tabular">{fmtMoney(l.lineTotal, true)}</td></tr>
              ))}</tbody>
              <tfoot className="border-t bg-muted/20"><tr><td className="px-4 py-2.5 font-semibold" colSpan={3}>{t('common.total')}</td><td className="px-4 py-2.5 text-end font-semibold tabular">{fmtMoney(o.total, true)}</td></tr></tfoot>
            </table>
          </Card>
          <SectionCard title={t('purchaseOrders.receipts')}>
            {o.receipts.length ? <ul className="divide-y">{o.receipts.map((g) => (
              <li key={g.id} className="px-4 py-3 text-sm"><div className="flex justify-between gap-2"><span className="font-mono font-semibold">{g.number}</span><span className="text-xs text-muted-foreground">{fmtDateTime(g.at)} · {g.by}</span></div>
                <div className="mt-1 text-xs text-muted-foreground">{g.lines.map((x) => `${o.lines.find((l) => l.productId === x.productId)?.sku} × ${fmtNumber(x.quantity)}`).join(' · ')}</div></li>
            ))}</ul> : <p className="p-4 text-sm text-muted-foreground">{t('purchaseOrders.noReceipts')}</p>}
          </SectionCard>
        </div>
        <div className="space-y-4">
          {hasActions && <Card className="space-y-2 p-4">{actions}</Card>}
          {o.pickup && (
            <SectionCard title={t('purchaseOrders.pickup')}>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 p-4 text-sm">
                <dt className="text-muted-foreground">{t('purchaseOrders.pickupDate')}</dt><dd>{fmtDate(o.pickup.date)}</dd>
                <dt className="text-muted-foreground">{t('purchaseOrders.vehicle')}</dt><dd className="font-mono">{o.pickup.vehicle}</dd>
                {o.pickup.driver && <><dt className="text-muted-foreground">{t('purchaseOrders.driver')}</dt><dd>{o.pickup.driver}</dd></>}
                {o.pickup.documents && <><dt className="text-muted-foreground">{t('purchaseOrders.documents')}</dt><dd>{o.pickup.documents}</dd></>}
              </dl>
            </SectionCard>
          )}
          <SectionCard title={t('requests.detail.timeline')}>
            <ol className="space-y-3 p-4">{[...o.timeline].reverse().map((e, i) => (
              <li key={i} className="flex gap-3 text-sm"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" /><div><div className="flex flex-wrap items-center gap-2"><StatusBadge status={e.status} /><span className="text-xs text-muted-foreground">{fmtDateTime(e.at)}</span></div><div className="mt-0.5 text-xs text-muted-foreground">{e.by}{e.note ? ` · ${e.note}` : ''}</div></div></li>
            ))}</ol>
          </SectionCard>
        </div>
      </div>

      <Dialog open={dialog === 'pickup'} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('purchaseOrders.confirmPickup')}</DialogTitle><DialogDescription>{t('purchaseOrders.pickupText')}</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="pd">{t('purchaseOrders.pickupDate')}</Label><Input id="pd" type="date" value={pickup.date} onChange={(e) => setPickup({ ...pickup, date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="pv">{t('purchaseOrders.vehicle')}</Label><Input id="pv" value={pickup.vehicle} placeholder={t('purchaseOrders.vehiclePlaceholder')} onChange={(e) => setPickup({ ...pickup, vehicle: e.target.value })} data-testid="po-vehicle" /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="pr">{t('purchaseOrders.driver')}</Label><Input id="pr" value={pickup.driver} placeholder={t('purchaseOrders.driverPlaceholder')} onChange={(e) => setPickup({ ...pickup, driver: e.target.value })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="pdoc">{t('purchaseOrders.documents')}</Label><Input id="pdoc" value={pickup.documents} placeholder={t('purchaseOrders.documentsPlaceholder')} onChange={(e) => setPickup({ ...pickup, documents: e.target.value })} /></div>
          </div>
          <DialogFooter className="gap-2"><Button variant="ghost" onClick={() => setDialog(null)}>{t('common.cancel')}</Button><Button onClick={() => confirm.mutate()} disabled={confirm.isPending} data-testid="po-pickup-confirm">{t('purchaseOrders.confirm')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'receive'} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('purchaseOrders.receive')}</DialogTitle><DialogDescription>{t('purchaseOrders.receiveText')}</DialogDescription></DialogHeader>
          <ul className="divide-y rounded-md border">{o.lines.filter((l) => l.receivedQty < l.quantity).map((l) => (
            <li key={l.productId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0"><div className="truncate font-medium">{l.name}</div><div className="text-xs text-muted-foreground">{fmtNumber(l.quantity - l.receivedQty)} {l.uom} {t('purchaseOrders.open').toLowerCase()}</div></div>
              <Input type="number" min={0} max={l.quantity - l.receivedQty} className="h-9 w-24 text-end" aria-label={l.name} data-testid={`grn-${l.productId}`} value={recv[l.productId] ?? 0}
                onChange={(e) => setRecv((s) => ({ ...s, [l.productId]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))} />
            </li>
          ))}</ul>
          <DialogFooter className="gap-2"><Button variant="ghost" onClick={() => setDialog(null)}>{t('common.cancel')}</Button><Button onClick={() => receive.mutate()} disabled={receive.isPending} data-testid="grn-post">{t('purchaseOrders.receiveConfirm')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'cancel'} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('purchaseOrders.cancelTitle', { number: o.number })}</DialogTitle><DialogDescription>{t('purchaseOrders.cancelText')}</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="cr">{t('purchaseOrders.reason')}</Label><Textarea id="cr" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="po-cancel-reason" /></div>
          <DialogFooter className="gap-2"><Button variant="ghost" onClick={() => setDialog(null)}>{t('requests.convert.back')}</Button><Button variant="destructive" disabled={!reason.trim() || cancel.isPending} onClick={() => cancel.mutate()} data-testid="po-cancel-confirm">{t('purchaseOrders.cancel')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
