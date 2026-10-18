import { source, http } from '@/lib/api/httpClient';
import { getDb, commit, uid } from '@/lib/data/mockDb';
import { DEFAULT_ROLE_MODULES, normaliseModules, type ModuleId } from '@/lib/access/modules';
import { ROLES, type Role, type User } from '@/types/domain';

export type RoleModules = Record<Role, ModuleId[]>;

const normaliseAll = (raw: Partial<Record<Role, string[]>> | undefined): RoleModules =>
  Object.fromEntries(ROLES.map((r) => [r, normaliseModules(r, raw?.[r])])) as RoleModules;

/**
 * Role → module assignments (YES/NO).
 * Backend contract:
 *   GET /access/role-modules            -> { [role]: moduleId[] }
 *   PUT /access/role-modules            body { [role]: moduleId[] }  (ADMIN only, audited)
 */
export const accessService = {
  getRoleModules: () => source<RoleModules>(() => normaliseAll(getDb().roleModules), () => http.get('/access/role-modules')),

  saveRoleModules: (next: Partial<RoleModules>, actor: Pick<User, 'name'>) =>
    source<RoleModules>(() => {
      const db = getDb();
      const before = normaliseAll(db.roleModules);
      const after = normaliseAll({ ...before, ...next });
      const changed = ROLES.filter((r) => before[r].join() !== after[r].join());
      db.roleModules = after;
      if (changed.length) db.activity.unshift({ id: uid('act'), at: new Date().toISOString(), actor: actor.name, text: `changed module access for ${changed.join(', ')}`, kind: 'user' });
      commit();
      return after;
    }, () => http.put('/access/role-modules', next)),

  defaults: (): RoleModules => normaliseAll(DEFAULT_ROLE_MODULES),
};
