import { Inject, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { Erp } from './erp';
import { activity, nowIso, text } from './common';
import { AppError, badRequest, notFound } from '../common/errors';
import { RoleModulesCache, type Ctx } from '../common/ctx';
import { toUser, type UserRow } from '../common/users';
import { APP_CONFIG, type AppConfig } from '../config';
import { normaliseModules, type ModuleId } from '@/lib/access/moduleRules';
import { ROLES, type Role, type User, type UserStatus } from '@/types/domain';

const MAX_FAILED = 8;

/** Sign-in, users, sites per user and module access. */
@Injectable()
export class AdminService {
  constructor(private erp: Erp, private modulesCache: RoleModulesCache, @Inject(APP_CONFIG) private cfg: AppConfig) {}

  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    const e = text(email, 200).trim().toLowerCase();
    const row = await this.erp.db.k('users').whereRaw('LOWER(email) = ?', [e]).first() as UserRow | undefined;
    // same answer for unknown user and wrong password
    if (!row || row.failed_logins >= MAX_FAILED || !(await bcrypt.compare(String(password ?? ''), row.password_hash))) {
      if (row) await this.erp.db.k('users').where({ id: row.id }).update({ failed_logins: row.failed_logins + 1 });
      throw new AppError('errors.auth.invalidCredentials', 401);
    }
    if (row.status === 'pending') throw new AppError('errors.auth.pendingApproval', 403);
    if (row.status === 'inactive') throw new AppError('errors.auth.inactive', 403);
    const at = nowIso();
    await this.erp.db.k('users').where({ id: row.id }).update({ last_login_at: at, failed_logins: 0 });
    const user = toUser({ ...row, last_login_at: at });
    const token = jwt.sign({ sub: user.id, role: user.role }, this.cfg.jwtSecret, { expiresIn: `${this.cfg.jwtTtlHours}h` });
    return { user, token };
  }

  async me(ctx: Ctx): Promise<User> { return ctx.user; }

  async users(q: { search?: string; role?: string; status?: string }): Promise<User[]> {
    const s = q.search?.toLowerCase() ?? '';
    return (await this.erp.users()).filter((u) =>
      (!s || [u.name, u.email, u.title].some((v) => (v ?? '').toLowerCase().includes(s))) &&
      (!q.role || q.role === 'all' || u.role === q.role) && (!q.status || q.status === 'all' || u.status === q.status));
  }

  /** Reps list (managers assign customers and look at the team; also visible to reps for hand-overs). */
  async salesReps(): Promise<User[]> { return (await this.erp.users()).filter((u) => u.role === 'SALES_REP'); }

  async user(id: string): Promise<User> {
    const u = (await this.erp.users()).find((x) => x.id === id);
    if (!u) throw notFound();
    return u;
  }

  async setStatus(ctx: Ctx, id: string, status: UserStatus): Promise<User> {
    if (!(['active', 'pending', 'inactive'] as const).includes(status)) throw badRequest('errors.generic');
    const u = await this.user(id);
    if (u.id === ctx.user.id && status !== 'active') throw badRequest('errors.users.self');
    await this.erp.db.tx(async (r) => {
      await r.k('users').where({ id }).update({ status, failed_logins: 0 });
      await r.audit({ userId: ctx.user.id, userName: ctx.user.name, site: ctx.site, action: 'user.status', entity: 'user', entityId: id, detail: { from: u.status, to: status } });
      await activity(r, { actor: ctx.user.name, text: `${status === 'active' ? 'activated' : status === 'inactive' ? 'deactivated' : 'set pending'} ${u.name}`, kind: 'user' });
    });
    return this.user(id);
  }

  async setSites(ctx: Ctx, id: string, allowedSites: string[], defaultSite: string): Promise<User> {
    const all = (await this.erp.sites()).map((s) => s.code);
    const list = [...new Set((Array.isArray(allowedSites) ? allowedSites : []).map(String))].filter((s) => all.includes(s));
    if (!list.length) throw badRequest('errors.sites.atLeastOne');
    const def = list.includes(defaultSite) ? defaultSite : list[0];
    const u = await this.user(id);
    await this.erp.db.tx(async (r) => {
      await r.k('users').where({ id }).update({ allowed_sites: JSON.stringify(list), default_site: def });
      await r.audit({ userId: ctx.user.id, userName: ctx.user.name, site: ctx.site, action: 'user.sites', entity: 'user', entityId: id, detail: { from: u.allowedSites, to: list, defaultSite: def } });
      await activity(r, { actor: ctx.user.name, text: `set sites for ${u.name}: ${list.join(', ')}`, kind: 'user' });
    });
    return this.user(id);
  }

  async roleModules(): Promise<Record<Role, ModuleId[]>> { return this.modulesCache.get(); }

  /** ADMIN only; always-on and locked modules are re-applied, so nobody is locked out. */
  async saveRoleModules(ctx: Ctx, next: Partial<Record<Role, string[]>>): Promise<Record<Role, ModuleId[]>> {
    const before = await this.modulesCache.get();
    const after = Object.fromEntries(ROLES.map((r) => [r, normaliseModules(r, Array.isArray(next?.[r]) ? next[r] : before[r])])) as Record<Role, ModuleId[]>;
    const changed = ROLES.filter((r) => before[r].join() !== after[r].join());
    await this.erp.db.tx(async (r) => {
      for (const role of ROLES) {
        const row = { modules: JSON.stringify(after[role]), updated_at: nowIso(), updated_by: ctx.user.name };
        const n = await r.k('role_modules').where({ role }).update(row);
        if (!n) await r.k('role_modules').insert({ role, ...row });
      }
      if (changed.length) {
        await r.audit({ userId: ctx.user.id, userName: ctx.user.name, site: ctx.site, action: 'access.update', entity: 'role_modules', detail: Object.fromEntries(changed.map((x) => [x, { from: before[x], to: after[x] }])) });
        await activity(r, { actor: ctx.user.name, text: `changed module access for ${changed.join(', ')}`, kind: 'user' });
      }
    });
    this.modulesCache.clear();
    return after;
  }

  /** Create a login (used by the seeding and by onboarding scripts). */
  static async hash(password: string) { return bcrypt.hash(password, 10); }
}
