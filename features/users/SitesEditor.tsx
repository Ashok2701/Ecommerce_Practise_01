'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { userService, siteService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useErrorText, useT } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { User } from '@/types/domain';

/** Which sites a user may work in, and which one they start in. */
export function SitesEditor({ user, onSaved }: { user: User; onSaved: (u: User) => void }) {
  const { t } = useT();
  const errorText = useErrorText();
  const me = useUser();
  const qc = useQueryClient();
  const sites = useQuery({ queryKey: ['sites'], queryFn: siteService.list });
  const [sel, setSel] = useState<string[]>(user.allowedSites ?? []);
  const [def, setDef] = useState(user.defaultSite ?? '');
  const [err, setErr] = useState('');
  const effectiveDefault = sel.includes(def) ? def : sel[0] ?? '';
  const changed = sel.slice().sort().join() !== (user.allowedSites ?? []).slice().sort().join() || effectiveDefault !== (user.defaultSite ?? '');
  const save = useMutation({
    mutationFn: () => userService.setSites(user.id, sel, effectiveDefault, me),
    onSuccess: (u) => { qc.invalidateQueries({ queryKey: ['users'] }); onSaved({ ...u }); setErr(''); toast.success(t('users.sites.saved', { name: u.name })); },
    onError: (e) => setErr(errorText(e)),
  });
  const toggle = (code: string, on: boolean) => setSel((s) => (on ? [...s, code] : s.filter((c) => c !== code)));
  return (
    <section aria-labelledby="sites-title" data-testid="user-sites">
      <h3 id="sites-title" className="flex items-center gap-1.5 text-sm font-semibold"><MapPin className="h-4 w-4 text-primary" aria-hidden="true" />{t('users.sites.title')}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{t('users.sites.hint')}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {(sites.data ?? []).map((s) => (
          <label key={s.code} className="flex cursor-pointer items-center gap-2.5 rounded-md border p-2.5 text-sm hover:bg-muted/40">
            <Checkbox checked={sel.includes(s.code)} onCheckedChange={(v) => toggle(s.code, !!v)} data-testid={`user-site-${s.code}`} />
            <span className="min-w-0"><span className="block font-medium">{s.code}</span><span className="block truncate text-xs text-muted-foreground">{s.name}</span></span>
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <span className="mb-1 block text-xs text-muted-foreground">{t('users.sites.default')}</span>
          <Select value={effectiveDefault} onValueChange={setDef} disabled={!sel.length}>
            <SelectTrigger className="h-9" aria-label={t('users.sites.default')}><SelectValue /></SelectTrigger>
            <SelectContent>{sel.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button onClick={() => (sel.length ? save.mutate() : setErr(t('errors.sites.atLeastOne')))} disabled={!changed || save.isPending} data-testid="user-sites-save">{t('users.sites.save')}</Button>
      </div>
      {err && <p role="alert" className="mt-2 text-xs text-destructive">{err}</p>}
    </section>
  );
}

