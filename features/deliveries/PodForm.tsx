'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, Eraser, MapPin } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { fmtNumber, fmtDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Delivery } from '@/types/domain';
import type { PodInput } from '@/lib/services';

/** Signature pad on a canvas (mouse, pen and touch). Calls onChange with a PNG data URL, or undefined when cleared. */
export function SignaturePad({ onChange }: { onChange: (v?: string) => void }) {
  const { t } = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  useEffect(() => {
    const c = ref.current!; const r = c.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
    c.width = r.width * dpr; c.height = r.height * dpr;
    const ctx = c.getContext('2d')!; ctx.scale(dpr, dpr); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0f172a';
  }, []);
  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e: React.PointerEvent) => { e.preventDefault(); ref.current!.setPointerCapture(e.pointerId); drawing.current = true; const ctx = ref.current!.getContext('2d')!; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const ctx = ref.current!.getContext('2d')!; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); dirty.current = true; };
  const up = () => { if (!drawing.current) return; drawing.current = false; if (dirty.current) onChange(ref.current!.toDataURL('image/png')); };
  const clear = () => { const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); dirty.current = false; onChange(undefined); };
  return (
    <div>
      <div className="relative rounded-md border bg-white">
        <canvas ref={ref} className="block h-36 w-full touch-none" aria-label={t('deliveries.pod.signHere')} role="img" data-testid="signature-pad"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} />
        <span className="pointer-events-none absolute bottom-2 start-3 text-[11px] text-slate-400">{t('deliveries.pod.signHere')}</span>
      </div>
      <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={clear}><Eraser className="me-1.5 h-3.5 w-3.5" aria-hidden="true" />{t('deliveries.pod.clear')}</Button>
    </div>
  );
}

/** Reads a photo and scales it down on the device so it stays small (max 1024 px, JPEG). */
function resize(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1024 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = reject; img.src = url;
  });
}

/**
 * Proof of delivery. Staff (driver, rep, warehouse) capture a signature or a photo;
 * a customer confirming in their own login only needs to say who received it.
 */
export function PodForm({ delivery, customer, defaultName, onSubmit, pending, onCancel }: {
  delivery: Delivery; customer: boolean; defaultName?: string; pending?: boolean; onCancel: () => void; onSubmit: (v: PodInput) => void;
}) {
  const { t } = useT();
  const [receivedBy, setReceivedBy] = useState(defaultName ?? '');
  const [signature, setSignature] = useState<string>();
  const [photo, setPhoto] = useState<string>();
  const [notes, setNotes] = useState('');
  const [loc, setLoc] = useState<{ lat: number; lng: number }>();
  const [lines, setLines] = useState(() => delivery.lines.map((l) => ({ productId: l.productId, receivedQty: l.quantity, damagedQty: 0 })));
  const set = (pid: string, k: 'receivedQty' | 'damagedQty', v: string) => setLines((ls) => ls.map((l) => (l.productId === pid ? { ...l, [k]: Math.max(0, Math.round(Number(v) || 0)) } : l)));
  const issues = lines.some((l, i) => l.receivedQty < delivery.lines[i].quantity || l.damagedQty > 0);
  const proofOk = customer || !!signature || !!photo;
  const locate = () => navigator.geolocation?.getCurrentPosition((p) => setLoc({ lat: Math.round(p.coords.latitude * 1e5) / 1e5, lng: Math.round(p.coords.longitude * 1e5) / 1e5 }));
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSubmit({ receivedBy, signature, photo, notes, lines, location: loc }); }}>
      <div className="space-y-1.5"><Label htmlFor="rb">{t('deliveries.pod.receivedBy')}</Label><Input id="rb" value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder={t('deliveries.pod.receivedByPlaceholder')} data-testid="pod-received-by" required /></div>
      <div>
        <div className="mb-1.5 text-sm font-medium">{t('deliveries.pod.quantities')}</div>
        <ul className="divide-y rounded-md border">{delivery.lines.map((l, i) => (
          <li key={l.productId} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-2 text-sm">
            <div className="min-w-0"><div className="truncate font-medium">{l.name}</div><div className="text-xs text-muted-foreground">{t('deliveries.pod.sent', { qty: fmtNumber(l.quantity), uom: l.uom })}</div></div>
            <label className="text-[11px] text-muted-foreground">{t('deliveries.pod.received')}<Input type="number" min={0} max={l.quantity} className="mt-0.5 h-8 w-20 text-end" value={lines[i].receivedQty} onChange={(e) => set(l.productId, 'receivedQty', e.target.value)} data-testid={`pod-rcv-${l.productId}`} /></label>
            <label className="text-[11px] text-muted-foreground">{t('deliveries.pod.damaged')}<Input type="number" min={0} className="mt-0.5 h-8 w-20 text-end" value={lines[i].damagedQty} onChange={(e) => set(l.productId, 'damagedQty', e.target.value)} data-testid={`pod-dmg-${l.productId}`} /></label>
          </li>
        ))}</ul>
        {issues && <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400" role="status">{t('deliveries.pod.issueHint')}</p>}
      </div>
      {!customer && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><div className="mb-1.5 text-sm font-medium">{t('deliveries.pod.signature')}</div><SignaturePad onChange={setSignature} /></div>
          <div>
            <div className="mb-1.5 text-sm font-medium">{t('deliveries.pod.photo')}</div>
            <label className="flex h-36 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed bg-muted/30 text-sm text-muted-foreground hover:bg-muted/50">
              {photo ? <img src={photo} alt={t('deliveries.pod.photo')} className="h-full w-full object-cover" /> : <span className="flex flex-col items-center gap-1"><Camera className="h-5 w-5" aria-hidden="true" />{t('deliveries.pod.takePhoto')}</span>}
              <input type="file" accept="image/*" capture="environment" className="sr-only" data-testid="pod-photo" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await resize(f)); }} />
            </label>
            <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={locate}><MapPin className="me-1.5 h-3.5 w-3.5" aria-hidden="true" />{loc ? `${loc.lat}, ${loc.lng}` : t('deliveries.pod.addLocation')}</Button>
          </div>
        </div>
      )}
      <div className="space-y-1.5"><Label htmlFor="pn">{t('deliveries.pod.notes')}</Label><Textarea id="pn" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      {!proofOk && <p className="text-xs text-muted-foreground">{t('deliveries.pod.proofHint')}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button><Button type="submit" disabled={!receivedBy.trim() || !proofOk || pending} data-testid="pod-submit">{customer ? t('deliveries.pod.confirmReceipt') : t('deliveries.pod.submit')}</Button></div>
    </form>
  );
}

