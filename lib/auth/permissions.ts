import type { Role } from '@/types/domain';
import {
  LayoutDashboard, Users, Building2, ClipboardCheck, Package, ShoppingCart, FileText, Wallet, Megaphone, BadgePercent, MessageSquare,
  Bell, Sparkles, UserSquare2, CalendarCheck, TrendingUp, Settings, PlusCircle, Boxes, type LucideIcon,
} from 'lucide-react';

/** Route-level access control. Backend will enforce the same rules on every API call. */
const ACCESS: [string, Role[]][] = [
  ['/dashboard', ['admin', 'manager', 'sales', 'customer']],
  ['/users', ['admin']],
  ['/settings', ['admin']],
  ['/customers', ['admin', 'manager', 'sales']],
  ['/approvals', ['manager', 'admin']],
  ['/sales-reps', ['manager', 'admin']],
  ['/orders/new', ['sales']],
  ['/orders', ['admin', 'manager', 'sales', 'customer']],
  ['/catalog', ['sales', 'customer']],
  ['/cart', ['sales', 'customer']],
  ['/checkout', ['sales', 'customer']],
  ['/invoices', ['customer']],
  ['/account', ['customer']],
  ['/follow-ups', ['sales']],
  ['/performance', ['sales']],
  ['/announcements', ['admin', 'manager', 'sales', 'customer']],
  ['/offers', ['admin', 'manager', 'sales', 'customer']],
  ['/messages', ['admin', 'manager', 'sales', 'customer']],
  ['/notifications', ['admin', 'manager', 'sales', 'customer']],
  ['/assistant', ['admin', 'manager', 'sales', 'customer']],
];

export function canAccess(path: string, role: Role) {
  const rule = ACCESS.find(([p]) => path === p || path.startsWith(p + '/'));
  return rule ? rule[1].includes(role) : false;
}

export const canManageContent = (role?: Role) => role === 'admin' || role === 'manager';

export interface NavItem { href: string; label: string; icon: LucideIcon; badge?: 'cart' | 'messages' | 'approvals'; }
export interface NavGroup { label: string; items: NavItem[]; }

const I = {
  dash: { href: '/dashboard', label: 'nav.dashboard', icon: LayoutDashboard },
  users: { href: '/users', label: 'nav.users', icon: Users },
  customers: { href: '/customers', label: 'nav.customers', icon: Building2 },
  myCustomers: { href: '/customers', label: 'nav.myCustomers', icon: Building2 },
  approvals: { href: '/approvals', label: 'nav.approvals', icon: ClipboardCheck, badge: 'approvals' as const },
  orders: { href: '/orders', label: 'nav.orders', icon: Package },
  newOrder: { href: '/orders/new', label: 'nav.newOrder', icon: PlusCircle },
  catalog: { href: '/catalog', label: 'nav.catalog', icon: Boxes },
  cart: { href: '/cart', label: 'nav.cart', icon: ShoppingCart, badge: 'cart' as const },
  invoices: { href: '/invoices', label: 'nav.invoices', icon: FileText },
  account: { href: '/account', label: 'nav.account', icon: Wallet },
  ann: { href: '/announcements', label: 'nav.announcements', icon: Megaphone },
  offers: { href: '/offers', label: 'nav.offers', icon: BadgePercent },
  messages: { href: '/messages', label: 'nav.messages', icon: MessageSquare, badge: 'messages' as const },
  notif: { href: '/notifications', label: 'nav.notifications', icon: Bell },
  ai: { href: '/assistant', label: 'nav.assistant', icon: Sparkles },
  reps: { href: '/sales-reps', label: 'nav.salesReps', icon: UserSquare2 },
  follow: { href: '/follow-ups', label: 'nav.followUps', icon: CalendarCheck },
  perf: { href: '/performance', label: 'nav.performance', icon: TrendingUp },
  settings: { href: '/settings', label: 'nav.settings', icon: Settings },
} satisfies Record<string, NavItem>;

export const NAV: Record<Role, NavGroup[]> = {
  admin: [
    { label: 'nav.groups.overview', items: [I.dash, I.orders, I.approvals] },
    { label: 'nav.groups.admin', items: [I.users, I.customers, I.reps, I.settings] },
    { label: 'nav.groups.engage', items: [I.ann, I.offers, I.messages, I.ai] },
  ],
  manager: [
    { label: 'nav.groups.overview', items: [I.dash, I.approvals, I.orders] },
    { label: 'nav.groups.operations', items: [I.reps, I.customers] },
    { label: 'nav.groups.engage', items: [I.ann, I.offers, I.messages, I.ai] },
  ],
  sales: [
    { label: 'nav.groups.overview', items: [I.dash, I.myCustomers, I.follow, I.perf] },
    { label: 'nav.groups.commerce', items: [I.newOrder, I.catalog, I.cart, I.orders] },
    { label: 'nav.groups.engage', items: [I.messages, I.ann, I.offers, I.ai] },
  ],
  customer: [
    { label: 'nav.groups.overview', items: [I.dash, I.catalog, I.cart, I.orders] },
    { label: 'nav.groups.commerce', items: [I.invoices, I.account] },
    { label: 'nav.groups.engage', items: [I.offers, I.ann, I.messages, I.ai] },
  ],
};

/** Bottom navigation on mobile (4 primary + More). */
export const BOTTOM_NAV: Record<Role, NavItem[]> = {
  admin: [I.dash, I.users, I.customers, I.messages],
  manager: [I.dash, I.approvals, I.orders, I.messages],
  sales: [I.dash, I.myCustomers, I.newOrder, I.orders],
  customer: [{ ...I.dash, label: 'nav.home' }, I.catalog, I.cart, I.orders],
};
