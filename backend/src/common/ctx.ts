import { CanActivate, createParamDecorator, ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import type { Request } from 'express';
import { APP_CONFIG, type AppConfig } from '../config';
import { PortalDb } from '../db/portal-db';
import { AppError } from './errors';
import { toUser, type UserRow } from './users';
import { normaliseModules, type ModuleId } from '@/lib/access/moduleRules';
import { ROLES, type ActorRef, type Role, type User } from '@/types/domain';

/** Who is calling, from which site, and what they may use. Passed to every service call. */
export interface Ctx {
  user: User;
  actor: ActorRef;
  /** Site from the X-Site header (checked against the user's allowed sites). */
  site: string;
  modules: Set<ModuleId>;
}

export const isCustomer = (c: Ctx) => c.user.role === 'CUSTOMER_B2B' || c.user.role === 'CUSTOMER_B2C';
export const isManager = (c: Ctx) => c.user.role === 'ADMIN' || c.user.role === 'SUPERVISOR';
export const isRep = (c: Ctx) => c.user.role === 'SALES_REP';
export const isStaff = (c: Ctx) => isManager(c) || isRep(c);
export const isSupplier = (c: Ctx) => c.user.role === 'SUPPLIER';

const PUBLIC = 'nexus:public';
const MODULES = 'nexus:modules';
const ROLES_KEY = 'nexus:roles';
/** No sign-in needed (login, health). */
export const Public = () => SetMetadata(PUBLIC, true);
/** The caller's role must have at least one of these modules (Module access screen). */
export const Access = (...ids: ModuleId[]) => SetMetadata(MODULES, ids);
/** Only these roles, whatever the module assignment (e.g. module access itself is ADMIN only). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CtxParam = createParamDecorator((_: unknown, host: ExecutionContext): Ctx => host.switchToHttp().getRequest<Request & { ctx: Ctx }>().ctx);

export interface TokenClaims { sub: string; role: Role; iat?: number; exp?: number }

@Injectable()
export class RoleModulesCache {
  private value: { at: number; map: Record<Role, ModuleId[]> } | null = null;
  constructor(private db: PortalDb) {}
  async get(): Promise<Record<Role, ModuleId[]>> {
    if (this.value && Date.now() - this.value.at < 5000) return this.value.map;
    const rows = await this.db.k('role_modules').select();
    const stored = Object.fromEntries(rows.map((r: { role: Role; modules: string }) => [r.role, JSON.parse(r.modules)]));
    const map = Object.fromEntries(ROLES.map((r) => [r, normaliseModules(r, stored[r])])) as Record<Role, ModuleId[]>;
    this.value = { at: Date.now(), map };
    return map;
  }
  clear() { this.value = null; }
}

/**
 * Global guard: signed-in user (JWT), still active, working in one of their
 * sites, and holding the module the endpoint belongs to. Hiding a menu in the
 * portal is never the only protection.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private reflector: Reflector, private db: PortalDb, private roleModules: RoleModulesCache, @Inject(APP_CONFIG) private cfg: AppConfig) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true;
    const req = context.switchToHttp().getRequest<Request & { ctx: Ctx }>();
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    let claims: TokenClaims;
    try { claims = jwt.verify(token, this.cfg.jwtSecret) as TokenClaims; } catch { throw new AppError('errors.auth.unauthorized', 401, 'Missing or invalid token'); }
    const row = await this.db.k('users').where({ id: claims.sub }).first() as UserRow | undefined;
    if (!row) throw new AppError('errors.auth.unauthorized', 401, 'Unknown user');
    if (row.status !== 'active') throw new AppError(row.status === 'pending' ? 'errors.auth.pendingApproval' : 'errors.auth.inactive', 401);
    const user = toUser(row);
    const allowed = user.allowedSites ?? [];
    const asked = String(req.headers['x-site'] ?? '').trim();
    if (asked && !allowed.includes(asked)) throw new AppError('errors.sites.notAllowed', 403, `Site ${asked} is not allowed for this user`);
    const site = asked || user.defaultSite || allowed[0] || '';
    const map = await this.roleModules.get();
    const modules = new Set(map[user.role] ?? []);
    req.ctx = { user, site, modules, actor: { id: user.id, name: user.name, role: user.role } };

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    if (roles?.length && !roles.includes(user.role)) throw new AppError('errors.forbidden', 403);
    const need = this.reflector.getAllAndOverride<ModuleId[]>(MODULES, targets);
    if (need?.length && !need.some((m) => modules.has(m))) throw new AppError('errors.forbidden', 403, `Needs module ${need.join(' or ')}`);
    return true;
  }
}