/** Read-only proof of delivery. */
export function PodView({ d }: { d: Delivery }) {
  const { t } = useT();
  if (!d.pod) return null;
  const p = d.pod;
  const issues = d.lines.filter((l) => (l.receivedQty ?? l.quantity) < l.quantity || (l.damagedQty ?? 0) > 0);
  return (
    <div className="space-y-3 text-sm" data-testid="pod-view">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <dt className="text-muted-foreground">{t('deliveries.pod.receivedBy')}</dt><dd className="font-medium">{p.receivedBy}</dd>
        <dt className="text-muted-foreground">{t('deliveries.pod.at')}</dt><dd>{fmtDateTime(p.at)}</dd>
        <dt className="text-muted-foreground">{t('deliveries.pod.recordedBy')}</dt><dd>{p.recordedBy.name}</dd>
        {p.location && <><dt className="text-muted-foreground">{t('deliveries.pod.location')}</dt><dd className="font-mono text-xs">{p.location.lat}, {p.location.lng}</dd></>}
      </dl>
      {issues.length > 0 && <ul className="rounded-md bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{issues.map((l) => <li key={l.productId}>{l.name}: {t('deliveries.pod.issueLine', { received: fmtNumber(l.receivedQty ?? 0), sent: fmtNumber(l.quantity), damaged: fmtNumber(l.damagedQty ?? 0) })}</li>)}</ul>}
      {(p.signature || p.photo) && <div className="grid grid-cols-2 gap-2">
        {p.signature && <figure><img src={p.signature} alt={t('deliveries.pod.signature')} className="h-24 w-full rounded-md border bg-white object-contain" /><figcaption className="mt-1 text-[11px] text-muted-foreground">{t('deliveries.pod.signature')}</figcaption></figure>}
        {p.photo && <figure><img src={p.photo} alt={t('deliveries.pod.photo')} className="h-24 w-full rounded-md border object-cover" /><figcaption className="mt-1 text-[11px] text-muted-foreground">{t('deliveries.pod.photo')}</figcaption></figure>}
      </div>}
      {p.notes && <p className="rounded-md bg-muted/60 p-2.5 text-xs">{p.notes}</p>}
    </div>
  );
}
