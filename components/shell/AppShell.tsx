'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, Search, Menu, LogOut, Globe, WifiOff, Wifi, RotateCcw, Sparkles, CheckCheck, UserCircle2, Building2, SunMoon } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { Logo } from '@/components/brand/Logo';
import { SiteSwitcher } from '@/components/preferences/SiteSwitcher';
import { useTheme } from 'next-themes';
import { useAuth, useUser } from '@/lib/auth/AuthProvider';
import { useAccess, type NavItem } from '@/lib/auth/permissions';
import { useCart } from '@/lib/cart/CartProvider';
import { useUI } from '@/lib/ui/UIProvider';
import { useNotifications } from '@/lib/notifications/useNotifications';
import { messageService, orderService, productService, customerService } from '@/lib/services';
import { resetDb } from '@/lib/data/mockDb';
import { initials, timeAgo } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuCheckboxItem } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { AssistantPanel } from '@/components/assistant/AssistantPanel';
import { isCustomerRole } from '@/types/domain';

export { Logo } from '@/components/brand/Logo';

function useBadges() {
  const user = useUser();
  const cart = useCart();
  const access = useAccess(user.role);
  const conv = useQuery({ queryKey: ['conversations', user.id], queryFn: () => messageService.listConversations(user), refetchInterval: 20000 });
  const appr = useQuery({ queryKey: ['orders', { status: 'pending_approval' }], queryFn: () => orderService.getOrders({ status: 'pending_approval' }), enabled: access.can('approvals') });
  return { cart: cart.count, messages: (conv.data ?? []).filter((c) => c.unreadBy.includes(user.id)).length, approvals: appr.data?.length ?? 0 } as Record<string, number>;
}

const isActive = (path: string, href: string) => (href === '/orders' ? path === '/orders' || (path.startsWith('/orders/') && path !== '/orders/new') : path === href || path.startsWith(href + '/'));

