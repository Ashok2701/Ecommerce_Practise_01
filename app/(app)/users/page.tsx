'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { userService } from '@/lib/services';
import { useT } from '@/lib/i18n';
import { initials, timeAgo } from '@/lib/format';
import { PageHeader, QueryView, DataTable } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserStatusActions } from '@/features/users/UserStatusActions';
import { ROLES, type User } from '@/types/domain';

function UsersInner() {
  const { t } = useT();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState(useSearchParams().get('status') ?? 'all');
  const q = useQuery({ queryKey: ['users'], queryFn: () => userService.list() });
  const s = search.toLowerCase();
  const rows = (q.data ?? []).filter((u) => (!s || [u.name, u.email, u.title].some((v) => v.toLowerCase().includes(s))) && (role === 'all' || u.role === role) && (status === 'all' || u.status === status));
  const pendingCount = (q.data ?? []).filter((u) => u.status === 'pending').length;
  const open = (u: User) => router.push(`/users/${u.id}`);
  return (
    <div>
      <PageHeader title={t('users.title')} description={t('users.intro')} actions={pendingCount ? <Button variant="outline" onClick={() => setStatus('pending')}>{t('users.awaiting', { count: pendingCount })}</Button> : undefined} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1 sm:max-w-sm"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input aria-label={t('users.search')} data-testid="users-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('users.search')} className="h-10 bg-card ps-9" /></div>
        <Select value={role} onValueChange={setRole}><SelectTrigger className="h-10 bg-card sm:w-48" aria-label={t('users.col.role')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('users.allRoles')}</SelectItem>{ROLES.map((r) => <SelectItem key={r} value={r}>{t(`roles.${r}`)}</SelectItem>)}</SelectContent></Select>
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="h-10 bg-card sm:w-40" aria-label={t('common.status')} data-testid="users-status-filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('users.allStatuses')}</SelectItem>{(['active', 'pending', 'inactive'] as const).map((x) => <SelectItem key={x} value={x}>{t(`status.${x}`)}</SelectItem>)}</SelectContent></Select>
      </div>
      <QueryView query={q}>
        {() => (
          <DataTable<User> testId="users-table" rows={rows} rowKey={(u) => u.id} onRowClick={open}
            columns={[
              { key: 'n', header: t('users.col.user'), cell: (u) => <div className="flex items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials(u.name)}</span><div className="min-w-0"><div className="font-medium">{u.name}</div><div className="truncate text-[11px] text-muted-foreground">{u.email}</div></div></div> },
              { key: 'r', header: t('users.col.role'), cell: (u) => <div><div>{t(`roles.${u.role}`)}</div><div className="max-w-[220px] truncate text-[11px] text-muted-foreground">{u.title}</div></div> },
              { key: 'site', header: t('users.sites.column'), cell: (u) => <span className="text-xs text-muted-foreground">{(u.allowedSites ?? []).join(', ') || '—'}</span> },
              { key: 's', header: t('common.status'), cell: (u) => <StatusBadge status={u.status} /> },
              { key: 'l', header: t('users.col.lastLogin'), cell: (u) => <span className="text-muted-foreground">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : t('users.never')}</span> },
              { key: 'a', header: '', cell: (u) => <UserStatusActions user={u} />, align: 'right' },
            ]}
            mobileCard={(u) => (
              <div><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="font-medium">{u.name}</div><div className="truncate text-xs text-muted-foreground">{u.email}</div><div className="text-xs text-muted-foreground">{t(`roles.${u.role}`)}</div></div><StatusBadge status={u.status} /></div><div className="mt-3"><UserStatusActions user={u} /></div></div>
            )}
          />
        )}
      </QueryView>
    </div>
  );
}

export default function UsersPage() { return <Suspense><UsersInner /></Suspense>; }
