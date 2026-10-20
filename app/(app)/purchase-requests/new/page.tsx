'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronLeft, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { purchaseRequestService, supplierService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useSite } from '@/lib/sites/SiteProvider';
import { useErrorText, useT } from '@/lib/i18n';
import { fmtMoney, fmtNumber } from '@/lib/format';
import { PageHeader, LoadingState } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** Internal purchase request: choose a supplier and quantities (or fill from low stock). */
export default function NewPurchaseRequestPage() {
  const { t } = useT();
  const errorText = useErrorText();
  const user = useUser();
  const { site } = useSite();
  const router = useRouter();
  const sups = useQuery({ queryKey: ['suppliers'], queryFn: supplierService.list });
  const [supplierId, setSupplierId] = useState('');
  const cat = useQuery({ queryKey: ['supplier-catalog', supplierId], queryFn: () => supplierService.catalog(supplierId), enabled: !!supplierId });
  const [qty, setQty] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const items = Object.entries(qty).filter(([, n]) => n > 0).map(([productId, quantity]) => ({ productId, quantity }));
  const total = items.reduce((s, i) => s + (cat.data?.find((c) => c.product.id === i.productId)?.unitCost ?? 0) * i.quantity, 0);
  const fillLow = useMutation({
    mutationFn: () => purchaseRequestService.lowStock(supplierId),
    onSuccess: (list) => { if (!list.length) toast.info(t('purchaseRequests.noLow', { site: site ?? '' })); setQty((q) => ({ ...q, ...Object.fromEntries(list.map((l) => [l.productId, l.suggested])) })); },
  });
  const create = useMutation({
    mutationFn: () => purchaseRequestService.create({ supplierId, source: 'internal', items, notes, actor: { id: user.id, name: user.name, role: user.role } }),
    onSuccess: (r) => { toast.success(t('purchaseRequests.created', { number: r.number })); router.push(`/purchase-requests/${r.id}`); },
    onError: (e) => toast.error(errorText(e)),
  });

  return (
    <div>
      <Link href="/purchase-requests" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="me-1 h-4 w-4 rtl:rotate-180" aria-hidden="true" />{t('purchaseRequests.title')}</Link>
      <PageHeader title={t('purchaseRequests.newTitle')} description={site ? t('checkout.site', { site }) : undefined} />
      <Card className="mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label>{t('purchaseRequests.supplier')}</Label>
          <Select value={supplierId} onValueChange={(v) => { setSupplierId(v); setQty({}); }}>
            <SelectTrigger className="h-10" data-testid="pr-supplier"><SelectValue placeholder={t('purchaseRequests.chooseSupplier')} /></SelectTrigger>
            <SelectContent>{(sups.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.code}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button variant="outline" disabled={!supplierId || fillLow.isPending} onClick={() => fillLow.mutate()} data-testid="pr-fill-low"><Wand2 className="me-2 h-4 w-4" aria-hidden="true" />{t('purchaseRequests.fillLow')}</Button>
      </Card>
      {supplierId && (cat.isLoading ? <LoadingState /> : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
              <th className="px-4 py-2.5 text-start font-medium">{t('supplierCatalog.product')}</th><th className="px-3 py-2.5 text-end font-medium">{t('supplierCatalog.ourStock')}</th>
              <th className="px-3 py-2.5 text-end font-medium">{t('purchaseRequests.cost')}</th><th className="px-4 py-2.5 text-end font-medium">{t('requests.detail.qty')}</th>
            </tr></thead>
            <tbody className="divide-y">{(cat.data ?? []).map(({ product: p, unitCost, low }) => (
              <tr key={p.id} className={low ? 'bg-signal/5' : ''}>
                <td className="px-4 py-2.5"><div className="font-medium">{p.name}</div><div className="font-mono text-[11px] text-muted-foreground">{p.sku}</div></td>
                <td className="px-3 py-2.5 text-end tabular">{fmtNumber(p.stock)}</td>
                <td className="px-3 py-2.5 text-end tabular">{fmtMoney(unitCost, true)}</td>
                <td className="px-4 py-2.5 text-end"><Input type="number" min={0} className="ms-auto h-9 w-24 text-end" aria-label={p.name} data-testid={`pr-qty-${p.id}`} value={qty[p.id] ?? ''}
                  onChange={(e) => setQty((s) => ({ ...s, [p.id]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))} /></td>
              </tr>
            ))}</tbody>
          </table>
          <div className="space-y-3 border-t p-4">
            <div className="space-y-1.5"><Label htmlFor="n">{t('supplierCatalog.notes')}</Label><Textarea id="n" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">{t('requests.items', { count: items.length })} · <span className="font-semibold text-foreground tabular">{fmtMoney(total, true)}</span></span>
              <Button onClick={() => create.mutate()} disabled={!items.length || create.isPending} data-testid="pr-submit">{t('purchaseRequests.submit')}</Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
