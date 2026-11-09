'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal, LayoutGrid, List, ShoppingCart, Building2, Plus, Tag, X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { productService, offerService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useCart, usePricedCart } from '@/lib/cart/CartProvider';
import { bestDiscount, customerUnitPrice, offersFor, stockStatus } from '@/lib/domain/pricing';
import { OfferBadge } from '@/features/offers/OfferBits';
import { useSite } from '@/lib/sites/SiteProvider';
import { useT } from '@/lib/i18n';
import { fmtMoney, fmtNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PageHeader, EmptyState, ErrorState, LoadingState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ProductImage, QtyStepper } from '@/components/common/ProductBits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { OrderContextBar } from '@/features/orders/OrderContextBar';
import type { Customer, Offer, Product } from '@/types/domain';

function AddControl({ p, compact }: { p: Product; compact?: boolean }) {
  const { t } = useT();
  const cart = useCart();
  const [qty, setQty] = useState(p.moq);
  const inCart = cart.items.find((i) => i.productId === p.id)?.quantity;
  const out = p.stock <= 0;
  const add = () => {
    if (qty < p.moq) return toast.error(t('catalog.minQty', { qty: p.moq, uom: p.uom }));
    cart.add(p.id, qty);
    toast.success(t('catalog.added', { qty, uom: p.uom, name: p.name }), { action: { label: t('catalog.viewCart'), onClick: () => (window.location.href = '/cart') } });
  };
  return (
    <div className={cn('flex items-center gap-2', compact ? '' : 'w-full')}>
      <QtyStepper value={qty} onChange={setQty} step={p.moq} min={p.moq} size="sm" label={t('quickOrder.qtyFor', { name: p.name })} />
      <Button size="sm" className={cn('h-8', !compact && 'flex-1')} onClick={add} disabled={out} data-testid={`add-to-cart-${p.sku}`}>
        {out ? t('catalog.backorder') : <><Plus className="me-1 h-3.5 w-3.5" aria-hidden="true" />{t('quickOrder.add')}</>}
      </Button>
      {inCart ? <span className="sr-only">{t('catalog.inCart', { count: inCart })}</span> : null}
    </div>
  );
}

function Price({ p, customer, offers }: { p: Product; customer?: Customer | null; offers: Offer[] }) {
  const { t } = useT();
  const { site } = useSite();
  const price = customerUnitPrice(p, customer);
  // price at the minimum order quantity with the best ERP offer that applies
  const net = price * (1 - (bestDiscount(p, p.moq, { customer, site }, offers)?.pct ?? 0) / 100);
  return (
    <div>
      <div className="flex items-baseline gap-2"><span className="text-lg font-semibold tabular" data-testid="customer-price">{fmtMoney(net, true)}</span><span className="text-xs text-muted-foreground">/ {p.uom}</span></div>
      {net < p.basePrice && <div className="text-xs text-muted-foreground"><span className="line-through">{fmtMoney(p.basePrice, true)}</span> <span className="font-medium text-emerald-700">{t('catalog.save', { pct: Math.round((1 - net / p.basePrice) * 100) })}</span>{customer?.contractPrices[p.id] ? <span className="ms-1 rounded bg-blue-50 px-1 text-[10px] font-semibold uppercase text-blue-700">{t('customers.detail.contract')}</span> : null}</div>}
    </div>
  );
}

function Filters({ categories, brands, category, setCategory, selBrands, setBrands, stock, setStock }: any) {
  const { t } = useT();
  return (
    <div className="space-y-6">
      <fieldset><legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('catalog.category')}</legend>
        <ul className="space-y-0.5">{['all', ...categories].map((c: string) => (
          <li key={c}><button onClick={() => setCategory(c)} className={cn('w-full rounded-md px-2.5 py-1.5 text-start text-sm', category === c ? 'bg-accent font-medium text-accent-foreground' : 'hover:bg-muted')} data-testid={`cat-${c}`}>{c === 'all' ? t('common.all') : c}</button></li>
        ))}</ul>
      </fieldset>
      <fieldset><legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('catalog.availability')}</legend>
        <div className="space-y-1">{['all', 'in_stock', 'low_stock', 'out_of_stock'].map((s) => (
          <label key={s} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-muted"><input type="radio" name="stock" className="accent-[hsl(var(--primary))]" checked={stock === s} onChange={() => setStock(s)} />{s === 'all' ? t('common.all') : t(`status.${s}`)}</label>
        ))}</div>
      </fieldset>
      <fieldset><legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('catalog.brand')}</legend>
        <div className="space-y-1">{brands.map((b: string) => (
          <label key={b} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-muted"><Checkbox checked={selBrands.includes(b)} onCheckedChange={(v) => setBrands(v ? [...selBrands, b] : selBrands.filter((x: string) => x !== b))} />{b}</label>
        ))}</div>
      </fieldset>
    </div>
  );
}

