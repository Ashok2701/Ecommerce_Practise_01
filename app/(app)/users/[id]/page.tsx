'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, Mail, Phone } from 'lucide-react';
import { userService, accessService, customerService, supplierService } from '@/lib/services';
import { useT } from '@/lib/i18n';
import { fmtDate, initials, timeAgo } from '@/lib/format';
import { QueryView, LoadingState, SectionCard } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Card } from '@/components/ui/card';
import { BackLink, Facts, RefLink } from '@/features/detail/DetailBits';
import { SitesEditor } from '@/features/users/SitesEditor';
import { UserStatusActions } from '@/features/users/UserStatusActions';
import { MODULES } from '@/lib/access/modules';

/** A login: who it is, what it is linked to, which sites and which modules it can use. */
export default function UserPage() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['user', id], queryFn: () => userService.get(id) });
  const access = useQuery({ queryKey: ['access', 'role-modules'], queryFn: accessService.getRoleModules });
  const cust = useQuery({ queryKey: ['customer', q.data?.customerId], queryFn: () => customerService.getCustomer(q.data!.customerId!), enabled: !!q.data?.customerId });
  const sup = useQuery({ queryKey: ['supplier', q.data?.supplierId], queryFn: () => supplierService.get(q.data!.supplierId!), enabled: !!q.data?.supplierId });
  return (
    <div>
      <BackLink href="/users" label={t('users.title')} />
      <QueryView query={q} loading={<LoadingState variant="detail" />}>
        {(u) => {
          const mods = access.data?.[u.role] ?? [];
          return (
            <div className="space-y-4">
              <Card className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">{initials(u.name)}</span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold tracking-tight" data-testid="user-name">{u.name}</h1><StatusBadge status={u.status} /></div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{t(`roles.${u.role}`)}{u.title ? ` · ${u.title}` : ''}</p>
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                        <a href={`mailto:${u.email}`} className="flex items-center gap-1.5 hover:text-foreground"><Mail className="h-4 w-4" aria-hidden="true" />{u.email}</a>
                        {u.phone && <a href={`tel:${u.phone}`} className="flex items-center gap-1.5 hover:text-foreground"><Phone className="h-4 w-4" aria-hidden="true" />{u.phone}</a>}
                      </div>
                    </div>
                  </div>
                  <UserStatusActions user={u} />
                </div>
              </Card>
              <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard title={t('users.detail.account')} bodyClassName="p-4">
                  <Facts items={[
                    [t('users.detail.erpCode'), u.erpCode],
                    [t('users.detail.region'), u.region],
                    [t('users.detail.linkedCustomer'), u.customerId ? <RefLink href={`/customers/${u.customerId}`}>{cust.data?.name ?? u.customerId}</RefLink> : undefined],
                    [t('users.detail.linkedSupplier'), u.supplierId ? <RefLink href={`/suppliers/${u.supplierId}`}>{sup.data?.name ?? u.supplierId}</RefLink> : undefined],
                    [t('users.detail.salesPage'), u.role === 'SALES_REP' ? <RefLink href={`/sales-reps/${u.id}`}>{t('users.detail.openPerformance')}</RefLink> : undefined],
                    [t('users.detail.created'), fmtDate(u.createdAt)],
                    [t('users.col.lastLogin'), u.lastLoginAt ? timeAgo(u.lastLoginAt) : t('users.never')],
                  ]} />
                </SectionCard>
                <SectionCard title={t('users.detail.modules')} action={<RefLink href="/access" className="text-xs font-medium"><KeyRound className="me-1 inline h-3.5 w-3.5" aria-hidden="true" />{t('nav.access')}</RefLink>} bodyClassName="p-4">
                  <p className="mb-3 text-xs text-muted-foreground">{t('users.detail.modulesHint', { role: t(`roles.${u.role}`) })}</p>
                  <ul className="flex flex-wrap gap-1.5" data-testid="user-modules">{MODULES.filter((m) => mods.includes(m.id) && m.inNav !== false).map((m) => <li key={m.id} className="rounded-md border bg-muted/40 px-2 py-1 text-xs">{t(m.label)}</li>)}</ul>
                </SectionCard>
              </div>
              <Card className="p-4"><SitesEditor user={u} onSaved={() => q.refetch()} /></Card>
            </div>
          );
        }}
      </QueryView>
    </div>
  );
}
