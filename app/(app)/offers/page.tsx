'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, BadgePercent, Pencil, Power, CalendarRange, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { offerService, productService, customerService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { canManageContent } from '@/lib/auth/permissions';
import { fmtDate } from '@/lib/format';
import { PageHeader, QueryView, EmptyState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ProductImage } from '@/components/common/ProductBits';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Offer } from '@/types/domain';

function Editor({ value, onClose }: { value: Partial<Offer>; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<Partial<Offer>>(value);
  const products = useQuery({ queryKey: ['products', 'all'], queryFn: productService.getAll });
  const m = useMutation({ mutationFn: () => offerService.save({ ...f, title: f.title! }), onSuccess: () => { qc.invalidateQueries(); toast.success(f.id ? 'Offer updated' : 'Offer created'); onClose(); } });
  const set = (k: keyof Offer, v: any) => setF((s) => ({ ...s, [k]: v }));
  const ids = f.productIds ?? [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{f.id ? 'Edit offer' : 'New offer'}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!f.title?.trim()) return toast.error('Title is required'); if (!ids.length) return toast.error('Select at least one product'); m.mutate(); }}>
          <div className="space-y-1.5"><Label htmlFor="o-title">Title</Label><Input id="o-title" data-testid="offer-title" value={f.title ?? ''} onChange={(e) => set('title', e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="o-desc">Description</Label><Textarea id="o-desc" rows={2} value={f.description ?? ''} onChange={(e) => set('description', e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="o-disc">Discount %</Label><Input id="o-disc" data-testid="offer-discount" type="number" min={1} max={50} value={f.discountPct ?? 5} onChange={(e) => set('discountPct', Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label>Audience</Label><Select value={f.audience ?? 'all'} onValueChange={(v) => set('audience', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All customers</SelectItem><SelectItem value="tier_A">Tier A</SelectItem><SelectItem value="tier_B">Tier B</SelectItem><SelectItem value="tier_C">Tier C</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label htmlFor="o-from">Valid from</Label><Input id="o-from" type="date" value={(f.validFrom ?? new Date().toISOString()).slice(0, 10)} onChange={(e) => set('validFrom', new Date(e.target.value).toISOString())} /></div>
            <div className="space-y-1.5"><Label htmlFor="o-to">Valid to</Label><Input id="o-to" type="date" value={(f.validTo ?? new Date(Date.now() + 14 * 864e5).toISOString()).slice(0, 10)} onChange={(e) => set('validTo', new Date(e.target.value).toISOString())} /></div>
          </div>
          <div className="space-y-1.5"><Label>Status</Label><Select value={f.status ?? 'draft'} onValueChange={(v) => set('status', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="scheduled">Scheduled</SelectItem><SelectItem value="active">Active now</SelectItem></SelectContent></Select></div>
          <fieldset><legend className="mb-2 text-sm font-medium">Products ({ids.length} selected)</legend>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">{(products.data ?? []).map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted"><Checkbox checked={ids.includes(p.id)} onCheckedChange={(v) => set('productIds', v ? [...ids, p.id] : ids.filter((x) => x !== p.id))} /><span className="truncate">{p.name}</span><span className="ml-auto font-mono text-[10px] text-muted-foreground">{p.sku}</span></label>
            ))}</div>
          </fieldset>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={m.isPending} data-testid="offer-save">Save offer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function OffersPage() {
  const user = useUser();
  const qc = useQueryClient();
  const manage = canManageContent(user.role);
  const [edit, setEdit] = useState<Partial<Offer> | null>(null);
  const cust = useQuery({ queryKey: ['customer', user.customerId], queryFn: () => customerService.getCustomer(user.customerId!), enabled: !!user.customerId });
  const q = useQuery({ queryKey: ['offers', manage ? 'manage' : user.role, cust.data?.priceTier], queryFn: () => offerService.list(manage || user.role === 'sales' ? { manage: true } : { tier: cust.data?.priceTier }), enabled: !user.customerId || !!cust.data });
  const products = useQuery({ queryKey: ['products', 'all'], queryFn: productService.getAll });
  const toggle = useMutation({ mutationFn: (o: Offer) => offerService.setStatus(o.id, o.status === 'active' ? 'expired' : 'active'), onSuccess: (o) => { qc.invalidateQueries(); toast.success(o.status === 'active' ? 'Offer activated' : 'Offer deactivated'); } });
  const rows = (q.data ?? []).filter((o) => manage || o.status === 'active');
  return (
    <div>
      <PageHeader title="Offers & promotions" description={manage ? 'Product discounts applied automatically at cart for eligible customers.' : 'Active discounts applied automatically in your cart.'} actions={manage ? <Button onClick={() => setEdit({ status: 'draft', audience: 'all', discountPct: 5, productIds: [] })} data-testid="new-offer"><Plus className="mr-2 h-4 w-4" />New offer</Button> : undefined} />
      <QueryView query={q} isEmpty={() => !rows.length} empty={<EmptyState icon={BadgePercent} title="No active offers" description="Check back soon for new promotions." />}>
        {() => (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="offers-list">
            {rows.map((o) => { const ps = (products.data ?? []).filter((p) => o.productIds.includes(p.id)); return (
              <li key={o.id}><Card className="flex h-full flex-col overflow-hidden">
                <div className="flex items-start justify-between gap-3 border-b p-4">
                  <div className="min-w-0"><div className="flex items-center gap-2"><span className="text-2xl font-semibold text-emerald-700">{o.discountPct}%</span><span className="text-xs text-muted-foreground">off</span>{manage && <StatusBadge status={o.status} />}</div><h2 className="mt-1 font-semibold">{o.title}</h2></div>
                  <button className="flex items-center gap-1 rounded border border-dashed px-2 py-1 font-mono text-[11px]" onClick={() => { navigator.clipboard?.writeText(o.code); toast.success('Code copied'); }} aria-label={`Copy code ${o.code}`}>{o.code}<Copy className="h-3 w-3" /></button>
                </div>
                <div className="flex-1 p-4">
                  <p className="text-sm text-muted-foreground">{o.description}</p>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarRange className="h-3.5 w-3.5" />{fmtDate(o.validFrom)} – {fmtDate(o.validTo)} · {o.audience === 'all' ? 'All customers' : o.audience.replace('_', ' ')}</p>
                  <ul className="mt-3 space-y-2">{ps.slice(0, 3).map((p) => <li key={p.id}><Link href={manage ? '#' : `/catalog/${p.id}`} className="flex items-center gap-2 text-sm hover:text-primary"><ProductImage src={p.image} alt="" className="h-8 w-8 shrink-0 rounded" /><span className="truncate">{p.name}</span></Link></li>)}{ps.length > 3 && <li className="text-xs text-muted-foreground">+{ps.length - 3} more</li>}</ul>
                </div>
                {manage && <div className="flex gap-2 border-t p-3"><Button size="sm" variant="outline" onClick={() => setEdit(o)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button><Button size="sm" variant="outline" onClick={() => toggle.mutate(o)} data-testid={`toggle-offer-${o.id}`}><Power className="mr-1 h-3.5 w-3.5" />{o.status === 'active' ? 'Deactivate' : 'Activate'}</Button></div>}
                {!manage && user.role === 'customer' && <div className="border-t p-3"><Button size="sm" className="w-full" asChild><Link href={`/catalog/${o.productIds[0]}`}>Shop this offer</Link></Button></div>}
              </Card></li>
            ); })}
          </ul>
        )}
      </QueryView>
      {edit && <Editor value={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
