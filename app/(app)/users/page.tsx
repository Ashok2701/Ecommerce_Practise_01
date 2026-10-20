'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, UserCheck, UserX, Eye, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { userService, siteService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useErrorText } from '@/lib/i18n';
import { Checkbox } from '@/components/ui/checkbox';
import { MapPin } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { fmtDate, initials, timeAgo } from '@/lib/format';
import { PageHeader, QueryView, DataTable } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ROLES, type User } from '@/types/domain';

function UsersInner() {
  const { t } = useT();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState(useSearchParams().get('status') ?? 'all');
  const [view, setView] = useState<User | null>(null);
  const q = useQuery({ queryKey: ['users'], queryFn: () => userService.list() });
  const m = useMutation({ mutationFn: ({ id, s }: { id: string; s: User['status'] }) => userService.setStatus(id, s), onSuccess: (u) => { qc.invalidateQueries(); toast.success(`${u.name} is now ${u.status}`); setView((v) => (v?.id === u.id ? u : v)); } });
  const s = search.toLowerCase();
  const rows = (q.data ?? []).filter((u) => (!s || [u.name, u.email, u.title].some((v) => v.toLowerCase().includes(s))) && (role === 'all' || u.role === role) && (status === 'all' || u.status === status));
  const pendingCount = (q.data ?? []).filter((u) => u.status === 'pending').length;
  const Actions = ({ u }: { u: User }) => (
    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {u.status === 'pending' && <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700" onClick={() => m.mutate({ id: u.id, s: 'active' })} data-testid={`approve-user-${u.id}`}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Approve</Button>}
      {u.status === 'active' && <Button size="sm" variant="outline" className="h-8" onClick={() => m.mutate({ id: u.id, s: 'inactive' })}><UserX className="mr-1 h-3.5 w-3.5" />Deactivate</Button>}
      {u.status === 'inactive' && <Button size="sm" variant="outline" className="h-8" onClick={() => m.mutate({ id: u.id, s: 'active' })}><UserCheck className="mr-1 h-3.5 w-3.5" />Activate</Button>}
      <Button size="sm" variant="ghost" className="h-8" onClick={() => setView(u)} aria-label={`View ${u.name}`}><Eye className="h-4 w-4" /></Button>
    </div>
  );
  return (
    <div>
      <PageHeader title="User management" description="Internal users and B2B customer logins (one login per customer in V1)." actions={pendingCount ? <Button variant="outline" onClick={() => setStatus('pending')}>{pendingCount} awaiting approval</Button> : undefined} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1 sm:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search users" data-testid="users-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email or title…" className="h-10 bg-card pl-9" /></div>
        <Select value={role} onValueChange={setRole}><SelectTrigger className="h-10 bg-card sm:w-48" aria-label="Role filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All roles</SelectItem>{ROLES.map((r) => <SelectItem key={r} value={r}>{t(`roles.${r}`)}</SelectItem>)}</SelectContent></Select>
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="h-10 bg-card sm:w-40" aria-label="Status filter" data-testid="users-status-filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select>
      </div>
      <QueryView query={q}>
        {() => (
          <DataTable<User> testId="users-table" rows={rows} rowKey={(u) => u.id} onRowClick={setView}
            columns={[
              { key: 'n', header: 'User', cell: (u) => <div className="flex items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials(u.name)}</span><div className="min-w-0"><div className="font-medium">{u.name}</div><div className="truncate text-[11px] text-muted-foreground">{u.email}</div></div></div> },
              { key: 'r', header: 'Role', cell: (u) => <div><div>{t(`roles.${u.role}`)}</div><div className="max-w-[220px] truncate text-[11px] text-muted-foreground">{u.title}</div></div> },
              { key: 'site', header: t('users.sites.column'), cell: (u) => <span className="text-xs text-muted-foreground">{(u.allowedSites ?? []).join(', ') || '—'}</span> },
              { key: 's', header: t('common.status'), cell: (u) => <StatusBadge status={u.status} /> },
              { key: 'l', header: 'Last login', cell: (u) => <span className="text-muted-foreground">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'Never'}</span> },
              { key: 'a', header: '', cell: (u) => <Actions u={u} />, align: 'right' },
            ]}
            mobileCard={(u) => (
              <div><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="font-medium">{u.name}</div><div className="truncate text-xs text-muted-foreground">{u.email}</div><div className="text-xs text-muted-foreground">{t(`roles.${u.role}`)}</div></div><StatusBadge status={u.status} /></div><div className="mt-3"><Actions u={u} /></div></div>
            )}
          />
        )}
      </QueryView>
      <Dialog open={!!view} onOpenChange={(v) => !v && setView(null)}>
        <DialogContent>
          {view && <>
            <DialogHeader><DialogTitle>{view.name}</DialogTitle><DialogDescription>{view.title}</DialogDescription></DialogHeader>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[['Email', view.email], ['Phone', view.phone], ['Role', t(`roles.${view.role}`)], ['ERP code', view.erpCode ?? '—'], ['Region', view.region ?? '—'], ['Created', fmtDate(view.createdAt)], ['Last login', view.lastLoginAt ? timeAgo(view.lastLoginAt) : 'Never']].map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="break-all font-medium">{v}</dd></div>)}
              <div><dt className="text-xs text-muted-foreground">Status</dt><dd><StatusBadge status={view.status} /></dd></div>
            </dl>
            <SitesEditor user={view} onSaved={setView} />
            <div className="mt-2 border-t pt-4"><Actions u={view} /></div>
          </>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Which sites a user may work in, and which one they start in. */
function SitesEditor({ user, onSaved }: { user: User; onSaved: (u: User) => void }) {
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
    <section className="mt-2 border-t pt-4" aria-labelledby="sites-title" data-testid="user-sites">
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

export default function UsersPage() { return <Suspense><UsersInner /></Suspense>; }
