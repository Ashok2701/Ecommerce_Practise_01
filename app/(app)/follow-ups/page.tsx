'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Phone, MapPin, Wallet, FileText, CheckCircle2, RotateCcw, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { salesService, customerService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { fmtDate } from '@/lib/format';
import { PageHeader, QueryView, EmptyState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { FollowUp } from '@/types/domain';

const TYPE_ICON = { call: Phone, visit: MapPin, payment: Wallet, quote: FileText };

export default function FollowUpsPage() {
  const user = useUser();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'open' | 'done' | 'all'>('open');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Partial<FollowUp>>({ type: 'call', date: new Date().toISOString() });
  const q = useQuery({ queryKey: ['followups', user.id], queryFn: () => salesService.getFollowUps(user.id) });
  const customers = useQuery({ queryKey: ['customers', user.id], queryFn: () => customerService.getCustomers({ salesRepId: user.id }) });
  const save = useMutation({ mutationFn: (x: Partial<FollowUp>) => salesService.saveFollowUp({ ...x, salesRepId: user.id, customerId: x.customerId! }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['followups'] }); } });
  const name = (id: string) => customers.data?.find((c) => c.id === id)?.name ?? '…';
  const today = new Date(); today.setHours(23, 59, 59);
  const rows = (q.data ?? []).filter((x) => tab === 'all' || x.status === tab);
  return (
    <div>
      <PageHeader title="Follow-ups" description="Calls, visits, quotations and payment reminders for your customers." actions={<Button onClick={() => setOpen(true)} className="h-11 w-full sm:h-10 sm:w-auto" data-testid="new-followup"><Plus className="mr-2 h-4 w-4" />Add follow-up</Button>} />
      <div className="mb-4 flex gap-1.5" role="tablist">{(['open', 'done', 'all'] as const).map((k) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('rounded-md border px-3 py-1.5 text-xs font-medium capitalize', tab === k ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground')}>{k} <span className="opacity-70">{(q.data ?? []).filter((x) => k === 'all' || x.status === k).length}</span></button>)}</div>
      <QueryView query={q} isEmpty={() => !rows.length} empty={<EmptyState title="No follow-ups" description="You're all caught up." />}>
        {() => (
          <ul className="space-y-2" data-testid="followups-list">
            {rows.map((x) => { const I = TYPE_ICON[x.type]; const overdue = x.status === 'open' && new Date(x.date) < new Date(new Date().setHours(0, 0, 0, 0)); return (
              <li key={x.id}><Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', overdue ? 'bg-rose-50 text-rose-600' : 'bg-primary/10 text-primary')}><I className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><Link href={`/customers/${x.customerId}`} className="font-medium hover:underline">{name(x.customerId)}</Link><StatusBadge status={x.status} />{overdue && <span className="flex items-center gap-1 text-xs font-medium text-rose-600"><AlertCircle className="h-3 w-3" />Overdue</span>}</div>
                  <p className="text-sm text-muted-foreground">{x.notes}</p>
                  <p className="mt-0.5 text-xs capitalize text-muted-foreground">{x.type} · {fmtDate(x.date)}</p>
                </div>
                {x.status === 'open' ? <Button variant="outline" className="h-10" onClick={() => { save.mutate({ ...x, status: 'done' }); toast.success('Marked as done'); }} data-testid={`done-${x.id}`}><CheckCircle2 className="mr-2 h-4 w-4" />Mark done</Button>
                  : <Button variant="ghost" className="h-10" onClick={() => save.mutate({ ...x, status: 'open' })}><RotateCcw className="mr-2 h-4 w-4" />Reopen</Button>}
              </Card></li>
            ); })}
          </ul>
        )}
      </QueryView>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add follow-up</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!f.customerId) return toast.error('Select a customer'); save.mutate({ ...f, status: 'open' }, { onSuccess: () => { toast.success('Follow-up added'); setOpen(false); setF({ type: 'call', date: new Date().toISOString() }); } }); }}>
            <div className="space-y-1.5"><Label>Customer</Label><Select value={f.customerId} onValueChange={(v) => setF({ ...f, customerId: v })}><SelectTrigger data-testid="fu-customer"><SelectValue placeholder="Select customer" /></SelectTrigger><SelectContent>{customers.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Type</Label><Select value={f.type} onValueChange={(v: any) => setF({ ...f, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="call">Call</SelectItem><SelectItem value="visit">Visit</SelectItem><SelectItem value="quote">Quotation</SelectItem><SelectItem value="payment">Payment</SelectItem></SelectContent></Select></div>
              <div className="space-y-1.5"><Label htmlFor="fd">Date</Label><Input id="fd" type="date" value={(f.date ?? '').slice(0, 10)} onChange={(e) => setF({ ...f, date: new Date(e.target.value).toISOString() })} /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="fn">Notes</Label><Textarea id="fn" data-testid="fu-notes" rows={3} value={f.notes ?? ''} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" data-testid="fu-save">Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
