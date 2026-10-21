'use client';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { accessService } from '@/lib/services/accessService';
import { BOTTOM_PREFERENCE, GROUP_ORDER, MODULES, modulesForPath, normaliseModules, type ModuleDef, type ModuleId } from '@/lib/access/modules';
import type { Role } from '@/types/domain';

export interface NavItem { id: ModuleId; href: string; label: string; icon: ModuleDef['icon']; badge?: ModuleDef['badge']; }
export interface NavGroup { label: string; items: NavItem[]; }

/** Role-specific wording for a few menu items. */
function labelFor(m: ModuleDef, role: Role) {
  if (m.id === 'customers' && role === 'SALES_REP') return 'nav.myCustomers';
  if (m.id === 'dashboard' && (role === 'CUSTOMER_B2B' || role === 'CUSTOMER_B2C')) return 'nav.home';
  return m.label;
}

const toItem = (m: ModuleDef, role: Role): NavItem => ({ id: m.id, href: m.routes[0], label: labelFor(m, role), icon: m.icon, badge: m.badge });

/**
 * Module access for the signed-in user's role. Menus, the mobile bar and the
 * page guard all read from here, so switching a module off hides it everywhere.
 */
export function useAccess(role: Role) {
  const q = useQuery({ queryKey: ['access', 'role-modules'], queryFn: accessService.getRoleModules, staleTime: 60_000 });
  return useMemo(() => {
    const allowed = new Set<ModuleId>(normaliseModules(role, q.data?.[role]));
    const can = (id: ModuleId) => allowed.has(id);
    const canPath = (path: string) => modulesForPath(path).some((id) => allowed.has(id));
    const nav: NavGroup[] = GROUP_ORDER.map((g) => ({
      label: `nav.groups.${g}`,
      items: MODULES.filter((m) => m.group === g && m.inNav !== false && allowed.has(m.id)).map((m) => toItem(m, role)),
    })).filter((g) => g.items.length);
    const bottom: NavItem[] = BOTTOM_PREFERENCE[role].filter((id) => allowed.has(id)).slice(0, 4)
      .map((id) => toItem(MODULES.find((m) => m.id === id)!, role));
    return { ready: !q.isLoading, allowed, can, canPath, nav, bottom };
  }, [q.data, q.isLoading, role]);
}

/** Who can create and publish announcements and offers. */
export const canManageContent = (role?: Role) => role === 'ADMIN' || role === 'SUPERVISOR';
