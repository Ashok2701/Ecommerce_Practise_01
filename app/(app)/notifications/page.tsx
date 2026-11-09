'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, Package, Truck, ClipboardCheck, BadgePercent, Megaphone, MessageSquare, CheckCircle2, BellRing } from 'lucide-react';
import { toast } from 'sonner';
import { useNotifications } from '@/lib/notifications/useNotifications';
import { fmtDateTime, timeAgo } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { PageHeader, EmptyState, LoadingState } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const ICON = { order_new: Package, order_confirmed: CheckCircle2, order_dispatched: Truck, approval_required: ClipboardCheck, offer: BadgePercent, announcement: Megaphone, message: MessageSquare };
const TONE = { order_new: 'bg-blue-50 text-blue-700', order_confirmed: 'bg-emerald-50 text-emerald-700', order_dispatched: 'bg-sky-50 text-sky-700', approval_required: 'bg-amber-50 text-amber-700', offer: 'bg-emerald-50 text-emerald-700', announcement: 'bg-violet-50 text-violet-700', message: 'bg-slate-100 text-slate-700' };

export default function NotificationsPage() {
  const { t } = useT();
  const n = useNotifications();
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const rows = n.items.filter((x) => filter === 'all' || !x.read);
  const enablePush = async () => {
    if (!('Notification' in window)) return toast.error(t('notifications.pushUnsupported'));
    const p = await Notification.requestPermission();
    toast[p === 'granted' ? 'success' : 'info'](p === 'granted' ? t('notifications.pushGranted') : t('notifications.pushState', { state: p }));
  };
  return (
    <div>
      <PageHeader title={t('notifications.title')} description={t('notifications.unread', { count: n.unread })} actions={<><Button variant="outline" onClick={enablePush}><BellRing className="me-2 h-4 w-4" />{t('notifications.enablePush')}</Button><Button variant="outline" onClick={() => n.markAllRead()} disabled={!n.unread} data-testid="mark-all-read"><CheckCheck className="me-2 h-4 w-4" />{t('common.markAllRead')}</Button></>} />
      <div className="mb-4 flex gap-1.5" role="tablist">{(['all', 'unread'] as const).map((k) => <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={cn('rounded-md border px-3 py-1.5 text-xs font-medium', filter === k ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground')}>{k === 'all' ? t('common.all') : t('notifications.unreadTab')}</button>)}</div>
      {n.isLoading ? <LoadingState /> : !rows.length ? <EmptyState icon={Bell} title={t('notifications.emptyTitle')} description={t('notifications.emptyText')} /> : (
        <Card className="divide-y" data-testid="notifications-list">
          {rows.map((x) => { const I = ICON[x.type]; return (
            <button key={x.id} onClick={() => { n.markRead(x.id); if (x.href) router.push(x.href); }} className={cn('flex w-full items-start gap-3 p-4 text-start hover:bg-muted/40', !x.read && 'bg-accent/30')}>
              <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', TONE[x.type])}><I className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-sm font-medium">{x.title}{!x.read && <span className="h-2 w-2 rounded-full bg-primary" aria-label={t('notifications.unreadTab')} />}</span><span className="block text-sm text-muted-foreground">{x.body}</span></span>
              <span className="shrink-0 text-xs text-muted-foreground" title={fmtDateTime(x.at)}>{timeAgo(x.at)}</span>
            </button>
          ); })}
        </Card>
      )}
    </div>
  );
}
