'use client';
import { useUser } from '@/lib/auth/AuthProvider';
import { useAccess } from '@/lib/auth/permissions';
import type { ModuleId } from '@/lib/access/modules';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Building2, UserCheck, Clock, Package, Hourglass, IndianRupee, MessageSquare, ShoppingCart, User, CreditCard, ClipboardCheck } from 'lucide-react';
import { dashboardService } from '@/lib/services';
import { useT } from '@/lib/i18n';
import { fmtCompactMoney, fmtMoney, fmtDate, timeAgo } from '@/lib/format';
import { PageHeader, KpiCard, SectionCard, LoadingState, QueryView } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { SalesAreaChart, DonutChart, HBarChart } from '@/components/charts';
import { Button } from '@/components/ui/button';
import type { ActivityItem, Order } from '@/types/domain';

const ACT_ICON = { order: ShoppingCart, user: User, payment: CreditCard, message: MessageSquare, approval: ClipboardCheck, customer: Building2 };

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <ul className="divide-y">
      {items.map((a) => { const I = ACT_ICON[a.kind]; return (
        <li key={a.id} className="flex gap-3 px-4 py-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted"><I className="h-4 w-4 text-muted-foreground" /></span>
          <div className="min-w-0 text-sm"><p><span className="font-medium">{a.actor}</span> <span className="text-muted-foreground">{a.text}</span></p><p className="text-xs text-muted-foreground">{timeAgo(a.at)}</p></div></li>
      ); })}
    </ul>
  );
}

export function OrderMiniList({ orders }: { orders: Order[] }) {
  return (
    <ul className="divide-y">
      {orders.map((o) => (
        <li key={o.id}><Link href={`/orders/${o.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="font-mono text-xs font-medium">{o.number}</span><StatusBadge status={o.status} /></div><div className="truncate text-xs text-muted-foreground">{o.customerName} · {fmtDate(o.date)}</div></div>
          <span className="text-sm font-medium tabular">{fmtMoney(o.total)}</span>
        </Link></li>
      ))}
    </ul>
  );
}

export function AdminDashboard() {
  const { t } = useT();
  const router = useRouter();
  const user = useUser();
  const access = useAccess(user.role);
  /** Only link to pages this role can open. */
  const go = (id: ModuleId, href: string) => (access.can(id) ? () => router.push(href) : undefined);
  const q = useQuery({ queryKey: ['dash', 'admin'], queryFn: dashboardService.getAdminDashboard });
  return (
    <div>
      <PageHeader eyebrow={t('nav.dashboard')} title={t('dashboard.admin')} description="Live view across customers, orders and users (mock data)." actions={<Button asChild variant="outline"><Link href="/users?status=pending">Review approvals</Link></Button>} />
      <QueryView query={q} loading={<LoadingState variant="kpis" />}>
        {(d) => (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard testId="kpi-total-customers" label="Total B2B customers" value={d.totalCustomers} icon={Building2} hint={`${d.activeCustomers} active`} onClick={go('customers', '/customers')} />
              <KpiCard label="Active customers" value={d.activeCustomers} icon={UserCheck} tone="success" trend={{ value: '2 this month', up: true }} />
              <KpiCard testId="kpi-pending-approvals" label="Pending user approvals" value={d.pendingApprovals} icon={Clock} tone="warning" onClick={go('users', '/users?status=pending')} hint="Awaiting review" />
              <KpiCard label="Total orders" value={d.totalOrders} icon={Package} hint="All time" onClick={go('orders', '/orders')} />
              <KpiCard label="Requests to review" value={d.pendingOrders} icon={Hourglass} tone="warning" onClick={go('approvals', '/approvals')} />
              <KpiCard label="Sales value (30 days)" value={fmtCompactMoney(d.salesValue)} icon={IndianRupee} tone="success" trend={{ value: '8.4%', up: true }} />
              <KpiCard label="Unread messages" value={d.unreadMessages} icon={MessageSquare} onClick={go('messages', '/messages')} />
              <KpiCard label="ERP sync status" value={<span className="text-base font-semibold text-emerald-600">Healthy</span>} icon={ClipboardCheck} tone="success" hint="Sage X3 · mock" />
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <SectionCard title="Sales – last 30 days" className="lg:col-span-2" bodyClassName="p-4"><SalesAreaChart data={d.trend} /></SectionCard>
              <SectionCard title="Orders by status (30 days)" bodyClassName="p-2"><DonutChart data={d.byStatus} name="status" value="count" labelFor={(s) => t(`status.${s}`)} /></SectionCard>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <SectionCard title="Recent activity" action={<span className="text-xs text-muted-foreground">Today</span>}><ActivityFeed items={d.activity} /></SectionCard>
              {access.can('orders') && <SectionCard title="Recent orders" action={<Link href="/orders" className="text-xs font-medium text-primary">{t('common.viewAll')}</Link>}><OrderMiniList orders={d.recentOrders} /></SectionCard>}
              <SectionCard title="Sales by category" bodyClassName="p-3"><HBarChart data={d.byCategory} x="category" y="sales" height={280} /></SectionCard>
            </div>
          </div>
        )}
      </QueryView>
    </div>
  );
}
