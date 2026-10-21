'use client';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { useUser } from '@/lib/auth/AuthProvider';
import { useAccess } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils';

/** "‹ Back to list" link at the top of every detail page. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="me-1 h-4 w-4 rtl:rotate-180" aria-hidden="true" />{label}</Link>;
}

/** Label / value pairs in a responsive grid. Empty values are skipped. */
export function Facts({ items, cols = 2, className }: { items: [string, React.ReactNode][]; cols?: 1 | 2 | 3 | 4; className?: string }) {
  const grid = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[cols];
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-3 text-sm', grid, className)}>
      {items.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => (
        <div key={k} className="min-w-0"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="mt-0.5 break-words font-medium">{v}</dd></div>
      ))}
    </dl>
  );
}

/**
 * Link to another record's page when the user may open it; plain text otherwise.
 * Keeps every reference clickable without sending people to pages they can't see.
 */
export function RefLink({ href, children, className, testId }: { href: string; children: React.ReactNode; className?: string; testId?: string }) {
  const user = useUser();
  const { canPath } = useAccess(user.role);
  return canPath(href.split('?')[0])
    ? <Link href={href} className={cn('text-primary hover:underline', className)} data-testid={testId}>{children}</Link>
    : <span className={className}>{children}</span>;
}

/** Product name linking to the stock page for staff, or the catalog page for buyers. */
export function ProductRef({ id, name, className }: { id: string; name: string; className?: string }) {
  const user = useUser();
  const { canPath } = useAccess(user.role);
  const href = canPath(`/inventory/${id}`) ? `/inventory/${id}` : canPath(`/catalog/${id}`) ? `/catalog/${id}` : null;
  return href ? <Link href={href} className={cn('font-medium hover:text-primary hover:underline', className)}>{name}</Link> : <span className={cn('font-medium', className)}>{name}</span>;
}
