import type { Role } from '@/types/domain';

/**
 * Module access rules without any UI: shared by the frontend menu
 * (lib/access/modules.ts) and the backend, which enforces the same
 * assignments on every API call.
 */
export type ModuleId =
  | 'dashboard' | 'catalog' | 'quick_order' | 'cart' | 'requests' | 'orders' | 'new_order' | 'invoices' | 'account' | 'offers'
  | 'supplier_catalog' | 'purchase_requests' | 'purchase_orders'
  | 'inventory' | 'consignment' | 'transfers' | 'suppliers'
  | 'quotes' | 'deliveries' | 'collections'
  | 'customers' | 'approvals' | 'team' | 'follow_ups' | 'performance'
  | 'announcements' | 'messages' | 'assistant' | 'notifications'
  | 'users' | 'access' | 'workflow' | 'settings';

/** Every module in menu order. */
export const MODULE_IDS: ModuleId[] = ['dashboard', 'approvals', 'customers', 'collections', 'follow_ups', 'performance', 'team', 'new_order', 'catalog', 'quick_order', 'cart', 'quotes', 'requests', 'orders', 'deliveries', 'invoices', 'account', 'supplier_catalog', 'purchase_requests', 'purchase_orders', 'suppliers', 'inventory', 'consignment', 'transfers', 'offers', 'announcements', 'messages', 'assistant', 'notifications', 'users', 'access', 'workflow', 'settings'];

/** Every role always has these. */
export const ALWAYS_ON: ModuleId[] = ['dashboard', 'notifications'];
/** ADMIN can never lose these, so nobody gets locked out of administration. */
export const ADMIN_LOCKED: ModuleId[] = ['users', 'access', 'settings'];

export const isLocked = (role: Role, id: ModuleId) => ALWAYS_ON.includes(id) || (role === 'ADMIN' && ADMIN_LOCKED.includes(id));

export const DEFAULT_ROLE_MODULES: Record<Role, ModuleId[]> = {
  // Admin runs the portal; business modules are not granted automatically.
  ADMIN: ['dashboard', 'users', 'access', 'workflow', 'settings', 'customers', 'offers', 'announcements', 'messages', 'assistant', 'notifications'],
  SUPERVISOR: ['dashboard', 'approvals', 'quotes', 'requests', 'orders', 'deliveries', 'collections', 'workflow', 'purchase_requests', 'purchase_orders', 'suppliers', 'inventory', 'consignment', 'transfers', 'customers', 'team', 'offers', 'announcements', 'messages', 'assistant', 'notifications'],
  SALES_REP: ['dashboard', 'customers', 'collections', 'follow_ups', 'performance', 'new_order', 'catalog', 'quick_order', 'cart', 'quotes', 'requests', 'orders', 'deliveries', 'inventory', 'consignment', 'transfers', 'offers', 'announcements', 'messages', 'assistant', 'notifications'],
  SUPPLIER: ['dashboard', 'supplier_catalog', 'purchase_requests', 'purchase_orders', 'announcements', 'messages', 'assistant', 'notifications'],
  CUSTOMER_B2B: ['dashboard', 'catalog', 'quick_order', 'cart', 'quotes', 'requests', 'orders', 'consignment', 'invoices', 'account', 'offers', 'announcements', 'messages', 'assistant', 'notifications'],
  CUSTOMER_B2C: ['dashboard', 'catalog', 'cart', 'requests', 'orders', 'invoices', 'account', 'offers', 'messages', 'assistant', 'notifications'],
};

/** Normalise a stored assignment: drop unknown ids and re-add the locked ones. */
export function normaliseModules(role: Role, ids: string[] | undefined): ModuleId[] {
  const known = new Set<string>(MODULE_IDS);
  const set = new Set((ids ?? DEFAULT_ROLE_MODULES[role]).filter((id): id is ModuleId => known.has(id as ModuleId)));
  MODULE_IDS.forEach((id) => { if (isLocked(role, id)) set.add(id); });
  return MODULE_IDS.filter((id) => set.has(id));
}

