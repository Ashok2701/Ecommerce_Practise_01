'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, RotateCcw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { accessService, type RoleModules } from '@/lib/services';
import { GROUP_ORDER, MODULES, isLocked, type ModuleId } from '@/lib/access/modules';
import { useUser } from '@/lib/auth/AuthProvider';
import { useT } from '@/lib/i18n';
import { PageHeader, QueryView } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ROLES, type Role } from '@/types/domain';

type Draft = Record<Role, Set<ModuleId>>;
const toDraft = (rm: RoleModules): Draft => Object.fromEntries(ROLES.map((r) => [r, new Set(rm[r])])) as Draft;
const fromDraft = (d: Draft): RoleModules => Object.fromEntries(ROLES.map((r) => [r, MODULES.map((m) => m.id).filter((id) => d[r].has(id))])) as RoleModules;

/** Module access: which modules each role can use (YES/NO). ADMIN only. */
export default function AccessPage() {
  const { t } = useT();
  const user = useUser();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['access', 'role-modules'], queryFn: accessService.getRoleModules });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [mobileRole, setMobileRole] = useState<Role>('SALES_REP');
  useEffect(() => { if (q.data && !draft) setDraft(toDraft(q.data)); }, [q.data, draft]);

  const changes = useMemo(() => {
    if (!draft || !q.data) return 0;
    return ROLES.reduce((n, r) => n + MODULES.filter((m) => draft[r].has(m.id) !== q.data![r].includes(m.id)).length, 0);
  }, [draft, q.data]);

  const save = useMutation({
    mutationFn: () => accessService.saveRoleModules(fromDraft(draft!), user),
    onSuccess: (saved) => { qc.setQueryData(['access', 'role-modules'], saved); setDraft(toDraft(saved)); toast.success(t('access.saved')); },
  });

  const toggle = (role: Role, id: ModuleId, on: boolean) => setDraft((d) => {
    if (!d || isLocked(role, id)) return d;
    const next = { ...d, [role]: new Set(d[role]) };
    if (on) next[role].add(id); else next[role].delete(id);
    return next;
  });

  const groups = GROUP_ORDER.map((g) => ({ g, modules: MODULES.filter((m) => m.group === g) })).filter((x) => x.modules.length);
  const roleLabel = (r: Role) => t(`roles.${r}`);

  return (
    <div className="pb-24">
      <PageHeader title={t('access.title')} description={t('access.subtitle')}
        actions={<Button variant="outline" onClick={() => setDraft(toDraft(accessService.defaults()))} data-testid="access-reset"><RotateCcw className="me-2 h-4 w-4" aria-hidden="true" />{t('access.reset')}</Button>} />

      <div className="mb-4 flex gap-3 rounded-lg border bg-card p-3 text-[13px] text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p>{t('access.lockedHint')} {t('access.serverNote')}</p>
      </div>

      <QueryView query={q}>
        {() => draft && (
          <>
            {/* Desktop: module × role grid */}
            <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
              <table className="w-full text-sm" data-testid="access-matrix">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th scope="col" className="px-4 py-3 text-start font-medium">{t('access.module')}</th>
                    {ROLES.map((r) => (
                      <th key={r} scope="col" className="px-2 py-3 text-center font-medium">
                        <div className="leading-tight">{roleLabel(r)}</div>
                        <div className="mt-0.5 text-[11px] font-normal text-muted-foreground">{t('access.enabled', { count: draft[r].size, total: MODULES.length })}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map(({ g, modules }) => (
                    <Fragment key={g}>
                      <tr className="border-b bg-muted/20"><th colSpan={ROLES.length + 1} scope="colgroup" className="px-4 py-2 text-start text-xs font-semibold text-muted-foreground">{t(`nav.groups.${g}`)}</th></tr>
                      {modules.map((m) => (
                        <tr key={m.id} className="border-b last:border-0 hover:bg-muted/20">
                          <th scope="row" className="px-4 py-2.5 text-start font-normal">
                            <span className="flex items-center gap-2.5"><m.icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{t(m.label)}</span>
                          </th>
                          {ROLES.map((r) => {
                            const locked = isLocked(r, m.id);
                            const on = draft[r].has(m.id);
                            const changed = q.data && on !== q.data[r].includes(m.id);
                            return (
                              <td key={r} className={`px-2 py-2.5 text-center ${changed ? 'bg-signal/10' : ''}`}>
                                {locked ? (
                                  <span className="inline-flex items-center justify-center text-muted-foreground" title={t('access.alwaysOn')}>
                                    <Lock className="h-3.5 w-3.5" aria-hidden="true" /><span className="sr-only">{t('access.alwaysOn')}</span>
                                  </span>
                                ) : (
                                  <Checkbox checked={on} onCheckedChange={(v) => toggle(r, m.id, !!v)} aria-label={`${roleLabel(r)}: ${t(m.label)}`} data-testid={`access-${r}-${m.id}`} />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: one role at a time */}
            <div className="md:hidden">
              <Select value={mobileRole} onValueChange={(v) => setMobileRole(v as Role)}>
                <SelectTrigger className="h-11 bg-card" aria-label={t('access.role')}><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>)}</SelectContent>
              </Select>
              <div className="mt-3 space-y-4">
                {groups.map(({ g, modules }) => (
                  <section key={g}>
                    <h2 className="mb-1.5 text-xs font-semibold text-muted-foreground">{t(`nav.groups.${g}`)}</h2>
                    <ul className="divide-y rounded-lg border bg-card">
                      {modules.map((m) => {
                        const locked = isLocked(mobileRole, m.id);
                        return (
                          <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                            <m.icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                            <span className="flex-1 text-sm">{t(m.label)}</span>
                            {locked ? <span className="text-xs text-muted-foreground">{t('access.alwaysOn')}</span>
                              : <Switch checked={draft[mobileRole].has(m.id)} onCheckedChange={(v) => toggle(mobileRole, m.id, v)} aria-label={t(m.label)} />}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            </div>
          </>
        )}
      </QueryView>

      {changes > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-40 border-t bg-card px-4 py-3 shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.25)] md:bottom-0 md:ps-20 lg:ps-72" role="region" aria-label={t('access.unsaved', { count: changes })}>
          <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3">
            <span className="text-sm font-medium" data-testid="access-unsaved">{t('access.unsaved', { count: changes })}</span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => q.data && setDraft(toDraft(q.data))}>{t('access.discard')}</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="access-save">{t('access.save')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
