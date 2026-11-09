'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import { offerService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useErrorText, useT } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { Offer, OfferPresentation } from '@/types/domain';

/**
 * Edit how an ERP offer looks in the portal: picture, title and text per
 * language, featured, hidden and order. Terms stay in the ERP.
 */
export function PresentationEditor({ offer, open, onOpenChange }: { offer: Offer; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t, languages, locale } = useT();
  const errorText = useErrorText();
  const user = useUser();
  const qc = useQueryClient();
  const [p, setP] = useState<OfferPresentation>(() => ({ ...offer.presentation, title: { ...offer.presentation.title }, text: { ...offer.presentation.text } }));
  const [lang, setLang] = useState(languages.some((l) => l.code === locale) ? locale : 'en');
  const save = useMutation({
    mutationFn: () => offerService.savePresentation(offer.id, clean(p), { id: user.id, name: user.name, role: user.role }),
    onSuccess: () => { qc.invalidateQueries(); toast.success(t('offers.presentation.saved')); onOpenChange(false); },
    onError: (e) => toast.error(errorText(e)),
  });
  const setLangField = (k: 'title' | 'text', v: string) => setP((x) => ({ ...x, [k]: { ...(x[k] ?? {}), [lang]: v } }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{t('offers.presentation.title')}</DialogTitle><DialogDescription>{t('offers.presentation.intro')}</DialogDescription></DialogHeader>
        <p className="flex items-start gap-2 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{t('offers.presentation.locked')}</p>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="pimg">{t('offers.presentation.image')}</Label><Input id="pimg" value={p.image ?? ''} onChange={(e) => setP({ ...p, image: e.target.value })} placeholder="https://…" data-testid="pres-image" /></div>
          <div>
            <div className="mb-2 flex flex-wrap gap-1" role="tablist" aria-label={t('offers.presentation.language')}>
              {languages.map((l) => (
                <button key={l.code} role="tab" aria-selected={lang === l.code} onClick={() => setLang(l.code)} className={cn('rounded-md border px-2 py-1 text-xs', lang === l.code ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted', (p.title?.[l.code] || p.text?.[l.code]) && lang !== l.code && 'font-semibold')}>{l.code.toUpperCase()}</button>
              ))}
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label htmlFor="ptitle">{t('offers.presentation.headline')}</Label><Input id="ptitle" value={p.title?.[lang] ?? ''} placeholder={offer.title} onChange={(e) => setLangField('title', e.target.value)} data-testid="pres-title" /></div>
              <div className="space-y-1.5"><Label htmlFor="ptext">{t('offers.presentation.text')}</Label><Textarea id="ptext" rows={3} value={p.text?.[lang] ?? ''} placeholder={offer.description} onChange={(e) => setLangField('text', e.target.value)} data-testid="pres-text" /></div>
              <p className="text-[11px] text-muted-foreground">{t('offers.presentation.fallback')}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_120px] sm:items-end">
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!p.featured} onCheckedChange={(v) => setP({ ...p, featured: !!v })} data-testid="pres-featured" />{t('offers.presentation.featured')}</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!p.hidden} onCheckedChange={(v) => setP({ ...p, hidden: !!v })} data-testid="pres-hidden" />{t('offers.presentation.hidden')}</label>
            <div className="space-y-1.5"><Label htmlFor="psort">{t('offers.presentation.sort')}</Label><Input id="psort" type="number" min={1} value={p.sort ?? ''} onChange={(e) => setP({ ...p, sort: e.target.value ? Number(e.target.value) : undefined })} /></div>
          </div>
          {p.hidden && <p className="text-xs text-amber-700 dark:text-amber-400">{t('offers.presentation.hiddenHint')}</p>}
        </div>
        <DialogFooter className="gap-2"><Button variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button><Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="pres-save">{t('common.save')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Drop empty translations so the ERP label shows through. */
function clean(p: OfferPresentation): OfferPresentation {
  const strip = (m?: Record<string, string>) => (m ? Object.fromEntries(Object.entries(m).filter(([, v]) => v.trim())) : undefined);
  return { image: p.image?.trim() || undefined, title: strip(p.title), text: strip(p.text), featured: p.featured, hidden: p.hidden, sort: p.sort };
}
