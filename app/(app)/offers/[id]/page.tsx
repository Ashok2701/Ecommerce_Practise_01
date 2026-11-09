'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange, Copy, EyeOff, Lock, Pencil, ShoppingCart, Star } from 'lucide-react';
import { toast } from 'sonner';
import { offerService, productService, customerService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { canManageContent } from '@/lib/auth/permissions';
import { useCart } from '@/lib/cart/CartProvider';
import { useSettings } from '@/lib/settings';
import { useSite } from '@/lib/sites/SiteProvider';
import { customerUnitPrice, offerAppliesTo, offerCovers } from '@/lib/domain/pricing';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtMoney, fmtNumber } from '@/lib/format';
import { QueryView, LoadingState, SectionCard } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ProductImage } from '@/components/common/ProductBits';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackLink, Facts, RefLink } from '@/features/detail/DetailBits';
import { OfferBadge, offerRule, offerText, offerTitle } from '@/features/offers/OfferBits';
import { PresentationEditor } from '@/features/offers/PresentationEditor';
import { isCustomerRole, type Offer } from '@/types/domain';

/** One ERP offer: its terms (read-only, from the ERP), how the portal shows it, and the products with the viewer's price. */
export default function OfferPage() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const user = useUser();
  const q = useQuery({
    queryKey: ['offer', id],
    queryFn: async () => {
      const o = await offerService.get(id);
      // customers only open offers shown to them
      if (isCustomerRole(user.role) && o.presentation.hidden) throw new Error('errors.notFound');
      return o;
    },
  });
  return (
    <div>
      <BackLink href="/offers" label={t('nav.offers')} />
      <QueryView query={q} loading={<LoadingState variant="detail" />}>{(o) => <Detail o={o} />}</QueryView>
    </div>
  );
}

