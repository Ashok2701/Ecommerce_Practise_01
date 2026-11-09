'use client';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, X, Loader2, ClipboardList, ShoppingCart, FileText, Wallet, MinusCircle, AlertTriangle, CalendarClock, User as UserIcon, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { salesService, customerService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { EmptyState, LoadingState } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { VisitOutcome, VisitReport, FollowUp } from '@/types/domain';

export const OUTCOMES: { value: VisitOutcome; icon: any; tone: string }[] = [
  { value: 'order_placed', icon: ShoppingCart, tone: 'bg-emerald-50 text-emerald-700' },
  { value: 'quote_requested', icon: FileText, tone: 'bg-blue-50 text-blue-700' },
  { value: 'payment_collected', icon: Wallet, tone: 'bg-violet-50 text-violet-700' },
  { value: 'no_order', icon: MinusCircle, tone: 'bg-slate-100 text-slate-700' },
  { value: 'issue_reported', icon: AlertTriangle, tone: 'bg-rose-50 text-rose-700' },
];
const MAX_PHOTOS = 4;

/** Resize + JPEG-compress on device so reports stay small (works offline, cheap to sync). */
function compress(file: File, max = 720, quality = 0.62): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function VisitReportSheet({ open, onOpenChange, customerId, visitId, purpose }: { open: boolean; onOpenChange: (v: boolean) => void; customerId: string; visitId?: string; purpose?: string }) {
  const { t } = useT();
  const user = useUser();
  const qc = useQueryClient();
  const cust = useQuery({ queryKey: ['customer', customerId], queryFn: () => customerService.getCustomer(customerId), enabled: open && !!customerId });
  const [outcome, setOutcome] = useState<VisitOutcome>('order_placed');
  const [contact, setContact] = useState('');
  const [notes, setNotes] = useState('');
  const [next, setNext] = useState('');
  const [fuDate, setFuDate] = useState('');
  const [fuType, setFuType] = useState<FollowUp['type']>('call');
  const [photos, setPhotos] = useState<string[]>([]);
  const [busyPhoto, setBusyPhoto] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setOutcome('order_placed'); setNotes(''); setNext(''); setFuDate(''); setPhotos([]); } }, [open]);
  useEffect(() => { if (cust.data) setContact(cust.data.contactName); }, [cust.data]);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) return toast.error(t('visits.maxPhotos', { count: MAX_PHOTOS }));
    setBusyPhoto(true);
    try { const out = await Promise.all(Array.from(files).slice(0, room).map((f) => compress(f))); setPhotos((p) => [...p, ...out]); }
    catch { toast.error(t('visits.badImage')); }
    finally { setBusyPhoto(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const m = useMutation({
    mutationFn: () => salesService.saveVisitReport({ visitId, customerId, salesRepId: user.id, salesRepName: user.name, outcome, contactMet: contact, notes: notes.trim(), nextSteps: next.trim(), followUpDate: fuDate ? new Date(fuDate).toISOString() : undefined, followUpType: fuType, photos }),
    onSuccess: () => { qc.invalidateQueries(); toast.success(t('visits.saved'), { description: fuDate ? t('visits.followScheduled', { date: fmtDate(new Date(fuDate).toISOString()) }) : cust.data?.name }); onOpenChange(false); },
    onError: () => toast.error(t('visits.saveFailed')),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg" data-testid="visit-report-sheet">
        <SheetHeader className="text-start"><SheetTitle>{t('visits.title')}</SheetTitle><SheetDescription>{cust.data?.name ?? '\u2026'}{purpose ? ` \u00b7 ${purpose}` : ''}</SheetDescription></SheetHeader>
        <form className="mt-5 space-y-5" onSubmit={(e) => { e.preventDefault(); if (!notes.trim()) return toast.error(t('visits.needNotes')); m.mutate(); }}>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">{t('visits.outcomeLabel')}</legend>
            <div className="grid grid-cols-2 gap-2">{OUTCOMES.map((o) => (
              <button type="button" key={o.value} onClick={() => setOutcome(o.value)} aria-pressed={outcome === o.value} data-testid={`outcome-${o.value}`}
                className={cn('flex h-11 items-center gap-2 rounded-md border px-3 text-start text-sm', outcome === o.value ? 'border-primary bg-accent font-medium text-accent-foreground ring-1 ring-primary' : 'bg-card')}>
                <o.icon className="h-4 w-4 shrink-0" aria-hidden="true" />{t(`visits.outcome.${o.value}`)}
              </button>
            ))}</div>
          </fieldset>
          <div className="space-y-1.5"><Label htmlFor="vr-contact">{t('visits.contact')}</Label><Input id="vr-contact" value={contact} onChange={(e) => setContact(e.target.value)} className="h-11" /></div>
          <div className="space-y-1.5"><Label htmlFor="vr-notes">{t('followUps.notes')}</Label><Textarea id="vr-notes" data-testid="vr-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('visits.notesPlaceholder')} /></div>
          <div className="space-y-2">
            <Label>{t('visits.photos')} <span className="font-normal text-muted-foreground">({photos.length}/{MAX_PHOTOS})</span></Label>
            <div className="grid grid-cols-4 gap-2">
              {photos.map((p, i) => (
                <div key={i} className="group relative aspect-square overflow-hidden rounded-md border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p} alt={t('visits.photoN', { n: i + 1 })} className="h-full w-full object-cover" />
                  <button type="button" onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))} className="absolute end-1 top-1 rounded-full bg-black/60 p-1 text-white" aria-label={t('visits.removePhoto', { n: i + 1 })}><X className="h-3 w-3" /></button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <button type="button" onClick={() => fileRef.current?.click()} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:border-primary hover:text-primary" data-testid="vr-add-photo">
                  {busyPhoto ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}{t('quickOrder.add')}
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} data-testid="vr-photo-input" />
            <p className="text-[11px] text-muted-foreground">{t('visits.photosHint')}</p>
          </div>
          <div className="space-y-1.5"><Label htmlFor="vr-next">{t('visits.nextSteps')}</Label><Textarea id="vr-next" data-testid="vr-next" rows={2} value={next} onChange={(e) => setNext(e.target.value)} placeholder={t('visits.nextPlaceholder')} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="vr-fu">{t('visits.followDate')}</Label><Input id="vr-fu" data-testid="vr-followup-date" type="date" value={fuDate} onChange={(e) => setFuDate(e.target.value)} className="h-11" /></div>
            <div className="space-y-1.5"><Label>{t('visits.followType')}</Label><Select value={fuType} onValueChange={(v: any) => setFuType(v)}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="call">{t('reps.followType.call')}</SelectItem><SelectItem value="visit">{t('reps.followType.visit')}</SelectItem><SelectItem value="quote">{t('reps.followType.quote')}</SelectItem><SelectItem value="payment">{t('reps.followType.payment')}</SelectItem></SelectContent></Select></div>
          </div>
          {fuDate && <p className="flex items-center gap-1.5 text-xs text-primary"><CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />{t('visits.followAdded')}</p>}
          <div className="sticky bottom-0 -mx-6 border-t bg-background px-6 py-3"><Button type="submit" className="h-11 w-full" disabled={m.isPending} data-testid="vr-save">{m.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{t('visits.save')}</Button></div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function VisitReportList({ customerId }: { customerId: string }) {
  const { t } = useT();
  const q = useQuery({ queryKey: ['visit-reports', customerId], queryFn: () => salesService.getVisitReports({ customerId }) });
  const [zoom, setZoom] = useState<string | null>(null);
  if (q.isLoading) return <LoadingState rows={2} />;
  if (!q.data?.length) return <EmptyState icon={ClipboardList} title={t('visits.emptyTitle')} description={t('visits.emptyText')} />;
  return (
    <>
      <ul className="space-y-3" data-testid="visit-report-list">
        {q.data.map((r: VisitReport) => { const o = OUTCOMES.find((x) => x.value === r.outcome)!; return (
          <li key={r.id}><Card className="p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium', o.tone)}><o.icon className="h-3 w-3" aria-hidden="true" />{t(`visits.outcome.${o.value}`)}</span>
              <span className="text-muted-foreground">{fmtDateTime(r.at)} \u00b7 {r.salesRepName}</span>
              {r.contactMet && <span className="flex items-center gap-1 text-muted-foreground"><UserIcon className="h-3 w-3" />{r.contactMet}</span>}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm">{r.notes}</p>
            {r.nextSteps && <p className="mt-2 rounded-md bg-muted/60 p-2.5 text-sm"><span className="text-xs font-semibold text-muted-foreground">{t('visits.nextSteps')}: </span>{r.nextSteps}{r.followUpDate && <span className="text-xs text-muted-foreground"> \u00b7 {t('visits.followOn', { date: fmtDate(r.followUpDate) })}</span>}</p>}
            {!!r.photos.length && <div className="mt-3 flex gap-2">{r.photos.map((p, i) => (
              <button key={i} onClick={() => setZoom(p)} className="h-16 w-16 overflow-hidden rounded-md border" aria-label={t('visits.photoN', { n: i + 1 })}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p} alt="" className="h-full w-full object-cover" />
              </button>
            ))}</div>}
            {!r.photos.length && <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground"><ImageIcon className="h-3 w-3" aria-hidden="true" />{t('visits.noPhotos')}</p>}
          </Card></li>
        ); })}
      </ul>
      <Dialog open={!!zoom} onOpenChange={(v) => !v && setZoom(null)}>
        <DialogContent className="max-w-2xl p-2"><DialogTitle className="sr-only">{t('visits.photo')}</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {zoom && <img src={zoom} alt={t('visits.photo')} className="w-full rounded" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
