'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronLeft, Search } from 'lucide-react';
import { toast } from 'sonner';
import { customerService, productService, quoteService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useErrorText, useT } from '@/lib/i18n';
import { PageHeader, LoadingState } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isCustomerRole } from '@/types/domain';

/** Customer: ask for prices. Staff: start a quote for a customer and price it next. */
export default function NewQuotePage() {
  const { t } = useT();
  const errorText = useErrorText();
  const user = useUser();
  const router = useRouter();
  const customer = isCustomerRole(user.role);
  const [customerId, setCustomerId] = useState(customer ? user.customerId ?? '' : '');
  const custs = useQuery({ queryKey: ['customers', 'quote', user.id], queryFn: () => customerService.getCustomers(user.role === 'SALES_REP' ? { salesRepId: user.id } : {}), enabled: !customer });
  const products = useQuery({ queryKey: ['products', 'all'], queryFn: productService.getAll });
  const [qty, setQty] = useState<Record<string, number>>({});
  const [target, setTarget] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const s = search.trim().toLowerCase();
  const list = (products.data ?? []).filter((p) => !s || [p.name, p.sku, p.brand].some((v) => v.toLowerCase().includes(s)))
    .sort((a, b) => Number((qty[b.id] ?? 0) > 0) - Number((qty[a.id] ?? 0) > 0));
  const items = Object.entries(qty).filter(([, n]) => n > 0).map(([productId, quantity]) => ({ productId, quantity, targetPrice: target[productId] || undefined }));
  const create = useMutation({
    mutationFn: () => quoteService.create({ customerId, items, note, actor: { id: user.id, name: user.name, role: user.role } }),
    onSuccess: (x) => { toast.success(customer ? t('quotes.requested', { number: x.number }) : t('quotes.started', { number: x.number })); router.push(`/quotes/${x.id}`); },
    onError: (e) => toast.error(errorText(e)),
  });
  const num = (v: string) => Math.max(0, Number(v) || 0);
  return (
    <div>
      <Link href="/quotes" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="me-1 h-4 w-4 rtl:rotate-180" aria-hidden="true" />{t('quotes.title')}</Link>
      <PageHeader title={customer ? t('quotes.requestTitle') : t('quotes.newTitle')} description={customer ? t('quotes.requestIntro') : t('quotes.newIntro')} />
      {!customer && (
        <Card className="mb-4 p-4">
          <Label>{t('quotes.col.customer')}</Label>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger className="mt-1.5 h-10" data-testid="quote-customer"><SelectValue placeholder={t('quotes.chooseCustomer')} /></SelectTrigger>
            <SelectContent>{(custs.data ?? []).filter((c) => c.type === 'B2B' && c.status === 'active').map((c) => <SelectItem key={c.id} value={c.id}>{c.name} · {c.code}</SelectItem>)}</SelectContent>
          </Select>
        </Card>
      )}
      <Card className="overflow-hidden">
        <div className="relative border-b p-3">
          <Search className="pointer-events-none absolute start-6 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('inventory.search')} aria-label={t('inventory.search')} className="h-9 ps-9" />
        </div>
        {products.isLoading ? <LoadingState /> : (
          <div className="max-h-[440px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-xs text-muted-foreground"><tr>
                <th className="px-4 py-2 text-start font-medium">{t('inventory.col.product')}</th>
                <th className="px-3 py-2 text-end font-medium">{t('requests.detail.qty')}</th>
                {customer && <th className="px-4 py-2 text-end font-medium">{t('quotes.targetPrice')}</th>}
              </tr></thead>
              <tbody className="divide-y">{list.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2"><div className="font-medium">{p.name}</div><div className="font-mono text-[11px] text-muted-foreground">{p.sku} · {p.packSize}</div></td>
                  <td className="px-3 py-2 text-end"><Input type="number" min={0} inputMode="numeric" aria-label={`${t('requests.detail.qty')}: ${p.name}`} className="ms-auto h-9 w-24 text-end" data-testid={`quote-qty-${p.id}`} value={qty[p.id] ?? ''} onChange={(e) => setQty((x) => ({ ...x, [p.id]: Math.round(num(e.target.value)) }))} /></td>
                  {customer && <td className="px-4 py-2 text-end"><Input type="number" min={0} step="0.01" inputMode="decimal" aria-label={`${t('quotes.targetPrice')}: ${p.name}`} className="ms-auto h-9 w-28 text-end" disabled={!qty[p.id]} value={target[p.id] ?? ''} onChange={(e) => setTarget((x) => ({ ...x, [p.id]: num(e.target.value) }))} /></td>}
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <div className="space-y-3 border-t p-4">
          <div className="space-y-1.5"><Label htmlFor="qn">{customer ? t('quotes.noteCustomer') : t('quotes.noteStaff')}</Label><Textarea id="qn" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('quotes.notePlaceholder')} data-testid="quote-note" /></div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">{t('requests.items', { count: items.length })}</span>
            <Button onClick={() => create.mutate()} disabled={!items.length || !customerId || create.isPending} data-testid="quote-create">{customer ? t('quotes.sendRequest') : t('quotes.startPricing')}</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
