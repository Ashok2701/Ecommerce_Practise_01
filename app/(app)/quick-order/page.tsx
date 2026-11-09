'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ScanLine, Plus, Trash2, ClipboardPaste, ShoppingCart, Building2, Zap, AlertTriangle, Camera, X } from 'lucide-react';
import { toast } from 'sonner';
import { productService, offerService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useCart, usePricedCart } from '@/lib/cart/CartProvider';
import { buildLine, stockStatus } from '@/lib/domain/pricing';
import { useSite } from '@/lib/sites/SiteProvider';
import { fmtMoney } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { PageHeader, EmptyState, LoadingState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { QtyStepper } from '@/components/common/ProductBits';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { OrderContextBar } from '@/features/orders/OrderContextBar';
import { cn } from '@/lib/utils';
import type { Product } from '@/types/domain';

interface Line { productId: string; quantity: number; }
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const roundToMoq = (q: number, moq: number) => Math.max(moq, Math.ceil(q / moq) * moq);

/** Resolve a typed/scanned code to a product: exact SKU, then normalised SKU, then unique prefix/name match. */
function resolve(code: string, products: Product[]): Product | undefined {
  const c = code.trim(); if (!c) return;
  const n = norm(c);
  return products.find((p) => p.sku.toUpperCase() === c.toUpperCase()) ?? products.find((p) => norm(p.sku) === n)
    ?? (() => { const m = products.filter((p) => norm(p.sku).startsWith(n) || p.name.toLowerCase().includes(c.toLowerCase())); return m.length === 1 ? m[0] : undefined; })();
}

function Scanner({ open, onClose, onCode, products }: { open: boolean; onClose: () => void; onCode: (code: string) => void; products: Product[] }) {
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'starting' | 'scanning' | 'unsupported' | 'denied'>('starting');
  const last = useRef<{ code: string; t: number }>({ code: '', t: 0 });
  const cb = useRef(onCode); cb.current = onCode;
  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null; let raf = 0; let stopped = false;
    (async () => {
      const BD = (window as any).BarcodeDetector;
      if (!BD || !navigator.mediaDevices?.getUserMedia) { setState('unsupported'); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stopped) return;
        const v = videoRef.current!; v.srcObject = stream; await v.play(); setState('scanning');
        const det = new BD({ formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'qr_code', 'upc_a'] });
        const tick = async () => {
          if (stopped) return;
          try {
            const codes = await det.detect(v);
            const raw = codes?.[0]?.rawValue;
            if (raw && (raw !== last.current.code || Date.now() - last.current.t > 2500)) { last.current = { code: raw, t: Date.now() }; navigator.vibrate?.(60); cb.current(raw); }
          } catch {}
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch { setState('denied'); }
    })();
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((tr) => tr.stop()); setState('starting'); };
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t('quickOrder.scanTitle')}</DialogTitle><DialogDescription>{t('quickOrder.scanText')}</DialogDescription></DialogHeader>
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-slate-900">
          <video ref={videoRef} className={cn('h-full w-full object-cover', state !== 'scanning' && 'hidden')} muted playsInline />
          {state === 'scanning' && <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,.8)]" />}
          {state !== 'scanning' && (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-300">
              <Camera className="h-8 w-8" />
              {state === 'starting' && t('quickOrder.camStarting')}
              {state === 'unsupported' && t('quickOrder.camUnsupported')}
              {state === 'denied' && t('quickOrder.camDenied')}
            </div>
          )}
        </div>
        <Button variant="outline" onClick={() => { const p = products[Math.floor(Math.random() * products.length)]; onCode(p.sku); }} data-testid="simulate-scan"><ScanLine className="me-2 h-4 w-4" />{t('quickOrder.simulate')}</Button>
      </DialogContent>
    </Dialog>
  );
}