function Detail({ o }: { o: Offer }) {
  const { t, locale } = useT();
  const settings = useSettings();
  const user = useUser();
  const cart = useCart();
  const { site } = useSite();
  const manage = canManageContent(user.role);
  const customer = isCustomerRole(user.role);
  const canBuy = customer || user.role === 'SALES_REP';
  const [edit, setEdit] = useState(false);
  const products = useQuery({ queryKey: ['products', 'all'], queryFn: productService.getAll, staleTime: 5 * 60_000 });
  const cust = useQuery({ queryKey: ['customer', user.customerId], queryFn: () => customerService.getCustomer(user.customerId!), enabled: !!user.customerId });
  const custNames = useQuery({ queryKey: ['customers', 'names'], queryFn: () => customerService.getCustomers({}), enabled: !customer && o.audience === 'customers' });
  const ps = (products.data ?? []).filter((p) => offerCovers(o, p));
  const freeProduct = o.freeProductId ? products.data?.find((p) => p.id === o.freeProductId) : undefined;
  const eligible = !customer || (!!cust.data && offerAppliesTo(o, { customer: cust.data, site }));
  const tiers = [...(o.tiers ?? [])].sort((a, b) => a.minQty - b.minQty);
  const firstQty = (moq: number) => o.kind === 'tier' ? Math.max(moq, tiers[0]?.minQty ?? moq) : o.kind === 'free_goods' ? Math.max(moq, o.buyQty ?? moq) : moq;
  const audience = o.audience === 'customers'
    ? (o.customerIds ?? []).map((cid) => custNames.data?.find((c) => c.id === cid)?.name ?? cid).join(', ')
    : t(`offers.audiences.${o.audience}`);

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        {o.presentation.image && <div className="h-40 bg-muted bg-cover bg-center sm:h-52" style={{ backgroundImage: `url(${o.presentation.image})` }} aria-hidden="true" />}
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <OfferBadge offer={o} freeName={freeProduct?.name} className="text-xs" />
              {!customer && <StatusBadge status={o.status} />}
              {!customer && o.presentation.featured && <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400"><Star className="h-3.5 w-3.5" aria-hidden="true" />{t('offers.featured')}</span>}
              {!customer && o.presentation.hidden && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><EyeOff className="h-3.5 w-3.5" aria-hidden="true" />{t('offers.hiddenTag')}</span>}
            </div>
            <h1 className="mt-2 text-xl font-semibold tracking-tight" data-testid="offer-title-detail">{offerTitle(o, locale)}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{offerText(o, locale)}</p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm"><CalendarRange className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{fmtDate(o.validFrom)} – {fmtDate(o.validTo)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { navigator.clipboard?.writeText(o.code); toast.success(t('offers.codeCopied')); }}><Copy className="me-2 h-4 w-4" aria-hidden="true" /><span className="font-mono">{o.code}</span></Button>
            {manage && <Button variant="outline" onClick={() => setEdit(true)} data-testid="offer-edit-presentation"><Pencil className="me-2 h-4 w-4" aria-hidden="true" />{t('offers.presentation.edit')}</Button>}
          </div>
        </div>
        {customer && !eligible && <p className="mx-5 mb-5 rounded-md bg-muted/60 p-3 text-sm">{t('offers.notForYou')}</p>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px] [&>*]:min-w-0">
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm" data-testid="offer-products">
            <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
              <th className="px-4 py-2.5 text-start font-medium">{t('inventory.col.product')}</th>
              <th className="px-3 py-2.5 text-end font-medium">{customer ? t('offers.yourPrice') : t('offers.listPrice')}</th>
              <th className="px-3 py-2.5 text-end font-medium">{t('offers.withOffer')}</th>
              {canBuy && <th className="px-4 py-2.5" />}
            </tr></thead>
            <tbody className="divide-y">{ps.map((p) => {
              const base = customer && cust.data ? customerUnitPrice(p, cust.data) : p.basePrice;
              const pct = o.kind === 'percent' ? o.discountPct ?? 0 : o.kind === 'tier' ? tiers[0]?.discountPct ?? 0 : 0;
              const qty = firstQty(p.moq);
              return (
                <tr key={p.id}>
                  <td className="px-4 py-2.5"><div className="flex items-center gap-3"><ProductImage src={p.image} alt="" className="h-10 w-10 shrink-0 rounded" /><div className="min-w-0"><RefLink href={canBuy ? `/catalog/${p.id}` : `/inventory/${p.id}`} className="font-medium">{p.name}</RefLink><div className="font-mono text-[11px] text-muted-foreground">{p.sku} · {p.uom}</div></div></div></td>
                  <td className="px-3 py-2.5 text-end tabular text-muted-foreground">{fmtMoney(base, true)}</td>
                  <td className="px-3 py-2.5 text-end tabular">
                    {o.kind === 'free_goods'
                      ? <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{offerRule(o, t, freeProduct?.name)}</span>
                      : <><span className="font-semibold text-emerald-700 dark:text-emerald-400">{fmtMoney(Math.round(base * (1 - pct / 100) * 100) / 100, true)}</span>{o.kind === 'tier' && <div className="text-[11px] text-muted-foreground">{t('offers.fromQty', { qty: tiers[0]?.minQty ?? 0 })}</div>}</>}
                  </td>
                  {canBuy && <td className="px-4 py-2.5 text-end">
                    <Button size="sm" variant="outline" disabled={o.status !== 'active' || !eligible} onClick={() => { cart.add(p.id, qty); toast.success(t('offers.addedQty', { name: p.name, qty: fmtNumber(qty), uom: p.uom })); }} data-testid={`offer-add-${p.id}`}><ShoppingCart className="me-1.5 h-3.5 w-3.5" aria-hidden="true" />{t('offers.addQty', { qty: fmtNumber(qty) })}</Button>
                  </td>}
                </tr>
              );
            })}</tbody>
          </table>
        </Card>
        <div className="space-y-4">
          <SectionCard title={<span className="flex items-center gap-2"><Lock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{t('offers.terms', { erp: settings.erpName })}</span>} bodyClassName="space-y-4 p-4" >
            <Facts cols={1} items={[
              [t('offers.type'), t(`offers.kind.${o.kind}`)],
              [t('offers.rule.label'), o.kind === 'tier' ? undefined : offerRule(o, t, freeProduct?.name)],
              [t('offers.audience'), audience],
              [t('offers.sites'), o.sites?.length ? o.sites.join(', ') : t('offers.allSites')],
              [t('offers.appliesTo'), o.categories?.length ? o.categories.join(', ') : t('offers.productsCount', { count: o.productIds.length })],
              [t('offers.erpRef'), o.erpRef ? <span className="font-mono text-xs">{o.erpRef}</span> : undefined],
            ]} />
            {o.kind === 'tier' && (
              <table className="w-full text-sm" data-testid="offer-tiers">
                <thead className="text-xs text-muted-foreground"><tr><th className="py-1 text-start font-medium">{t('offers.tierQty')}</th><th className="py-1 text-end font-medium">{t('common.discount')}</th></tr></thead>
                <tbody className="divide-y">{tiers.map((tr) => <tr key={tr.minQty}><td className="py-1.5 tabular">{t('offers.qtyOrMore', { qty: fmtNumber(tr.minQty) })}</td><td className="py-1.5 text-end font-semibold tabular text-emerald-700 dark:text-emerald-400">−{tr.discountPct}%</td></tr>)}</tbody>
              </table>
            )}
            <p className="text-xs text-muted-foreground">{t('offers.termsHint', { erp: settings.erpName })}</p>
          </SectionCard>
          {manage && o.presentation.updatedBy && <p className="text-xs text-muted-foreground">{t('offers.presentation.lastEdit', { name: o.presentation.updatedBy, date: fmtDate(o.presentation.updatedAt) })}</p>}
        </div>
      </div>
      {edit && <PresentationEditor offer={o} open={edit} onOpenChange={setEdit} />}
      {products.isLoading && <LoadingState rows={2} />}
    </div>
  );
}
