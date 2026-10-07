'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, MessageSquareWarning, ClipboardCheck, AlertTriangle, ChevronRight, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { orderService, customerService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { fmtDate, fmtDateTime, fmtMoney, timeAgo } from '@/lib/format';
import { PageHeader, QueryView, EmptyState, LoadingState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { Order } from '@/types/domain';

function Review({ order, onDone }: { order: Order; onDone: () => void }) {
  const user = useUser();
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const [confirm, setConfirm] = useState<null | 'reject'>(null);
  const cust = useQuery({ queryKey: ['customer', order.customerId], queryFn: () => customerService.getCustomer(order.customerId) });
  const m = useMutation({
    mutationFn: (d: 'approve' | 'reject' | 'changes') => orderService.decide(order.id, d, { id: user.id, name: user.name, role: user.role }, comment || undefined),
    onSuccess: (o) => { qc.invalidateQueries(); toast.success(o.status === 'confirmed' ? `${o.number} approved – posted to ERP` : o.status === 'rejected' ? `${o.number} rejected` : `Changes requested on ${o.number}`); setComment(''); onDone(); },
  });
  const c = cust.data;
  const available = c ? c.creditLimit - c.outstanding : 0;
  const overCredit = c && order.total > available;
  const editable = order.status === 'pending_approval';
  return (
    <div className="space-y-4" data-testid="approval-review">
      <div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-lg font-semibold">{order.number}</span><StatusBadge status={order.status} /></div><p className="text-sm text-muted-foreground">Submitted {fmtDateTime(order.date)} by {order.createdBy.name} · {order.source.replace('_', ' ')}</p></div>
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><Building2 className="h-4 w-4 text-primary" />{order.customerName}</div>
        {c ? <dl className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><dt className="text-muted-foreground">Credit limit</dt><dd className="font-medium tabular">{fmtMoney(c.creditLimit)}</dd></div><div><dt className="text-muted-foreground">Outstanding</dt><dd className="font-medium tabular">{fmtMoney(c.outstanding)}</dd></div><div><dt className="text-muted-foreground">Available</dt><dd className={cn('font-medium tabular', overCredit && 'text-rose-600')}>{fmtMoney(available)}</dd></div></dl> : <LoadingState rows={1} />}
        {overCredit && <div className="mt-3 flex gap-2 rounded-md bg-rose-50 p-2.5 text-xs text-rose-800"><AlertTriangle className="h-4 w-4 shrink-0" />Order value exceeds available credit by {fmtMoney(order.total - available)}.</div>}
        {c?.status === 'on_hold' && <div className="mt-2 flex gap-2 rounded-md bg-orange-50 p-2.5 text-xs text-orange-800"><AlertTriangle className="h-4 w-4 shrink-0" />Customer account is on hold.</div>}
      </Card>
      <Card className="overflow-hidden">
        <table className="w-full text-sm"><thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-left font-medium">Item</th><th className="px-3 py-2 text-right font-medium">Qty</th><th className="px-3 py-2 text-right font-medium">Amount</th></tr></thead>
          <tbody className="divide-y">{order.lines.map((l) => <tr key={l.productId}><td className="px-3 py-2"><div className="font-medium">{l.name}</div><div className="text-[11px] text-muted-foreground">{fmtMoney(l.unitPrice, true)} / {l.uom}{l.discountPct ? ` · −${l.discountPct}%` : ''}</div></td><td className="px-3 py-2 text-right tabular">{l.quantity}</td><td className="px-3 py-2 text-right font-medium tabular">{fmtMoney(l.lineTotal)}</td></tr>)}</tbody>
          <tfoot className="border-t bg-muted/30"><tr><td className="px-3 py-2 text-sm font-semibold" colSpan={2}>Total incl. GST</td><td className="px-3 py-2 text-right font-semibold tabular">{fmtMoney(order.total, true)}</td></tr></tfoot></table>
      </Card>
      {order.notes && <p className="rounded-md bg-muted/60 p-3 text-sm"><span className="text-xs font-medium text-muted-foreground">Customer notes: </span>{order.notes}</p>}
      {!!order.comments.length && <ul className="space-y-2 text-sm">{order.comments.map((cm, i) => <li key={i}><span className="font-medium">{cm.by}</span> <span className="text-xs text-muted-foreground">{timeAgo(cm.at)}</span><p className="text-muted-foreground">{cm.text}</p></li>)}</ul>}
      {editable ? (
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="ac">Comment {`(required for reject / changes)`}</Label><Textarea id="ac" data-testid="approval-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="e.g. Approved – dispatch from Hyderabad DC" /></div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button onClick={() => m.mutate('approve')} disabled={m.isPending} className="h-11 bg-emerald-600 hover:bg-emerald-700" data-testid="approve-btn"><CheckCircle2 className="mr-2 h-4 w-4" />Approve</Button>
            <Button variant="outline" onClick={() => (comment.trim() ? m.mutate('changes') : toast.error('Add a comment describing the changes needed'))} disabled={m.isPending} className="h-11" data-testid="changes-btn"><MessageSquareWarning className="mr-2 h-4 w-4" />Request changes</Button>
            <Button variant="outline" onClick={() => (comment.trim() ? setConfirm('reject') : toast.error('Add a reason for rejection'))} disabled={m.isPending} className="h-11 text-destructive" data-testid="reject-btn"><XCircle className="mr-2 h-4 w-4" />Reject</Button>
          </div>
        </div>
      ) : <p className="text-sm text-muted-foreground">This order has already been processed.</p>}
      <ConfirmDialog open={confirm === 'reject'} onOpenChange={(v) => !v && setConfirm(null)} title={`Reject ${order.number}?`} description="The customer and sales representative will be notified with your comment." confirmLabel="Reject order" destructive onConfirm={() => m.mutate('reject')} />
    </div>
  );
}

function ApprovalsInner() {
  const pre = useSearchParams().get('order');
  const [tab, setTab] = useState<'pending' | 'decided'>('pending');
  const [sel, setSel] = useState<string | null>(pre);
  const [sheet, setSheet] = useState(!!pre);
  const q = useQuery({ queryKey: ['orders', 'approvals'], queryFn: () => orderService.getOrders({}) });
  const pending = (q.data ?? []).filter((o) => o.status === 'pending_approval');
  const decided = (q.data ?? []).filter((o) => o.comments.length || ['changes_requested', 'rejected'].includes(o.status)).filter((o) => o.status !== 'pending_approval').slice(0, 20);
  const list = tab === 'pending' ? pending : decided;
  const selected = q.data?.find((o) => o.id === sel) ?? null;
  useEffect(() => { if (!sel && pending[0] && typeof window !== 'undefined' && window.innerWidth >= 1024) setSel(pending[0].id); }, [pending, sel]);
  const open = (id: string) => { setSel(id); if (window.innerWidth < 1024) setSheet(true); };
  return (
    <div>
      <PageHeader title="Purchase approvals" description="Review submitted orders before they are posted to Sage X3." />
      <div className="mb-4 flex gap-1.5" role="tablist">
        {(['pending', 'decided'] as const).map((k) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('rounded-md border px-3 py-1.5 text-xs font-medium', tab === k ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground')} data-testid={`approvals-tab-${k}`}>{k === 'pending' ? `Pending (${pending.length})` : 'Recently reviewed'}</button>)}
      </div>
      <QueryView query={q}>
        {() => !list.length ? <EmptyState icon={ClipboardCheck} title={tab === 'pending' ? 'No orders awaiting approval' : 'Nothing reviewed yet'} description="New submissions will appear here." /> : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <ul className="space-y-2" data-testid="approvals-list">
              {list.map((o) => (
                <li key={o.id}><button onClick={() => open(o.id)} className={cn('flex w-full items-center gap-3 rounded-lg border bg-card p-4 text-left transition hover:border-primary/40', sel === o.id && 'border-primary ring-1 ring-primary')}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-semibold">{o.number}</span><StatusBadge status={o.status} /></div>
                    <div className="mt-1 truncate text-sm font-medium">{o.customerName}</div>
                    <div className="text-xs text-muted-foreground">{o.lines.length} items · {o.lines.reduce((s, l) => s + l.quantity, 0)} units · {o.createdBy.name} · {fmtDate(o.date)}</div>
                  </div>
                  <div className="text-right"><div className="font-semibold tabular">{fmtMoney(o.total)}</div><div className="text-[11px] text-muted-foreground">{timeAgo(o.date)}</div></div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground lg:hidden" />
                </button></li>
              ))}
            </ul>
            <div className="hidden lg:block"><div className="sticky top-24">{selected ? <Card className="p-5"><Review order={selected} onDone={() => setSel(null)} /></Card> : <EmptyState title="Select an order to review" />}</div></div>
          </div>
        )}
      </QueryView>
      <Sheet open={sheet && !!selected} onOpenChange={setSheet}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-xl lg:hidden"><SheetHeader><SheetTitle className="text-left">Review order</SheetTitle></SheetHeader><div className="mt-3">{selected && <Review order={selected} onDone={() => setSheet(false)} />}</div></SheetContent>
      </Sheet>
    </div>
  );
}

export default function ApprovalsPage() { return <Suspense><ApprovalsInner /></Suspense>; }
