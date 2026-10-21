'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Pin } from 'lucide-react';
import { announcementService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { canManageContent } from '@/lib/auth/permissions';
import { useT } from '@/lib/i18n';
import { fmtDate } from '@/lib/format';
import { QueryView, LoadingState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Card } from '@/components/ui/card';
import { BackLink } from '@/features/detail/DetailBits';

export default function AnnouncementPage() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const user = useUser();
  const manage = canManageContent(user.role);
  const q = useQuery({
    queryKey: ['announcement', id],
    queryFn: async () => {
      const a = await announcementService.get(id);
      // people only see announcements published for them; managers see everything
      if (!manage && (a.status !== 'published' || !(a.audience.includes('all') || a.audience.includes(user.role)))) throw new Error('errors.notFound');
      return a;
    },
  });
  return (
    <div>
      <BackLink href="/announcements" label={t('nav.announcements')} />
      <QueryView query={q} loading={<LoadingState variant="detail" />}>
        {(a) => (
          <Card className="mx-auto max-w-3xl p-6">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded bg-muted px-1.5 py-0.5 font-medium">{t(`announcements.category.${a.category}`)}</span>
              {a.pinned && <span className="flex items-center gap-1"><Pin className="h-3 w-3" aria-hidden="true" />{t('announcements.pinned')}</span>}
              {a.status === 'scheduled' ? <span className="flex items-center gap-1"><CalendarClock className="h-3 w-3" aria-hidden="true" />{t('announcements.scheduledFor', { date: fmtDate(a.publishAt) })}</span> : <span>{fmtDate(a.publishAt)}</span>}
              <span>· {a.createdBy}</span>
              {manage && <StatusBadge status={a.status} />}
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight" data-testid="ann-title-detail">{a.title}</h1>
            <div className="mt-4 whitespace-pre-line text-[15px] leading-relaxed">{a.body}</div>
            {manage && <p className="mt-6 border-t pt-4 text-xs text-muted-foreground">{t('announcements.audience')}: {a.audience.includes('all') ? t('announcements.everyone') : a.audience.map((r) => t(`roles.${r}`)).join(', ')}</p>}
          </Card>
        )}
      </QueryView>
    </div>
  );
}