function Sidebar() {
  const { t } = useT();
  const user = useUser();
  const path = usePathname();
  const badges = useBadges();
  const access = useAccess(user.role);
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col border-r border-sidebar-border bg-sidebar md:flex lg:w-64" aria-label={t('shell.mainMenu')}>
      <div className="flex h-16 items-center px-4"><span className="lg:hidden"><Logo compact /></span><span className="hidden lg:block"><Logo /></span></div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-3 scrollbar-none lg:px-3">
        {access.nav.map((g) => (
          <div key={g.label}>
            <div className="mb-1.5 hidden px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 lg:block">{t(g.label)}</div>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const active = isActive(path, it.href);
                const count = it.badge ? badges[it.badge] : 0;
                return (
                  <li key={it.href}>
                    <Link href={it.href} title={t(it.label)} data-testid={`nav-${it.href.slice(1).replace('/', '-')}`} aria-current={active ? 'page' : undefined}
                      className={cn('group relative flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors', active ? 'bg-sidebar-accent text-white' : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-white')}>
                      {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-sidebar-primary" />}
                      <it.icon className="h-[18px] w-[18px] shrink-0" />
                      <span className="hidden flex-1 truncate lg:inline">{t(it.label)}</span>
                      {count > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-sidebar-primary px-1 text-[10px] font-semibold text-white lg:static lg:h-5 lg:min-w-5">{count}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="hidden border-t border-sidebar-border p-3 lg:block">
        <div className="rounded-md bg-sidebar-accent/60 p-3 text-xs text-sidebar-foreground">
          <div className="font-medium text-white">{t(`roles.${user.role}`)}</div>
          <div className="mt-0.5 truncate">{user.region ?? user.title}</div>
        </div>
      </div>
    </aside>
  );
}

function BottomNav({ onMore }: { onMore: () => void }) {
  const { t } = useT();
  const user = useUser();
  const path = usePathname();
  const badges = useBadges();
  const access = useAccess(user.role);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur pb-safe md:hidden" aria-label={t('shell.bottomNav')}>
      <ul className="grid grid-cols-5">
        {access.bottom.map((it: NavItem) => {
          const active = isActive(path, it.href);
          const count = it.badge ? badges[it.badge] : 0;
          return (
            <li key={it.href}>
              <Link href={it.href} data-testid={`bnav-${it.href.slice(1).replace('/', '-')}`} aria-current={active ? 'page' : undefined} className={cn('relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium', active ? 'text-primary' : 'text-muted-foreground')}>
                <span className="relative"><it.icon className="h-5 w-5" />{count > 0 && <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-white">{count}</span>}</span>
                {t(it.label)}
              </Link>
            </li>
          );
        })}
        <li><button onClick={onMore} data-testid="bnav-more" className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground"><Menu className="h-5 w-5" />{t('nav.more')}</button></li>
      </ul>
    </nav>
  );
}

function MoreSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useT();
  const user = useUser();
  const path = usePathname();
  const access = useAccess(user.role);
  useEffect(() => onOpenChange(false), [path]); // eslint-disable-line
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-xl">
        <SheetHeader><SheetTitle className="text-left">{t('nav.more')}</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-4">
          {access.nav.map((g) => (
            <div key={g.label}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t(g.label)}</div>
              <div className="grid grid-cols-3 gap-2">
                {g.items.map((it) => (
                  <Link key={it.href} href={it.href} className={cn('flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center text-xs font-medium', isActive(path, it.href) ? 'border-primary bg-accent text-accent-foreground' : 'bg-card')}>
                    <it.icon className="h-5 w-5" />{t(it.label)}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function NotificationBell() {
  const { t } = useT();
  const router = useRouter();
  const n = useNotifications();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t('shell.notificationsUnread', { count: n.unread })} data-testid="notification-bell">
          <Bell className="h-5 w-5" />
          {n.unread > 0 && <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white" data-testid="notification-count">{n.unread}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">{t('nav.notifications')}</span>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => n.markAllRead()} disabled={!n.unread}><CheckCheck className="mr-1 h-3.5 w-3.5" />{t('common.markAllRead')}</Button>
        </div>
        <ul className="max-h-96 divide-y overflow-y-auto">
          {n.items.slice(0, 8).map((x) => (
            <li key={x.id}>
              <button className={cn('flex w-full gap-3 px-4 py-3 text-left hover:bg-muted/50', !x.read && 'bg-accent/40')} onClick={() => { n.markRead(x.id); if (x.href) router.push(x.href); }}>
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', x.read ? 'bg-transparent' : 'bg-primary')} />
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{x.title}</span><span className="block truncate text-xs text-muted-foreground">{x.body}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{timeAgo(x.at)}</span></span>
              </button>
            </li>
          ))}
          {!n.items.length && <li className="px-4 py-8 text-center text-sm text-muted-foreground">{t('shell.noNotifications')}</li>}
        </ul>
        <Link href="/notifications" className="block border-t px-4 py-2.5 text-center text-sm font-medium text-primary hover:bg-muted/50">{t('common.viewAll')}</Link>
      </PopoverContent>
    </Popover>
  );
}

function UserMenu() {
  const { t, locale, setLocale, languages } = useT();
  const { theme, setTheme } = useTheme();
  const { logout } = useAuth();
  const user = useUser();
  const router = useRouter();
  const ui = useUI();
  const access = useAccess(user.role);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-md p-1 hover:bg-muted" aria-label={t('shell.accountMenu')} data-testid="user-menu">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials(user.name)}</span>
          <span className="hidden text-left leading-tight xl:block"><span className="block text-sm font-medium">{user.name}</span><span className="block text-[11px] text-muted-foreground">{t(`roles.${user.role}`)}</span></span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal"><div className="text-sm font-medium">{user.name}</div><div className="truncate text-xs text-muted-foreground">{user.email}</div></DropdownMenuLabel>
        <DropdownMenuSeparator />
        {access.can('account') && <DropdownMenuItem onClick={() => router.push('/account')}><Building2 className="mr-2 h-4 w-4" />{t('shell.companyAccount')}</DropdownMenuItem>}
        <DropdownMenuItem onClick={() => router.push('/notifications')}><UserCircle2 className="mr-2 h-4 w-4" />{t('nav.notifications')}</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><Globe className="mr-2 h-4 w-4" />{t('common.language')}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {languages.map((l) => (
              <DropdownMenuCheckboxItem key={l.code} checked={locale === l.code} onCheckedChange={() => setLocale(l.code)} lang={l.code} dir={l.dir}>{l.label}</DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><SunMoon className="mr-2 h-4 w-4" />{t('theme.label')}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {(['light', 'dark', 'system'] as const).map((v) => (
              <DropdownMenuCheckboxItem key={v} checked={theme === v} onCheckedChange={() => setTheme(v)}>{t(`theme.${v}`)}</DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuCheckboxItem checked={ui.simulateOffline} onCheckedChange={(v) => ui.setSimulateOffline(!!v)} data-testid="toggle-offline"><WifiOff className="mr-2 h-4 w-4" />{t('common.simulateOffline')}</DropdownMenuCheckboxItem>
        <DropdownMenuItem onClick={() => { resetDb(); toast.success(t('shell.demoReset')); setTimeout(() => window.location.reload(), 400); }}><RotateCcw className="mr-2 h-4 w-4" />{t('common.resetDemo')}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => { logout(); router.replace('/login'); }} data-testid="logout"><LogOut className="mr-2 h-4 w-4" />{t('common.signOut')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useT();
  const user = useUser();
  const router = useRouter();
  const access = useAccess(user.role);
  const products = useQuery({ queryKey: ['products', 'all'], queryFn: productService.getAll, enabled: open && access.can('catalog') });
  const customers = useQuery({ queryKey: ['customers', user.role === 'SALES_REP' ? user.id : 'all'], queryFn: () => customerService.getCustomers(user.role === 'SALES_REP' ? { salesRepId: user.id } : {}), enabled: open && access.can('customers') });
  const orders = useQuery({ queryKey: ['orders', 'search', user.id], queryFn: () => orderService.getOrders(isCustomerRole(user.role) ? { customerId: user.customerId } : user.role === 'SALES_REP' ? { salesRepId: user.id } : {}), enabled: open && access.can('orders') });
  const go = (href: string) => { onOpenChange(false); router.push(href); };
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={t('common.searchPlaceholder')} data-testid="global-search-input" />
      <CommandList>
        <CommandEmpty>{t('common.noResults')}</CommandEmpty>
        <CommandGroup heading={t('shell.search.navigate')}>{access.nav.flatMap((g) => g.items).map((it) => <CommandItem key={it.href} value={`nav ${t(it.label)}`} onSelect={() => go(it.href)}><it.icon className="mr-2 h-4 w-4" />{t(it.label)}</CommandItem>)}</CommandGroup>
        {!!products.data?.length && <CommandGroup heading={t('shell.search.products')}>{products.data.map((p) => <CommandItem key={p.id} value={`${p.name} ${p.sku} ${p.brand}`} onSelect={() => go(`/catalog/${p.id}`)}><span className="truncate">{p.name}</span><span className="ml-auto font-mono text-[11px] text-muted-foreground">{p.sku}</span></CommandItem>)}</CommandGroup>}
        {!!customers.data?.length && <CommandGroup heading={t('shell.search.customers')}>{customers.data.map((c) => <CommandItem key={c.id} value={`${c.name} ${c.code} ${c.address.city}`} onSelect={() => go(`/customers/${c.id}`)}>{c.name}<span className="ml-auto text-[11px] text-muted-foreground">{c.address.city}</span></CommandItem>)}</CommandGroup>}
        {!!orders.data?.length && <CommandGroup heading={t('shell.search.orders')}>{orders.data.slice(0, 40).map((o) => <CommandItem key={o.id} value={`${o.number} ${o.customerName}`} onSelect={() => go(`/orders/${o.id}`)}><span className="font-mono text-xs">{o.number}</span><span className="ml-2 truncate text-muted-foreground">{o.customerName}</span></CommandItem>)}</CommandGroup>}
      </CommandList>
    </CommandDialog>
  );
}

function ConnectivityPill() {
  const { t } = useT();
  const ui = useUI();
  return (
    <span data-testid="connectivity-status" className={cn('hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex', ui.online ? 'bg-accent text-accent-foreground' : 'bg-signal/15 text-signal-foreground dark:text-signal')}>
      {ui.online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}{ui.online ? t('common.online') : t('common.offline')}
    </span>
  );
}

function OfflineBanner() {
  const { t } = useT();
  const ui = useUI();
  if (ui.online) return null;
  return (
    <div role="status" className="flex items-center gap-2 border-b border-signal/30 bg-signal/10 px-4 py-2 text-xs text-signal-foreground dark:text-signal sm:text-sm" data-testid="offline-banner">
      <WifiOff className="h-4 w-4 shrink-0" />{t('offline.banner')}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  const ui = useUI();
  const [more, setMore] = useState(false);
  const [search, setSearch] = useState(false);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch((s) => !s); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-white">{t('shell.skipToContent')}</a>
      <Sidebar />
      <div className="md:pl-16 lg:pl-64">
        <header className="sticky top-0 z-20 border-b bg-card/90 backdrop-blur">
          <div className="flex h-14 items-center gap-2 px-4 sm:h-16 sm:px-6">
            <div className="md:hidden"><Logo compact onDark={false} /></div>
            <button onClick={() => setSearch(true)} data-testid="global-search" className="ml-1 flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground hover:border-primary/40 md:ml-0 md:max-w-md">
              <Search className="h-4 w-4" /><span className="truncate">{t('common.searchPlaceholder')}</span>
              <kbd className="ml-auto hidden rounded border bg-muted px-1.5 text-[10px] font-medium lg:inline">{t('shell.searchShortcut')}</kbd>
            </button>
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              <SiteSwitcher />
              <ConnectivityPill />
              <NotificationBell />
              <UserMenu />
            </div>
          </div>
          <OfflineBanner />
        </header>
        <main id="main" className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-5 sm:px-6 md:pb-10 lg:pt-6">{children}</main>
      </div>
      <BottomNav onMore={() => setMore(true)} />
      <MoreSheet open={more} onOpenChange={setMore} />
      <GlobalSearch open={search} onOpenChange={setSearch} />
      <button onClick={() => ui.setAssistantOpen(true)} data-testid="ai-fab" aria-label={t('nav.assistant')}
        className="fixed bottom-20 right-4 z-30 flex h-12 items-center gap-2 rounded-full bg-sidebar px-4 text-sm font-medium text-white shadow-lg ring-1 ring-white/10 transition hover:bg-sidebar-accent md:bottom-6 md:right-6">
        <Sparkles className="h-4 w-4 text-[hsl(var(--sidebar-primary))]" /><span className="hidden sm:inline">{t('shell.askAi')}</span>
      </button>
      <Sheet open={ui.assistantOpen} onOpenChange={ui.setAssistantOpen}>
        <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="sr-only"><SheetTitle>{t('assistant.title')}</SheetTitle></SheetHeader>
          <AssistantPanel />
        </SheetContent>
      </Sheet>
    </div>
  );
}
