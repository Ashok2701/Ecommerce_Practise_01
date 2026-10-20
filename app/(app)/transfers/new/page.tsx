'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, ChevronLeft, Search } from 'lucide-react';
import { toast } from 'sonner';
import { productService, transferService, inventoryService, siteService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useSite } from '@/lib/sites/SiteProvider';
import { useErrorText, useT } from '@/lib/i18n';
import { fmtNumber } from '@/lib/format';
import { PageHeader, LoadingState } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** Request stock from another site. Approval, shipping and receipt happen on the transfer. */
function NewTransfer() {
  const { t } = useT();
  const errorText = useErrorText();
  const user = useUser();
  const router = useRouter();
  const { site } = useSite();
  // transfers can come from any site of the company, not only the user's own
  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: siteService.list, staleTime: 10 * 60_000 });
  const sites = sitesQ.data ?? [];
  const pre = useSearchParams().get('product');
  const [toSite, setToSite] = useState(site ?? '');
  const [fromSite, setFromSite] = useState('');
  const [qty, setQty] = useState<Record<string, number>>(pre ? { [pre]: 1 } : {});
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const products = useQuery({ queryKey: ['products', 'all'], queryFn: () => productService.getAll() });
  const siteCodes = useMemo(() => sites.map((s) => s.code), [sites]);
  useEffect(() => { if (!fromSite) setFromSite(siteCodes.find((c) => c !== toSite) ?? ''); }, [siteCodes, toSite, fromSite]);
  const avail = useQuery({
    queryKey: ['availability', fromSite, toSite],
    enabled: !!fromSite && !!toSite,
    queryFn: async () => {
      const m = await inventoryService.availability([fromSite, toSite]);
      return Object.fromEntries(Object.entries(m).map(([id, v]) => [id, { from: v[fromSite] ?? 0, to: v[toSite] ?? 0 }]));
    },
  });
  const s = search.trim().toLowerCase();
  const list = (products.data ?? []).filter((p) => !s || [p.name, p.sku].some((v) => v.toLowerCase().includes(s)))
    .sort((a, b) => Number((qty[b.id] ?? 0) > 0) - Number((qty[a.id] ?? 0) > 0));
  const items = Object.entries(qty).filter(([, n]) => n > 0).map(([productId, quantity]) => ({ productId, quantity }));
  const over = items.some((i) => (avail.data?.[i.productId]?.from ?? Infinity) < i.quantity);
  const create = useMutation({
    mutationFn: () => transferService.create({ fromSite, toSite, items, reason, neededBy: neededBy ? new Date(neededBy).toISOString() : undefined, actor: { id: user.id, name: user.name, role: user.role } }),
    onSuccess: (x) => { toast.success(t('transfers.created', { number: x.number })); router.push(`/transfers/${x.id}`); },
    onError: (e) => toast.error(errorText(e)),
  });

  return (
    <div className="pb-6">
      <Link href="/transfers" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="me-1 h-4 w-4 rtl:rotate-180" aria-hidden="true" />{t('transfers.title')}</Link>
      <PageHeader title={t('transfers.newTitle')} description={t('transfers.newIntro')} />
      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
        <div className="space-y-1.5"><Label>{t('transfers.from')}</Label>
          <Select value={fromSite} onValueChange={setFromSite}><SelectTrigger className="h-10" data-testid="tr-from"><SelectValue placeholder={t('transfers.chooseSite')} /></SelectTrigger>
            <SelectContent>{sites.filter((x) => x.code !== toSite).map((x) => <SelectItem key={x.code} value={x.code}>{x.code} · {x.name}</SelectItem>)}</SelectContent></Select></div>
        <ArrowRight className="mx-auto mb-3 hidden h-4 w-4 text-muted-foreground sm:block rtl:rotate-180" aria-hidden="true" />
        <div className="space-y-1.5"><Label>{t('transfers.to')}</Label>
          <Select value={toSite} onValueChange={(v) => { setToSite(v); if (v === fromSite) setFromSite(''); }}><SelectTrigger className="h-10" data-testid="tr-to"><SelectValue /></SelectTrigger>
            <SelectContent>{sites.map((x) => <SelectItem key={x.code} value={x.code}>{x.code} · {x.name}</SelectItem>)}</SelectContent></Select></div>
      </Card>

      <Card className="overflow-hidden">
        <div className="relative border-b p-3">
          <Search className="pointer-events-none absolute start-6 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('inventory.search')} aria-label={t('inventory.search')} className="h-9 ps-9" />
        </div>
        {products.isLoading ? <LoadingState /> : (
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-xs text-muted-foreground"><tr>
                <th className="px-4 py-2 text-start font-medium">{t('inventory.col.product')}</th>
                <th className="px-3 py-2 text-end font-medium">{t('transfers.availableAt', { site: fromSite || '—' })}</th>
                <th className="px-3 py-2 text-end font-medium">{t('transfers.availableAt', { site: toSite || '—' })}</th>
                <th className="px-4 py-2 text-end font-medium">{t('requests.detail.qty')}</th>
              </tr></thead>
              <tbody className="divide-y">{list.map((p) => {
                const a = avail.data?.[p.id]; const n = qty[p.id] ?? 0; const short = !!a && n > a.from;
                return (
                  <tr key={p.id}>
                    <td className="px-4 py-2"><div className="font-medium">{p.name}</div><div className="font-mono text-[11px] text-muted-foreground">{p.sku}</div></td>
                    <td className="px-3 py-2 text-end tabular">{a ? fmtNumber(a.from) : '…'}</td>
                    <td className="px-3 py-2 text-end tabular text-muted-foreground">{a ? fmtNumber(a.to) : '…'}</td>
                    <td className="px-4 py-2 text-end">
                      <Input type="number" min={0} inputMode="numeric" aria-label={p.name} aria-invalid={short} data-testid={`tr-qty-${p.id}`} value={qty[p.id] ?? ''}
                        className={`ms-auto h-9 w-24 text-end ${short ? 'border-destructive' : ''}`} onChange={(e) => setQty((x) => ({ ...x, [p.id]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))} />
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
        <div className="grid gap-3 border-t p-4 sm:grid-cols-[1fr_200px]">
          <div className="space-y-1.5"><Label htmlFor="rs">{t('transfers.reason')}</Label><Textarea id="rs" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('transfers.reasonPlaceholder')} data-testid="tr-reason" /></div>
          <div className="space-y-1.5"><Label htmlFor="nb">{t('transfers.neededBy')}</Label><Input id="nb" type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} /></div>
          {over && <p className="text-sm text-amber-700 dark:text-amber-400 sm:col-span-2" role="status">{t('transfers.overWarning', { site: fromSite })}</p>}
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <span className="text-sm text-muted-foreground">{t('requests.items', { count: items.length })}</span>
            <Button onClick={() => create.mutate()} disabled={!items.length || !fromSite || !toSite || !reason.trim() || create.isPending} data-testid="tr-submit">{t('transfers.submit')}</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default function NewTransferPage() { return <Suspense><NewTransfer /></Suspense>; }
