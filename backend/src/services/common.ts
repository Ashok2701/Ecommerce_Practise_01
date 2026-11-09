import { randomBytes } from 'crypto';
import type { Repos } from '../db/portal-db';
import { nowIso } from '../db/portal-db';
import { forbidden, notFound } from '../common/errors';
import { isCustomer, isManager, isRep, isSupplier, type Ctx } from '../common/ctx';
import type { Erp } from './erp';
import type { ActivityItem, NotificationType, Role } from '@/types/domain';

export const uid = (p: string) => `${p}_${randomBytes(5).toString('hex')}`;
export const r2 = (n: number) => Math.round(n * 100) / 100;
export const DAY = 86400000;
export { nowIso };

/** Notify users directly and/or every active user with one of the roles. */
export async function notify(r: Repos, target: { userIds?: string[]; roles?: Role[] }, type: NotificationType, title: string, body: string, href?: string) {
  const ids = new Set((target.userIds ?? []).filter(Boolean));
  if (target.roles?.length) {
    const rows = await r.k('users').whereIn('role', target.roles).andWhere({ status: 'active' }).select('id');
    rows.forEach((u: { id: string }) => ids.add(u.id));
  }
  const at = nowIso();
  for (const userId of ids) await r.notifications.insert({ id: uid('ntf'), userId, type, title, body, href, at, read: false });
}

/** Users who log in for a customer / a supplier. */
export async function customerUserIds(r: Repos, customerId: string): Promise<string[]> {
  return (await r.k('users').where({ customer_id: customerId }).select('id')).map((u: { id: string }) => u.id);
}
export async function supplierUserIds(r: Repos, supplierId: string): Promise<string[]> {
  return (await r.k('users').where({ supplier_id: supplierId }).select('id')).map((u: { id: string }) => u.id);
}

export async function activity(r: Repos, a: Omit<ActivityItem, 'id' | 'at'> & { site?: string; at?: string }) {
  await r.activity.insert({ id: uid('act'), at: a.at ?? nowIso(), actor: a.actor, text: a.text, kind: a.kind, site: a.site });
}

/**
 * Data scope on top of module access: customers see only their own
 * customer, sales reps only the customers assigned to them, managers all.
 * Returns undefined for "no restriction".
 */
export async function customerScope(ctx: Ctx, erp: Erp): Promise<string[] | undefined> {
  if (isCustomer(ctx)) return ctx.user.customerId ? [ctx.user.customerId] : [];
  if (isRep(ctx)) {
    const map = await erp.repMaps();
    const code = map.byUser.get(ctx.user.id);
    return (await erp.x3.customers()).filter((c) => c.repCode && c.repCode === code).map((c) => c.id);
  }
  if (isSupplier(ctx)) return [];
  return undefined;
}

/** 404 (not 403) for records outside the caller's scope, so nothing leaks. */
export async function assertCustomerInScope(ctx: Ctx, erp: Erp, customerId: string, code = 'errors.notFound') {
  const scope = await customerScope(ctx, erp);
  if (scope && !scope.includes(customerId)) throw notFound(code);
}

/** Narrow a requested customer filter to the caller's scope. */
export async function scopedCustomerIds(ctx: Ctx, erp: Erp, requested?: string): Promise<string[] | undefined> {
  const scope = await customerScope(ctx, erp);
  if (requested) return !scope || scope.includes(requested) ? [requested] : [];
  return scope;
}

export const requireManager = (ctx: Ctx) => { if (!isManager(ctx)) throw forbidden(); };
export const requireStaff = (ctx: Ctx) => { if (!isManager(ctx) && !isRep(ctx)) throw forbidden(); };

export function text(v: unknown, max = 4000): string { return typeof v === 'string' ? v.slice(0, max) : ''; }
export function qty(v: unknown): number { const n = Number(v); return Number.isFinite(n) ? n : 0; }
export function items(v: unknown): { productId: string; quantity: number }[] {
  return Array.isArray(v) ? v.filter((i) => i && typeof i.productId === 'string').map((i) => ({ productId: i.productId, quantity: qty(i.quantity) })) : [];
}
