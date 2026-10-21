'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { userService } from '@/lib/services';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import type { User } from '@/types/domain';

/** Approve a pending login, or switch a user between active and inactive. */
export function UserStatusActions({ user: u }: { user: User }) {
  const { t } = useT();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (s: User['status']) => userService.setStatus(u.id, s),
    onSuccess: (x) => { qc.invalidateQueries(); toast.success(t('users.statusChanged', { name: x.name, status: t(`status.${x.status}`) })); },
  });
  return (
    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {u.status === 'pending' && <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700" onClick={() => m.mutate('active')} data-testid={`approve-user-${u.id}`}><CheckCircle2 className="me-1 h-3.5 w-3.5" aria-hidden="true" />{t('users.approve')}</Button>}
      {u.status === 'active' && <Button size="sm" variant="outline" className="h-8" onClick={() => m.mutate('inactive')} data-testid={`deactivate-user-${u.id}`}><UserX className="me-1 h-3.5 w-3.5" aria-hidden="true" />{t('users.deactivate')}</Button>}
      {u.status === 'inactive' && <Button size="sm" variant="outline" className="h-8" onClick={() => m.mutate('active')}><UserCheck className="me-1 h-3.5 w-3.5" aria-hidden="true" />{t('users.activate')}</Button>}
    </div>
  );
}
