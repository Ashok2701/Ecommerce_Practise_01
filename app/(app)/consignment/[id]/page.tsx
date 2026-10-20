'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, MapPin, PackagePlus, Send } from 'lucide-react';
import { toast } from 'sonner';
import { consignmentService, type ConsignmentView } from '@/lib/services';
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
import { cn } from '@/lib/utils';
import { isCustomerRole, isManagerRole } from '@/types/domain';

export default function ConsignmentPage() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const user = useUser();
  // customers only ever see their own consignment (the backend enforces this as well)
  const q = useQuery({ queryKey: ['consignment', id], queryFn: async () => {
    const c = await consignmentService.get(id);
    if (isCustomerRole(user.role) && c.customerId !== user.customerId) throw new Error('errors.consignment.notFound');
    return c;
  } });
  return (
    <div>
      <Link href="/consignment" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="me-1 h-4 w-4 rtl:rotate-180" aria-hidden="true" />{t('consignment.title')}</Link>
      <QueryView query={q} loading={<LoadingState variant="detail" />}>{(c) => <Detail c={c} />}</QueryView>
    </div>
  );
}

function Detail({ c }: { c: ConsignmentView }) {
  const { t } = useT();
  const errorText = useErrorText();
  const user = useUser();
  const router = useRouter();
  const qc = useQueryClient();
  const actor = { id: user.id, name: user.name, role: user.role };
  const manager = isManagerRole(user.role);
  // customers and their reps call off; managers top up
  const canCallOff = user.role === 'CUSTOMER_B2B' || user.role === 'SALES_REP';
  const [qty, setQty] = useState<Record<string, number>>({});
  const [callOpen, setCallOpen] = useState(false);
  const [po, setPo] = useState('');
  const [notes, setNotes] = useState('');
  const [topOpen, setTopOpen] = useState(false);
  const [top, setTop] = useState<Record<string, number>>(() => Object.fromEntries(c.lines.map((l) => [l.productId, l.low ? l.minQty * 2 - l.quantity : 0])));
  const items = Object.entries(qty).filter(([, n]) => n > 0).map(([productId, quantity]) => ({ productId, quantity }));
  const over = items.some((i) => (c.lines.find((l) => l.productId === i.productId)?.available ?? 0) < i.quantity);
  const callOff = useMutation({
    mutationFn: () => consignmentService.callOff({ consignmentId: c.id, items, poNumber: po || undefined, notes: notes || undefined, actor }),
    onSuccess: (r) => {
      qc.invalidateQueries(); setQty({}); setCallOpen(false); setPo(''); setNotes('');
      toast.success(r.status === 'converted' ? t('consignment.calledOffConverted', { number: r.orderNumbers.at(-1) ?? r.number }) : t('consignment.calledOff', { number: r.number }));
      router.push(`/requests/${r.id}`);
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const topUp = useMutation({
    mutationFn: () => consignmentService.topUp(c.id, actor, Object.entries(top).map(([productId, quantity]) => ({ productId, quantity }))),
    onSuccess: () => { qc.invalidateQueries(); setTopOpen(false); toast.success(t('consignment.toppedUp')); },
    onError: (e) => toast.error(errorText(e)),
  });
  const nameOf = (pid: string) => c.lines.find((l) => l.productId === pid)?.name ?? pid;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold">{c.customerName}</h1><span className="font-mono text-xs text-muted-foreground">{c.number}</span></div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-4 w-4" aria-hidden="true" />{t('consignment.heldAt', { site: c.site, location: c.location })}</p>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{canCallOff ? t('consignment.callOffIntro') : t('consignment.staffIntro')}</p>
        </div>
        {manager && <Button variant="outline" onClick={() => setTopOpen(true)} data-testid="cons-topup"><PackagePlus className="me-2 h-4 w-4" aria-hidden="true" />{t('consignment.topUp')}</Button>}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm" data-testid="cons-lines">
          <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
            <th className="px-4 py-2.5 text-start font-medium">{t('inventory.col.product')}</th>
            <th className="px-3 py-2.5 text-end font-medium">{t('consignment.col.atLocation')}</th>
            <th className="px-3 py-2.5 text-end font-medium">{t('consignment.col.reserved')}</th>
            <th className="px-3 py-2.5 text-end font-medium">{t('consignment.col.available')}</th>
            <th className="px-3 py-2.5 text-end font-medium">{t('consignment.col.min')}</th>
            {canCallOff && <th className="px-4 py-2.5 text-end font-medium">{t('consignment.col.callOff')}</th>}
          </tr></thead>
          <tbody className="divide-y">{c.lines.map((l) => {
            const n = qty[l.productId] ?? 0;
            return (
              <tr key={l.productId} className={l.low ? 'bg-amber-50/50 dark:bg-amber-500/5' : ''}>
                <td className="px-4 py-2.5"><div className="font-medium">{l.name}</div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><span className="font-mono">{l.sku}</span>{l.low && <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400"><AlertTriangle className="h-3 w-3" aria-hidden="true" />{t('consignment.belowMinShort')}</span>}</div></td>
                <td className="px-3 py-2.5 text-end tabular">{fmtNumber(l.quantity)} {l.uom}</td>
                <td className="px-3 py-2.5 text-end tabular text-muted-foreground">{l.reserved ? fmtNumber(l.reserved) : '—'}</td>
                <td className="px-3 py-2.5 text-end font-semibold tabular" data-testid={`cons-avail-${l.productId}`}>{fmtNumber(l.available)}</td>
                <td className="px-3 py-2.5 text-end tabular text-muted-foreground">{fmtNumber(l.minQty)}</td>
                {canCallOff && <td className="px-4 py-2.5 text-end">
                  <Input type="number" min={0} max={l.available} inputMode="numeric" aria-label={`${t('consignment.col.callOff')}: ${l.name}`} aria-invalid={n > l.available} disabled={!l.available}
                    className={cn('ms-auto h-9 w-24 text-end', n > l.available && 'border-destructive')} data-testid={`cons-qty-${l.productId}`} value={qty[l.productId] ?? ''}
                    onChange={(e) => setQty((s) => ({ ...s, [l.productId]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))} />
                </td>}
              </tr>
            );
          })}</tbody>
        </table>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={t('consignment.openCallOffs')}>
          {c.openCallOffs.length ? <ul className="divide-y">{c.openCallOffs.map((r) => (
            <li key={r.id}><Link href={`/requests/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/40"><span><span className="font-mono font-semibold">{r.number}</span> <span className="text-xs text-muted-foreground">{fmtDate(r.date)}</span></span><StatusBadge status={r.status} /></Link></li>
          ))}</ul> : <p className="p-4 text-sm text-muted-foreground">{t('consignment.noCallOffs')}</p>}
        </SectionCard>
        <SectionCard title={t('consignment.movements')}>
          <ul className="max-h-80 divide-y overflow-y-auto" data-testid="cons-movements">{c.movements.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0"><div className="truncate font-medium">{nameOf(m.productId)}</div><div className="text-xs text-muted-foreground">{t(`consignment.kind.${m.kind}`)}{m.ref ? ` · ${m.ref}` : ''} · {m.by} · {fmtDateTime(m.at)}</div></div>
              <span className={cn('shrink-0 font-semibold tabular', m.quantity > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground')}>{m.quantity > 0 ? '+' : '−'}{fmtNumber(Math.abs(m.quantity))}</span>
            </li>
          ))}</ul>
        </SectionCard>
      </div>

      {canCallOff && items.length > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-40 border-t bg-card px-4 py-3 shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.25)] md:bottom-0 md:ps-20 lg:ps-72">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3">
            <span className="text-sm font-medium">{over ? <span className="text-destructive">{t('errors.consignment.notEnough')}</span> : t('supplierCatalog.selected', { count: items.length })}</span>
            <Button onClick={() => setCallOpen(true)} disabled={over} data-testid="cons-calloff"><Send className="me-2 h-4 w-4" aria-hidden="true" />{t('consignment.callOff')}</Button>
          </div>
        </div>
      )}

      <Dialog open={callOpen} onOpenChange={setCallOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('consignment.callOff')}</DialogTitle><DialogDescription>{t('consignment.callOffText')}</DialogDescription></DialogHeader>
          <ul className="divide-y rounded-md border text-sm">{items.map((i) => <li key={i.productId} className="flex justify-between gap-3 px-3 py-2"><span className="truncate">{nameOf(i.productId)}</span><span className="font-semibold tabular">{fmtNumber(i.quantity)}</span></li>)}</ul>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label htmlFor="po">{t('checkout.po')}</Label><Input id="po" value={po} onChange={(e) => setPo(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="cn">{t('supplierCatalog.notes')}</Label><Textarea id="cn" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          </div>
          <DialogFooter className="gap-2"><Button variant="ghost" onClick={() => setCallOpen(false)}>{t('common.cancel')}</Button><Button onClick={() => callOff.mutate()} disabled={callOff.isPending} data-testid="cons-calloff-send">{t('consignment.callOffSubmit')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={topOpen} onOpenChange={setTopOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('consignment.topUp')}</DialogTitle><DialogDescription>{t('consignment.topUpText', { site: c.site, location: c.location })}</DialogDescription></DialogHeader>
          <ul className="divide-y rounded-md border">{c.lines.map((l) => (
            <li key={l.productId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0"><div className="truncate font-medium">{l.name}</div><div className="text-xs text-muted-foreground">{t('consignment.nowMin', { now: fmtNumber(l.quantity), min: fmtNumber(l.minQty) })}</div></div>
              <Input type="number" min={0} className="h-9 w-24 text-end" aria-label={l.name} data-testid={`cons-top-${l.productId}`} value={top[l.productId] ?? 0}
                onChange={(e) => setTop((s) => ({ ...s, [l.productId]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))} />
            </li>
          ))}</ul>
          <DialogFooter className="gap-2"><Button variant="ghost" onClick={() => setTopOpen(false)}>{t('common.cancel')}</Button><Button onClick={() => topUp.mutate()} disabled={topUp.isPending} data-testid="cons-topup-confirm">{t('consignment.topUpConfirm')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