export default function QuickOrderPage() {
  const { t } = useT();
  const user = useUser();
  const router = useRouter();
  const cart = useCart();
  const { customer } = usePricedCart();
  const products = useQuery({ queryKey: ['products', 'all'], queryFn: productService.getAll, staleTime: 300_000 });
  const offers = useQuery({ queryKey: ['offers', 'pricing'], queryFn: offerService.pricing, staleTime: 5 * 60_000 });
  const { site } = useSite();
  const [lines, setLines] = useState<Line[]>([]);
  const [code, setCode] = useState('');
  const [qty, setQty] = useState('');
  const [focus, setFocus] = useState(false);
  const [paste, setPaste] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [scan, setScan] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const all = products.data ?? [];
  const byId = useMemo(() => Object.fromEntries(all.map((p) => [p.id, p])), [all]);

  const suggestions = useMemo(() => {
    const c = code.trim(); if (c.length < 2) return [];
    const n = norm(c);
    return all.filter((p) => norm(p.sku).includes(n) || p.name.toLowerCase().includes(c.toLowerCase())).slice(0, 6);
  }, [code, all]);

  const addLine = (p: Product, q?: number, silent = false) => {
    const wanted = q && q > 0 ? q : p.moq;
    const quantity = roundToMoq(wanted, p.moq);
    setLines((ls) => { const ex = ls.find((l) => l.productId === p.id); return ex ? ls.map((l) => (l.productId === p.id ? { ...l, quantity: l.quantity + quantity } : l)) : [{ productId: p.id, quantity }, ...ls]; });
    if (!silent) toast.success(`${p.sku} \u00b7 ${quantity} ${p.uom}`, { description: quantity !== wanted ? t('quickOrder.rounded', { moq: p.moq }) : p.name, duration: 1500 });
  };

  const submitCode = (p?: Product) => {
    const prod = p ?? resolve(code, all) ?? suggestions[0];
    if (!prod) return toast.error(t('quickOrder.noMatch', { code }));
    addLine(prod, parseInt(qty, 10));
    setCode(''); setQty(''); codeRef.current?.focus();
  };

  const onScan = (raw: string) => { const p = resolve(raw, all); if (p) addLine(p); else toast.error(t('quickOrder.unknownBarcode', { code: raw })); };

  const importPaste = () => {
    const errs: string[] = []; let ok = 0;
    paste.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((l) => {
      const m = l.match(/^(.+?)[\s,;\t]+(\d+)\s*$/);
      const c = m ? m[1] : l; const q = m ? parseInt(m[2], 10) : undefined;
      const p = resolve(c.replace(/[,;\t]+$/, ''), all);
      if (p) { addLine(p, q, true); ok++; } else errs.push(l);
    });
    setErrors(errs);
    toast[errs.length ? 'warning' : 'success'](errs.length ? t('quickOrder.pastedSome', { ok, bad: errs.length }) : t('quickOrder.pasted', { count: ok }));
    if (!errs.length) { setPaste(''); setPasteOpen(false); }
  };

  const priced = lines.map((l) => { const p = byId[l.productId]; if (!p) return null; const line = buildLine(p, l.quantity, customer, offers.data ?? [], site); const net = l.quantity ? line.lineTotal / l.quantity : line.unitPrice; return { ...l, p, unit: net, off: line.discountPct ? line : undefined, total: line.lineTotal }; }).filter(Boolean) as any[];
  const total = priced.reduce((s, l) => s + l.total, 0);
  const addAll = () => { lines.forEach((l) => cart.add(l.productId, l.quantity)); toast.success(t('quickOrder.addedToCart', { count: lines.length })); setLines([]); router.push('/cart'); };

  if (user.role === 'SALES_REP' && !customer) return (<div><OrderContextBar step="products" /><EmptyState icon={Building2} title={t('quickOrder.pickCustomerTitle')} description={t('quickOrder.pickCustomerText')} action={<Button asChild><Link href="/orders/new">{t('quickOrder.selectCustomer')}</Link></Button>} /></div>);
  if (products.isLoading) return <LoadingState variant="detail" />;

  return (
    <div>
      <OrderContextBar step="products" />
      <PageHeader title={<span className="flex items-center gap-2"><Zap className="h-5 w-5 text-primary" aria-hidden="true" />{t('nav.quickOrder')}</span>} description={t('quickOrder.intro')}
        actions={<><Button variant="outline" onClick={() => setPasteOpen((v) => !v)} data-testid="toggle-paste"><ClipboardPaste className="me-2 h-4 w-4" />{t('quickOrder.pasteList')}</Button><Button variant="outline" onClick={() => setScan(true)} data-testid="open-scanner"><ScanLine className="me-2 h-4 w-4" />{t('quickOrder.scan')}</Button></>} />

      <Card className="p-4">
        <form onSubmit={(e) => { e.preventDefault(); submitCode(); }} className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <label htmlFor="qo-code" className="sr-only">{t('quickOrder.code')}</label>
            <Input id="qo-code" ref={codeRef} autoFocus autoComplete="off" data-testid="quick-code" value={code} onChange={(e) => setCode(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)}
              placeholder={t('quickOrder.codePlaceholder')} className="h-12 font-mono text-base" />
            {focus && suggestions.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg" role="listbox">
                {suggestions.map((p) => (
                  <li key={p.id}><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => submitCode(p)} className="flex w-full items-center gap-3 px-3 py-2 text-start text-sm hover:bg-muted" data-testid={`suggest-${p.sku}`}>
                    <span className="w-36 shrink-0 font-mono text-xs">{p.sku}</span><span className="flex-1 truncate">{p.name}</span><span className="text-xs text-muted-foreground">{t('catalog.moq')} {p.moq}</span>
                  </button></li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex gap-2">
            <label htmlFor="qo-qty" className="sr-only">{t('common.quantity')}</label>
            <Input id="qo-qty" inputMode="numeric" data-testid="quick-qty" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} placeholder={t('quickOrder.qtyPlaceholder')} className="h-12 w-full text-base sm:w-28" />
            <Button type="submit" className="h-12 px-5" data-testid="quick-add"><Plus className="me-1 h-4 w-4" />{t('quickOrder.add')}</Button>
          </div>
        </form>
        {pasteOpen && (
          <div className="mt-4 space-y-2 border-t pt-4">
            <label htmlFor="qo-paste" className="text-sm font-medium">{t('quickOrder.pasteLabel')} <span className="font-mono text-xs text-muted-foreground">{t('quickOrder.pasteFormat')}</span></label>
            <Textarea id="qo-paste" data-testid="quick-paste" rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} className="font-mono text-sm" placeholder={'BRG-6205-2RS 50\nPPE-HLM-IS2925, 40\nLUB-GRS-EP2-18\t4'} />
            <div className="flex gap-2"><Button onClick={importPaste} disabled={!paste.trim()} data-testid="quick-import">{t('quickOrder.addLines')}</Button><Button variant="ghost" onClick={() => { setPaste(''); setErrors([]); }}>{t('common.clear')}</Button></div>
            {!!errors.length && <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-900" data-testid="quick-errors"><div className="mb-1 flex items-center gap-1 font-semibold"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />{t('quickOrder.notRecognised')}</div>{errors.map((e) => <div key={e} className="font-mono">{e}</div>)}</div>}
          </div>
        )}
      </Card>

      <div className="mt-4">
        {!priced.length ? <EmptyState icon={Zap} title={t('quickOrder.emptyTitle')} description={t('quickOrder.emptyText')} /> : (
          <Card className="overflow-hidden" data-testid="quick-lines">
            <div className="flex items-center justify-between border-b px-4 py-3"><span className="text-sm font-semibold">{t('quickOrder.lines', { count: priced.length })}</span><Button variant="ghost" size="sm" onClick={() => setLines([])}>{t('quickOrder.clearAll')}</Button></div>
            <ul className="divide-y">
              {priced.map((l) => (
                <li key={l.productId} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[1fr_auto_120px_110px_40px]">
                  <div className="min-w-0"><div className="flex items-center gap-2"><span className="font-mono text-xs font-semibold">{l.p.sku}</span><StatusBadge status={stockStatus(l.p)} /></div><div className="truncate text-sm">{l.p.name}</div><div className="text-[11px] text-muted-foreground">{fmtMoney(l.unit, true)} / {l.p.uom}{l.off ? ` \u00b7 \u2212${l.off.discountPct}% ${l.off.offerCode}` : ''} \u00b7 {t('catalog.moq')} {l.p.moq}{l.quantity > l.p.stock ? <span className="text-amber-700"> \u00b7 {t('quickOrder.exceeds', { stock: l.p.stock })}</span> : ''}</div></div>
                  <QtyStepper value={l.quantity} step={l.p.moq} min={l.p.moq} size="sm" label={t('quickOrder.qtyFor', { name: l.p.sku })} onChange={(v) => setLines((ls) => ls.map((x) => (x.productId === l.productId ? { ...x, quantity: Math.max(l.p.moq, v) } : x)))} />
                  <div className="hidden text-end text-sm font-semibold tabular sm:block">{fmtMoney(l.total)}</div>
                  <div className="text-end text-xs text-muted-foreground sm:hidden">{fmtMoney(l.total)}</div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 justify-self-end" onClick={() => setLines((ls) => ls.filter((x) => x.productId !== l.productId))} aria-label={t('quickOrder.remove', { name: l.p.sku })}><Trash2 className="h-4 w-4" /></Button>
                </li>
              ))}
            </ul>
            <div className="sticky bottom-16 flex items-center justify-between gap-3 border-t bg-card px-4 py-3 md:bottom-0">
              <div><div className="text-xs text-muted-foreground">{t('quickOrder.estimated')}</div><div className="text-lg font-semibold tabular" data-testid="quick-total">{fmtMoney(total)}</div></div>
              <Button className="h-11" onClick={addAll} data-testid="quick-add-to-cart"><ShoppingCart className="me-2 h-4 w-4" />{t('common.addToCart')}</Button>
            </div>
          </Card>
        )}
      </div>
      <Scanner open={scan} onClose={() => setScan(false)} onCode={onScan} products={all} />
    </div>
  );
}
