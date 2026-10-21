'use client';
import React, { useEffect, useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { AlertTriangle, Inbox, RefreshCw, type LucideIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

export function PageHeader({ title, description, actions, eyebrow }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{eyebrow}</div>}
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }: { icon?: LucideIcon; title?: string; description?: string; action?: React.ReactNode }) {
  const { t } = useT();
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card px-6 py-14 text-center" data-testid="empty-state">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted"><Icon className="h-5 w-5 text-muted-foreground" /></div>
      <h3 className="text-sm font-semibold">{title ?? t('common.noResults')}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description ?? t('common.noResultsHint')}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t, has } = useT();
  // service errors are translation keys (errors.*); anything else falls back to the generic hint
  const text = message && has(message) ? t(message) : t('common.errorHint');
  return (
    <div role="alert" className="flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-12 text-center">
      <AlertTriangle className="mb-3 h-6 w-6 text-destructive" />
      <h3 className="text-sm font-semibold">{t('common.error')}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      {onRetry && <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}><RefreshCw className="me-2 h-4 w-4" aria-hidden="true" />{t('common.retry')}</Button>}
    </div>
  );
}

export function LoadingState({ variant = 'list', rows = 5 }: { variant?: 'list' | 'cards' | 'kpis' | 'detail'; rows?: number }) {
  if (variant === 'kpis') return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-lg" />)}</div>;
  if (variant === 'cards') return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-64 rounded-lg" />)}</div>;
  if (variant === 'detail') return <div className="space-y-4"><Skeleton className="h-24 rounded-lg" /><div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-72 rounded-lg lg:col-span-2" /><Skeleton className="h-72 rounded-lg" /></div></div>;
  return <Card className="divide-y" aria-busy="true">{Array.from({ length: rows }).map((_, i) => <div key={i} className="flex items-center gap-4 p-4"><Skeleton className="h-9 w-9 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-1/3" /><Skeleton className="h-3 w-1/2" /></div><Skeleton className="h-6 w-20" /></div>)}</Card>;
}

/** Renders loading / error / empty / data branches for a react-query result. */
export function QueryView<T>({ query, children, loading, isEmpty, empty }: { query: UseQueryResult<T>; children: (data: T) => React.ReactNode; loading?: React.ReactNode; isEmpty?: (d: T) => boolean; empty?: React.ReactNode }) {
  if (query.isLoading) return <>{loading ?? <LoadingState />}</>;
  if (query.isError) {
    const message = (query.error as Error)?.message;
    // "not found" won't change on retry, so don't offer one
    return <ErrorState message={message} onRetry={/notFound$/.test(message ?? '') ? undefined : () => query.refetch()} />;
  }
  if (query.data === undefined) return null;
  if (isEmpty?.(query.data)) return <>{empty ?? <EmptyState />}</>;
  return <>{children(query.data)}</>;
}

export function KpiCard({ label, value, hint, icon: Icon, tone = 'default', trend, onClick, testId }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: LucideIcon; tone?: 'default' | 'warning' | 'danger' | 'success'; trend?: { value: string; up?: boolean }; onClick?: () => void; testId?: string }) {
  const toneCls = { default: 'bg-primary/10 text-primary', warning: 'bg-amber-100 text-amber-700', danger: 'bg-rose-100 text-rose-700', success: 'bg-emerald-100 text-emerald-700' }[tone];
  const Comp: any = onClick ? 'button' : 'div';
  return (
    <Card data-testid={testId} className={cn('p-4 text-left transition-colors', onClick && 'hover:border-primary/40 hover:bg-accent/30')}>
      <Comp onClick={onClick} className="w-full text-left focus-visible:outline-none">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground sm:text-sm">{label}</span>
          {Icon && <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', toneCls)}><Icon className="h-4 w-4" /></span>}
        </div>
        <div className="mt-1 text-xl font-semibold tracking-tight tabular sm:text-2xl">{value}</div>
        {(hint || trend) && (
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            {trend && <span className={cn('font-medium', trend.up ? 'text-emerald-600' : 'text-rose-600')}>{trend.up ? '▲' : '▼'} {trend.value}</span>}
            {hint}
          </div>
        )}
      </Comp>
    </Card>
  );
}

export function SectionCard({ title, action, children, className, bodyClassName }: { title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      <div className={bodyClassName}>{children}</div>
    </Card>
  );
}

export interface Column<T> { key: string; header: React.ReactNode; cell: (row: T) => React.ReactNode; className?: string; align?: 'left' | 'right' | 'center'; }

/** Table on md+, stacked cards on mobile. Client-side pagination. */
export function DataTable<T>({ columns, rows, rowKey, onRowClick, mobileCard, pageSize = 10, empty, testId }: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; mobileCard: (r: T) => React.ReactNode; pageSize?: number; empty?: React.ReactNode; testId?: string }) {
  const { t } = useT();
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [rows.length]);
  if (!rows.length) return <>{empty ?? <EmptyState />}</>;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const view = rows.slice((page - 1) * pageSize, page * pageSize);
  return (
    <div data-testid={testId}>
      <Card className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>{columns.map((c) => <th key={c.key} scope="col" className={cn('whitespace-nowrap px-4 py-2.5 font-medium', c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left', c.className)}>{c.header}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {view.map((r) => (
                <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn('transition-colors', onRowClick && 'cursor-pointer hover:bg-muted/40')}>
                  {columns.map((c) => <td key={c.key} className={cn('px-4 py-3 align-middle', c.align === 'right' ? 'text-right tabular' : c.align === 'center' ? 'text-center' : '', c.className)}>{c.cell(r)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="space-y-2 md:hidden">
        {view.map((r) => (
          <Card key={rowKey(r)} role={onRowClick ? 'button' : undefined} tabIndex={onRowClick ? 0 : undefined} onKeyDown={(e) => { if (onRowClick && e.key === 'Enter') onRowClick(r); }} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn('p-4', onRowClick && 'active:bg-muted/50')}>{mobileCard(r)}</Card>
        ))}
      </div>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
          <span className="tabular">{t('common.showing', { from: (page - 1) * pageSize + 1, to: Math.min(page * pageSize, rows.length), total: rows.length })}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 1} aria-label={t('common.previous')}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="flex items-center px-2 tabular">{page} / {pages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page === pages} aria-label={t('common.next')}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
