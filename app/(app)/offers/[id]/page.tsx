'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, Copy, Pencil, Power, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { offerService, productService, customerService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { canManageContent } from '@/lib/auth/permissions';
import { useCart } from '@/lib/cart/CartProvider';
import { customerUnitPrice } from '@/lib/domain/pricing';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtMoney } from '@/lib/format';
import { QueryView, LoadingState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ProductImage } from '@/components/common/ProductBits';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackLink, Facts, RefLink } from '@/features/detail/DetailBits';
import { OfferEditor } from '@/features/offers/OfferEditor';
import { isCustomerRole, type Offer } from '@/types/domain';

/** One offer: terms, validity and the products it applies to, with the viewer's price after the offer. */
export default function OfferPage() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['offer', id], queryFn: () => offerService.get(id) });
  return (
    <div>
      <BackLink href="/offers" label={t('nav.offers')} />
      <QueryView query={q} loading={<LoadingState variant="detail" />}>{(o) => <Detail o={o} />}</QueryView>
    </div>
  );
}

function Detail({ o }: { o: Offer }) {
  const { t } = useT();
  const user = useUser();
  const cart = useCart();
  const qc = useQueryClient();
  const manage = canManageContent(user.role);
  const customer = isCustomerRole(user.role);
  const [edit, setEdit] = useState(false);
  const products = useQuery({ queryKey: ['products', 'all'], queryFn: productService.getAll });
  const cust = useQuery({ queryKey: ['customer', user.customerId], queryFn: () => customerService.getCustomer(user.customerId!), enabled: !!user.customerId });
  const toggle = useMutation({ mutationFn: () => offerService.setStatus(o.id, o.status === 'active' ? 'expired' : 'active'), onSuccess: (x) => { qc.invalidateQueries(); toast.success(x.status === 'active' ? t('offers.activated') : t('offers.deactivated')); } });
  const ps = (products.data ?? []).filter((p) => o.productIds.includes(p.id));
  const eligible = !customer || o.audience === 'all' || (cust.data && o.audience === `tier_${cust.data.priceTier}`);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><span className="text-3xl font-semibold text-emerald-700 dark:text-emerald-400">{t('offers.percentOff', { pct: o.discountPct })}</span>{manage && <StatusBadge status={o.status} />}</div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight" data-testid="offer-title-detail">{o.title}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{o.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { navigator.clipboard?.writeText(o.code); toast.success(t('offers.codeCopied')); }}><Copy className="me-2 h-4 w-4" aria-hidden="true" /><span className="font-mono">{o.code}</span></Button>
            {manage && <>
              <Button variant="outline" onClick={() => setEdit(true)}><Pencil className="me-2 h-4 w-4" aria-hidden="true" />{t('common.edit')}</Button>
              <Button variant="outline" onClick={() => toggle.mutate()} data-testid="offer-toggle"><Power className="me-2 h-4 w-4" aria-hidden="true" />{o.status === 'active' ? t('offers.deactivate') : t('offers.activate')}</Button>
            </>}
          </div>
        </div>
        <Facts className="mt-5 border-t pt-4" cols={3} items={[
          [t('offers.validity'), <span className="inline-flex items-center gap-1.5"><CalendarRange className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{fmtDate(o.validFrom)} – {fmtDate(o.validTo)}</span>],
          [t('offers.audience'), t(`offers.audiences.${o.audience}`)],
          [t('offers.howItWorks'), t('offers.appliedAutomatically')],
        ]} />
        {customer && !eligible && <p className="mt-3 rounded-md bg-muted/60 p-3 text-sm">{t('offers.notForYou')}</p>}
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm" data-testid="offer-products">
          <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
            <th className="px-4 py-2.5 text-start font-medium">{t('inventory.col.product')}</th>
            <th className="px-3 py-2.5 text-end font-medium">{customer ? t('offers.yourPrice') : t('offers.listPrice')}</th>
            <th className="px-3 py-2.5 text-end font-medium">{t('offers.withOffer')}</th>
            {(customer || user.role === 'SALES_REP') && <th className="px-4 py-2.5" />}
          </tr></thead>
          <tbody className="divide-y">{ps.map((p) => {
            const base = customer && cust.data ? customerUnitPrice(p, cust.data) : p.basePrice;
            return (
              <tr key={p.id}>
                <td className="px-4 py-2.5"><div className="flex items-center gap-3"><ProductImage src={p.image} alt="" className="h-10 w-10 shrink-0 rounded" /><div className="min-w-0"><RefLink href={customer || user.role === 'SALES_REP' ? `/catalog/${p.id}` : `/inventory/${p.id}`} className="font-medium">{p.name}</RefLink><div className="font-mono text-[11px] text-muted-foreground">{p.sku} · {p.uom}</div></div></div></td>
                <td className="px-3 py-2.5 text-end tabular text-muted-foreground">{fmtMoney(base, true)}</td>
                <td className="px-3 py-2.5 text-end font-semibold tabular text-emerald-700 dark:text-emerald-400">{fmtMoney(Math.round(base * (1 - o.discountPct / 100) * 100) / 100, true)}</td>
                {(customer || user.role === 'SALES_REP') && <td className="px-4 py-2.5 text-end">
                  <Button size="sm" variant="outline" disabled={o.status !== 'active' || !eligible} onClick={() => { cart.add(p.id, p.moq); toast.success(t('offers.added', { name: p.name })); }} data-testid={`offer-add-${p.id}`}><ShoppingCart className="me-1.5 h-3.5 w-3.5" aria-hidden="true" />{t('common.addToCart')}</Button>
                </td>}
              </tr>
            );
          })}</tbody>
        </table>
      </Card>
      {edit && <OfferEditor value={o} onClose={() => setEdit(false)} />}
    </div>
  );
}
