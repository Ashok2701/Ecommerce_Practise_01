'use client';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { CloudOff } from 'lucide-react';

const TONES: Record<string, string> = {
  pending_sync: 'bg-amber-50 text-amber-800 ring-amber-600/30 border-dashed',
  pending_approval: 'bg-amber-50 text-amber-800 ring-amber-600/25', pending: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  changes_requested: 'bg-orange-50 text-orange-800 ring-orange-600/25', on_hold: 'bg-orange-50 text-orange-800 ring-orange-600/25', partially_paid: 'bg-amber-50 text-amber-800 ring-amber-600/25', low_stock: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  confirmed: 'bg-blue-50 text-blue-700 ring-blue-600/25', scheduled: 'bg-blue-50 text-blue-700 ring-blue-600/25', open: 'bg-blue-50 text-blue-700 ring-blue-600/25', planned: 'bg-blue-50 text-blue-700 ring-blue-600/25',
  processing: 'bg-indigo-50 text-indigo-700 ring-indigo-600/25', checked_in: 'bg-indigo-50 text-indigo-700 ring-indigo-600/25',
  packed: 'bg-violet-50 text-violet-700 ring-violet-600/25',
  dispatched: 'bg-sky-50 text-sky-700 ring-sky-600/25',
  delivered: 'bg-emerald-50 text-emerald-700 ring-emerald-600/25', paid: 'bg-emerald-50 text-emerald-700 ring-emerald-600/25', active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/25',
  published: 'bg-emerald-50 text-emerald-700 ring-emerald-600/25', in_stock: 'bg-emerald-50 text-emerald-700 ring-emerald-600/25', done: 'bg-emerald-50 text-emerald-700 ring-emerald-600/25', completed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/25',
  cancelled: 'bg-slate-100 text-slate-600 ring-slate-500/20', inactive: 'bg-slate-100 text-slate-600 ring-slate-500/20', draft: 'bg-slate-100 text-slate-600 ring-slate-500/20', expired: 'bg-slate-100 text-slate-500 ring-slate-500/20', unpaid: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-600/25', overdue: 'bg-rose-50 text-rose-700 ring-rose-600/25', out_of_stock: 'bg-rose-50 text-rose-700 ring-rose-600/25',
};
const DOT: Record<string, string> = { delivered: 'bg-emerald-500', paid: 'bg-emerald-500', active: 'bg-emerald-500', in_stock: 'bg-emerald-500', published: 'bg-emerald-500', overdue: 'bg-rose-500', rejected: 'bg-rose-500', out_of_stock: 'bg-rose-500' };

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const { t } = useT();
  return (
    <span data-testid={`status-${status}`} className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[status] ?? 'bg-muted text-muted-foreground ring-border', className)}>
      {status === 'pending_sync' ? <CloudOff className="h-3 w-3" /> : <span className={cn('h-1.5 w-1.5 rounded-full bg-current opacity-70', DOT[status])} />}
      {t(`status.${status}`)}
    </span>
  );
}
