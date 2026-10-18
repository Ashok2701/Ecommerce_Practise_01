import {
  LayoutDashboard, Users, Building2, ClipboardCheck, Package, ShoppingCart, FileText, Wallet, Megaphone, BadgePercent, MessageSquare,
  Bell, Sparkles, UserSquare2, CalendarCheck, TrendingUp, Settings, PlusCircle, Boxes, Zap, KeyRound, type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/types/domain';

/**
 * Module access (YES/NO per role)
 * --------------------------------
 * A module is a menu item plus the pages under it. A role either has a module
 * or it doesn't — no separate create/edit/delete flags. The admin changes the
 * assignments on the Module access screen; these are the defaults.
 *
 * The backend must enforce the same assignments on every API call. Hiding a
 * menu here is for convenience only, never security.
 */
export type ModuleId =
  | 'dashboard' | 'catalog' | 'quick_order' | 'cart' | 'orders' | 'new_order' | 'invoices' | 'account' | 'offers'
  | 'customers' | 'approvals' | 'team' | 'follow_ups' | 'performance'
  | 'announcements' | 'messages' | 'assistant' | 'notifications'
  | 'users' | 'access' | 'settings';

export type ModuleGroup = 'overview' | 'commerce' | 'operations' | 'engage' | 'admin';

export interface ModuleDef {
  id: ModuleId;
  /** Translation key for the menu label. */
  label: string;
  icon: LucideIcon;
  group: ModuleGroup;
  /** Routes this module owns. The longest matching prefix wins. */
  routes: string[];
  /** Shown in the menu (notifications live in the header bell instead). */
  inNav?: boolean;
  badge?: 'cart' | 'messages' | 'approvals';
}

/** Catalogue in menu order. */
export const MODULES: ModuleDef[] = [
  { id: 'dashboard', label: 'nav.dashboard', icon: LayoutDashboard, group: 'overview', routes: ['/dashboard'] },
  { id: 'approvals', label: 'nav.approvals', icon: ClipboardCheck, group: 'overview', routes: ['/approvals'], badge: 'approvals' },
  { id: 'customers', label: 'nav.customers', icon: Building2, group: 'operations', routes: ['/customers'] },
  { id: 'follow_ups', label: 'nav.followUps', icon: CalendarCheck, group: 'operations', routes: ['/follow-ups'] },
  { id: 'performance', label: 'nav.performance', icon: TrendingUp, group: 'operations', routes: ['/performance'] },
  { id: 'team', label: 'nav.salesReps', icon: UserSquare2, group: 'operations', routes: ['/sales-reps'] },
  { id: 'new_order', label: 'nav.newOrder', icon: PlusCircle, group: 'commerce', routes: ['/orders/new'] },
  { id: 'catalog', label: 'nav.catalog', icon: Boxes, group: 'commerce', routes: ['/catalog'] },
  { id: 'quick_order', label: 'nav.quickOrder', icon: Zap, group: 'commerce', routes: ['/quick-order'] },
  { id: 'cart', label: 'nav.cart', icon: ShoppingCart, group: 'commerce', routes: ['/cart', '/checkout'], badge: 'cart' },
  { id: 'orders', label: 'nav.orders', icon: Package, group: 'commerce', routes: ['/orders'] },
  { id: 'invoices', label: 'nav.invoices', icon: FileText, group: 'commerce', routes: ['/invoices'] },
  { id: 'account', label: 'nav.account', icon: Wallet, group: 'commerce', routes: ['/account'] },
  { id: 'offers', label: 'nav.offers', icon: BadgePercent, group: 'engage', routes: ['/offers'] },
  { id: 'announcements', label: 'nav.announcements', icon: Megaphone, group: 'engage', routes: ['/announcements'] },
  { id: 'messages', label: 'nav.messages', icon: MessageSquare, group: 'engage', routes: ['/messages'], badge: 'messages' },
  { id: 'assistant', label: 'nav.assistant', icon: Sparkles, group: 'engage', routes: ['/assistant'] },
  { id: 'notifications', label: 'nav.notifications', icon: Bell, group: 'engage', routes: ['/notifications'], inNav: false },
  { id: 'users', label: 'nav.users', icon: Users, group: 'admin', routes: ['/users'] },
  { id: 'access', label: 'nav.access', icon: KeyRound, group: 'admin', routes: ['/access'] },
  { id: 'settings', label: 'nav.settings', icon: Settings, group: 'admin', routes: ['/settings'] },
];

export const GROUP_ORDER: ModuleGroup[] = ['overview', 'operations', 'commerce', 'engage', 'admin'];

/** Every role always has these. */
export const ALWAYS_ON: ModuleId[] = ['dashboard', 'notifications'];
/** ADMIN can never lose these, so nobody gets locked out of administration. */
export const ADMIN_LOCKED: ModuleId[] = ['users', 'access', 'settings'];

export const isLocked = (role: Role, id: ModuleId) => ALWAYS_ON.includes(id) || (role === 'ADMIN' && ADMIN_LOCKED.includes(id));

export const DEFAULT_ROLE_MODULES: Record<Role, ModuleId[]> = {
  // Admin runs the portal; business modules are not granted automatically.
  ADMIN: ['dashboard', 'users', 'access', 'settings', 'customers', 'announcements', 'messages', 'assistant', 'notifications'],
  SUPERVISOR: ['dashboard', 'approvals', 'orders', 'customers', 'team', 'offers', 'announcements', 'messages', 'assistant', 'notifications'],
  SALES_REP: ['dashboard', 'customers', 'follow_ups', 'performance', 'new_order', 'catalog', 'quick_order', 'cart', 'orders', 'offers', 'announcements', 'messages', 'assistant', 'notifications'],
  // Purchasing modules (purchase orders, pickup requests, receipts) join here when they are built.
  SUPPLIER: ['dashboard', 'announcements', 'messages', 'assistant', 'notifications'],
  CUSTOMER_B2B: ['dashboard', 'catalog', 'quick_order', 'cart', 'orders', 'invoices', 'account', 'offers', 'announcements', 'messages', 'assistant', 'notifications'],
  CUSTOMER_B2C: ['dashboard', 'catalog', 'cart', 'orders', 'invoices', 'account', 'offers', 'messages', 'assistant', 'notifications'],
};

/** Preferred mobile bottom-bar items per role (the first four the role can use are shown). */
export const BOTTOM_PREFERENCE: Record<Role, ModuleId[]> = {
  ADMIN: ['dashboard', 'users', 'access', 'messages', 'customers'],
  SUPERVISOR: ['dashboard', 'approvals', 'orders', 'messages', 'customers'],
  SALES_REP: ['dashboard', 'customers', 'new_order', 'orders', 'catalog'],
  SUPPLIER: ['dashboard', 'messages', 'announcements', 'assistant'],
  CUSTOMER_B2B: ['dashboard', 'catalog', 'cart', 'orders', 'invoices'],
  CUSTOMER_B2C: ['dashboard', 'catalog', 'cart', 'orders', 'account'],
};

/** Normalise a stored assignment: drop unknown ids and re-add the locked ones. */
export function normaliseModules(role: Role, ids: string[] | undefined): ModuleId[] {
  const known = new Set(MODULES.map((m) => m.id));
  const set = new Set((ids ?? DEFAULT_ROLE_MODULES[role]).filter((id): id is ModuleId => known.has(id as ModuleId)));
  MODULES.forEach((m) => { if (isLocked(role, m.id)) set.add(m.id); });
  return MODULES.map((m) => m.id).filter((id) => set.has(id));
}

/** Which module owns a path (longest route prefix wins), or undefined. */
export function moduleForPath(path: string): ModuleDef | undefined {
  let best: { m: ModuleDef; len: number } | undefined;
  for (const m of MODULES) for (const r of m.routes) {
    if ((path === r || path.startsWith(r + '/')) && (!best || r.length > best.len)) best = { m, len: r.length };
  }
  return best?.m;
}
