'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, PackageSearch, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { purchaseRequestService, supplierService, expectedDefault } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useSite } from '@/lib/sites/SiteProvider';
import { useErrorText, useT } from '@/lib/i18n';
import { fmtMoney, fmtNumber } from '@/lib/format';
import { PageHeader, QueryView, EmptyState } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** Supplier: products they deliver, our stock per site, and a pickup offer. */
export default function SupplierCatalogPage() {
  const { t } = useT();
  const errorText = useErrorText();
  const user = useUser();
  const { site } = useSite();
  const qc = useQueryClient();
  const supplierId = user.supplierId ?? '';
  const q = useQuery({ queryKey: ['supplier-catalog', supplierId], queryFn: () => supplierService.catalog(supplierId), enabled: !!supplierId });
  const [qty, setQty] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(expectedDefault());
  const [notes, setNotes] = useState('');
  const items = Object.entries(qty).filter(([, n]) => n > 0).map(([productId, quantity]) => ({ productId, quantity }));
  const send = useMutation({
    mutationFn: () => purchaseRequestService.create({ supplierId, source: 'pickup', items, proposedDate: new Date(date).toISOString(), notes, actor: { id: user.id, name: user.name, role: user.role } }),
    onSuccess: (r) => { qc.invalidateQueries(); setQty({}); setNotes(''); setOpen(false); toast.success(t('supplierCatalog.sent', { number: r.number }), { action: { label: r.number, onClick: () => location.assign(`/purchase-requests/${r.id}`) } }); },
    onError: (e) => toast.error(errorText(e)),
  });

  return (
    <div className="pb-24">
      <PageHeader title={t('supplierCatalog.title')} description={t('supplierCatalog.intro', { site: site ?? '' })} />
      <QueryView query={q}>
        {(rows) => rows.length ? (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm" data-testid="supplier-catalog">
              <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
                <th className="px-4 py-2.5 text-start font-medium">{t('supplierCatalog.product')}</th>
                <th className="px-3 py-2.5 text-end font-medium">{t('supplierCatalog.ourStock')}</th>
                <th className="px-3 py-2.5 text-end font-medium">{t('supplierCatalog.cost')}</th>
                <th className="px-4 py-2.5 text-end font-medium">{t('supplierCatalog.qty')}</th>
              </tr></thead>
              <tbody className="divide-y">{rows.map(({ product: p, unitCost, low }) => (
                <tr key={p.id} className={low ? 'bg-signal/5' : ''}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{p.name}</div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground"><span className="font-mono">{p.sku}</span>{low && <span className="inline-flex items-center gap-1 font-medium text-signal-foreground dark:text-signal"><AlertTriangle className="h-3 w-3" aria-hidden="true" />{t('supplierCatalog.low', { site: site ?? '' })}</span>}</div>
                  </td>
                  <td className="px-3 py-2.5 text-end tabular">{fmtNumber(p.stock)} {p.uom}</td>
                  <td className="px-3 py-2.5 text-end tabular">{fmtMoney(unitCost, true)}</td>
                  <td className="px-4 py-2.5 text-end">
                    <Input type="number" min={0} inputMode="numeric" className="ms-auto h-9 w-24 text-end" aria-label={`${t('supplierCatalog.qty')}: ${p.name}`} data-testid={`offer-${p.id}`}
                      value={qty[p.id] ?? ''} onChange={(e) => setQty((s) => ({ ...s, [p.id]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))} />
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <EmptyState icon={PackageSearch} title={t('supplierCatalog.empty')} />}
      </QueryView>

      {items.length > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-40 border-t bg-card px-4 py-3 shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.25)] md:bottom-0 md:ps-20 lg:ps-72">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3">
            <span className="text-sm font-medium">{t('supplierCatalog.selected', { count: items.length })}</span>
            <Button onClick={() => setOpen(true)} data-testid="request-pickup"><Truck className="me-2 h-4 w-4" aria-hidden="true" />{t('supplierCatalog.request')}</Button>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('supplierCatalog.request')}</DialogTitle><DialogDescription>{t('supplierCatalog.dialogText')}</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label htmlFor="pd">{t('supplierCatalog.proposedDate')}</Label><Input id="pd" type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="pickup-date" /></div>
            <div className="space-y-1.5"><Label htmlFor="pn">{t('supplierCatalog.notes')}</Label><Textarea id="pn" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('supplierCatalog.notesPlaceholder')} /></div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => send.mutate()} disabled={send.isPending || !date} data-testid="send-pickup">{t('supplierCatalog.submit')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <p className="mt-4 text-xs text-muted-foreground"><Link href="/purchase-requests" className="text-primary hover:underline">{t('nav.purchaseRequests')}</Link></p>
    </div>
  );
}
