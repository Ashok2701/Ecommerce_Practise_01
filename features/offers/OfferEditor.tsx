'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { offerService, productService } from '@/lib/services';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Offer } from '@/types/domain';

/** Create or edit an offer (rebuilt with BOGO and slab offers in the offer builder). */
export function OfferEditor({ value, onClose }: { value: Partial<Offer>; onClose: () => void }) {
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