function CatalogInner() {
  const { t } = useT();
  const user = useUser();
  const router = useRouter();
  const sp = useSearchParams();
  const { customer, cart, totals } = usePricedCart();
  const [search, setSearch] = useState(sp.get('q') ?? '');
  const [debounced, setDebounced] = useState(search);
  const [category, setCategory] = useState(sp.get('category') ?? 'all');
  const [brands, setBrands] = useState<string[]>([]);
  const [stock, setStock] = useState('all');
  const [sort, setSort] = useState('relevance');
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => { const h = setTimeout(() => setDebounced(search), 250); return () => clearTimeout(h); }, [search]);
  useEffect(() => setPage(1), [debounced, category, brands, stock, sort]);
  const params = { search: debounced, category, brands, stock: stock as any, sort: sort as any, page, pageSize: 12 };
  const q = useQuery({ queryKey: ['products', params], queryFn: () => productService.getProducts(params), placeholderData: (p) => p });
  const offers = useQuery({ queryKey: ['offers', 'pricing'], queryFn: offerService.pricing, staleTime: 5 * 60_000 });
  const allProducts = useQuery({ queryKey: ['products', 'all'], queryFn: productService.getAll, staleTime: 5 * 60_000 });
  const { site } = useSite();
  // badge the first offer the portal shows for this customer (hidden offers still price, but get no badge)
  const badgeFor = (p: Product) => offersFor(p, { customer, site }, offers.data ?? []).find((o) => !o.presentation.hidden);
  const categories = useMemo(() => productService.getCategories(allProducts.data), [allProducts.data]);
  const allBrands = useMemo(() => productService.getBrands(allProducts.data), [allProducts.data]);
  const activeFilters = (category !== 'all' ? 1 : 0) + brands.length + (stock !== 'all' ? 1 : 0);

  if (user.role === 'SALES_REP' && !customer) {
    return (<div><OrderContextBar step="products" /><EmptyState icon={Building2} title={t('quickOrder.pickCustomerTitle')} description={t('catalog.pickCustomerText')} action={<Button asChild><Link href="/orders/new">{t('quickOrder.selectCustomer')}</Link></Button>} /></div>);
  }
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1;
  const filterProps = { categories, brands: allBrands, category, setCategory, selBrands: brands, setBrands, stock, setStock };

  return (
    <div>
      <OrderContextBar step="products" />
      <PageHeader title={t('catalog.title')} description={t('catalog.subtitle', { customer: customer?.name ?? '' })} actions={<Button variant="outline" asChild><Link href="/quick-order" data-testid="catalog-quick-order"><Zap className="me-2 h-4 w-4" aria-hidden="true" />{t('nav.quickOrder')}</Link></Button>} />
      <div className="flex gap-6">
        <aside className="hidden w-56 shrink-0 lg:block" aria-label={t('common.filters')}><div className="sticky top-24"><Filters {...filterProps} /></div></aside>
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-full sm:basis-auto">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label={t('catalog.searchLabel')} data-testid="catalog-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('catalog.searchPlaceholder')} className="h-10 bg-card ps-9" />
              {search && <button onClick={() => setSearch('')} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label={t('catalog.clearSearch')}><X className="h-4 w-4" /></button>}
            </div>
            <Button variant="outline" className="h-10 lg:hidden" onClick={() => setFiltersOpen(true)}><SlidersHorizontal className="me-2 h-4 w-4" />{t('common.filters')}{activeFilters ? ` (${activeFilters})` : ''}</Button>
            <Select value={sort} onValueChange={setSort}><SelectTrigger className="h-10 w-[170px] bg-card" aria-label={t('catalog.sort.label')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="relevance">{t('catalog.sort.relevance')}</SelectItem><SelectItem value="name">{t('catalog.sort.name')}</SelectItem><SelectItem value="price_asc">{t('catalog.sort.priceAsc')}</SelectItem><SelectItem value="price_desc">{t('catalog.sort.priceDesc')}</SelectItem></SelectContent></Select>
            <div className="hidden rounded-md border bg-card p-0.5 sm:flex" role="group" aria-label={t('catalog.view')}>
              <Button variant={view === 'grid' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setView('grid')} aria-label={t('catalog.gridView')} aria-pressed={view === 'grid'}><LayoutGrid className="h-4 w-4" /></Button>
              <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setView('list')} aria-label={t('catalog.listView')} aria-pressed={view === 'list'}><List className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none lg:hidden">{['all', ...categories].map((c) => <button key={c} onClick={() => setCategory(c)} className={cn('shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium', category === c ? 'border-primary bg-primary text-white' : 'bg-card')}>{c === 'all' ? t('common.all') : c}</button>)}</div>
          {q.data && <p className="mb-3 text-sm text-muted-foreground" data-testid="catalog-count">{t('catalog.count', { count: q.data.total, n: fmtNumber(q.data.total) })}</p>}

          {q.isLoading ? <LoadingState variant="cards" rows={6} /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !q.data?.items.length ? <EmptyState title={t('catalog.noMatch')} action={<Button variant="outline" onClick={() => { setSearch(''); setCategory('all'); setBrands([]); setStock('all'); }}>{t('catalog.clearFilters')}</Button>} /> : view === 'grid' ? (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="product-grid">
              {q.data.items.map((p) => { const off = badgeFor(p); return (
                <li key={p.id} className="flex flex-col overflow-hidden rounded-lg border bg-card">
                  <Link href={`/catalog/${p.id}`} className="relative block"><ProductImage src={p.image} alt={p.name} className="aspect-[16/10]" />{off && <OfferBadge offer={off} freeName={off.freeProductId ? allProducts.data?.find((x) => x.id === off.freeProductId)?.name : undefined} className="absolute start-2 top-2 bg-emerald-600 text-white ring-0 dark:bg-emerald-600 dark:text-white" />}</Link>
                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex items-center justify-between gap-2"><span className="font-mono text-[11px] text-muted-foreground">{p.sku}</span><StatusBadge status={stockStatus(p)} /></div>
                    <Link href={`/catalog/${p.id}`} className="mt-1 line-clamp-2 text-sm font-semibold hover:text-primary">{p.name}</Link>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                    <div className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground"><span>{p.brand}</span><span>{p.packSize}</span><span>{t('catalog.moq')} {p.moq} {p.uom}</span>{p.stock > 0 && <span>{t('catalog.avail', { qty: fmtNumber(p.stock) })}</span>}</div>
                    <div className="mt-auto pt-3"><Price p={p} customer={customer} offers={offers.data ?? []} /><div className="mt-3"><AddControl p={p} /></div></div>
                  </div>
                </li>
              ); })}
            </ul>
          ) : (
            <ul className="divide-y rounded-lg border bg-card" data-testid="product-list">
              {q.data.items.map((p) => (
                <li key={p.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 gap-3"><ProductImage src={p.image} alt={p.name} className="h-16 w-16 shrink-0 rounded-md" />
                    <div className="min-w-0"><Link href={`/catalog/${p.id}`} className="text-sm font-semibold hover:text-primary">{p.name}</Link><div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="font-mono">{p.sku}</span>·<span>{p.packSize}</span>·<span>{t('catalog.moq')} {p.moq}</span><StatusBadge status={stockStatus(p)} /></div></div></div>
                  <div className="w-40"><Price p={p} customer={customer} offers={offers.data ?? []} /></div>
                  <AddControl p={p} compact />
                </li>
              ))}
            </ul>
          )}
          {pages > 1 && (
            <nav className="mt-6 flex items-center justify-center gap-1" aria-label={t('catalog.pagination')}>
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('common.previous')}</Button>
              {Array.from({ length: pages }).map((_, i) => <Button key={i} variant={page === i + 1 ? 'default' : 'ghost'} size="sm" className="w-9" onClick={() => setPage(i + 1)} aria-current={page === i + 1 ? 'page' : undefined}>{i + 1}</Button>)}
              <Button variant="outline" size="sm" disabled={page === pages} onClick={() => setPage(page + 1)} data-testid="catalog-next">{t('common.next')}</Button>
            </nav>
          )}
        </div>
      </div>
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}><SheetContent side="left" className="w-80 overflow-y-auto"><SheetHeader><SheetTitle>{t('common.filters')}</SheetTitle></SheetHeader><div className="mt-4"><Filters {...filterProps} /></div><Button className="mt-6 w-full" onClick={() => setFiltersOpen(false)}>{t('catalog.showResults')}</Button></SheetContent></Sheet>
      {cart.count > 0 && (
        <div className="fixed inset-x-3 bottom-[76px] z-20 md:hidden">
          <Button className="h-12 w-full justify-between shadow-lg" onClick={() => router.push('/cart')} data-testid="sticky-cart"><span className="flex items-center gap-2"><ShoppingCart className="h-4 w-4" aria-hidden="true" />{t('catalog.items', { count: cart.count })}</span><span className="tabular">{fmtMoney(totals.total)} <span className="rtl:hidden">→</span><span className="ltr:hidden">←</span></span></Button>
        </div>
      )}
    </div>
  );
}

export default function CatalogPage() { return <Suspense><CatalogInner /></Suspense>; }
