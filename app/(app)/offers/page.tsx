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
import { isCustomerRole } from '@/types/domain';
import { OfferEditor } from '@/features/offers/OfferEditor';
import type { Offer } from '@/types/domain';

export default function OffersPage() {
  const user = useUser();
  const qc = useQueryClient();
  const manage = canManageContent(user.role);
  const [edit, setEdit] = useState<Partial<Offer> | null>(null);
  const cust = useQuery({ queryKey: ['customer', user.customerId], queryFn: () => customerService.getCustomer(user.customerId!), enabled: !!user.customerId });
  const q = useQuery({ queryKey: ['offers', manage ? 'manage' : user.role, cust.data?.priceTier], queryFn: () => offerService.list(manage || user.role === 'SALES_REP' ? { manage: true } : { tier: cust.data?.priceTier }), enabled: !user.customerId || !!cust.data });
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
                  <div className="min-w-0"><div className="flex items-center gap-2"><span className="text-2xl font-semibold text-emerald-700">{o.discountPct}%</span><span className="text-xs text-muted-foreground">off</span>{manage && <StatusBadge status={o.status} />}</div><h2 className="mt-1 font-semibold"><Link href={`/offers/${o.id}`} className="hover:text-primary" data-testid={`offer-link-${o.id}`}>{o.title}</Link></h2></div>
                  <button className="flex items-center gap-1 rounded border border-dashed px-2 py-1 font-mono text-[11px]" onClick={() => { navigator.clipboard?.writeText(o.code); toast.success('Code copied'); }} aria-label={`Copy code ${o.code}`}>{o.code}<Copy className="h-3 w-3" /></button>
                </div>
                <div className="flex-1 p-4">
                  <p className="text-sm text-muted-foreground">{o.description}</p>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarRange className="h-3.5 w-3.5" />{fmtDate(o.validFrom)} – {fmtDate(o.validTo)} · {o.audience === 'all' ? 'All customers' : o.audience.replace('_', ' ')}</p>
                  <ul className="mt-3 space-y-2">{ps.slice(0, 3).map((p) => <li key={p.id}><Link href={manage ? '#' : `/catalog/${p.id}`} className="flex items-center gap-2 text-sm hover:text-primary"><ProductImage src={p.image} alt="" className="h-8 w-8 shrink-0 rounded" /><span className="truncate">{p.name}</span></Link></li>)}{ps.length > 3 && <li className="text-xs text-muted-foreground">+{ps.length - 3} more</li>}</ul>
                </div>
                {manage && <div className="flex gap-2 border-t p-3"><Button size="sm" variant="outline" onClick={() => setEdit(o)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button><Button size="sm" variant="outline" onClick={() => toggle.mutate(o)} data-testid={`toggle-offer-${o.id}`}><Power className="mr-1 h-3.5 w-3.5" />{o.status === 'active' ? 'Deactivate' : 'Activate'}</Button></div>}
                {!manage && isCustomerRole(user.role) && <div className="border-t p-3"><Button size="sm" className="w-full" asChild><Link href={`/catalog/${o.productIds[0]}`}>Shop this offer</Link></Button></div>}
              </Card></li>
            ); })}
          </ul>
        )}
      </QueryView>
      {edit && <OfferEditor value={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
