'use client';
import Link from 'next/link';
import { StatusBadge } from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common';

export interface DocRow { id: string; href: string; number: string; sub?: string; amount?: string; status?: string; extra?: React.ReactNode }

/** Compact clickable list of documents (orders, invoices, quotes …) used on detail pages. */
export function DocList({ rows, empty, testId }: { rows: DocRow[]; empty: string; testId?: string }) {
  if (!rows.length) return <div className="p-4"><EmptyState title={empty} /></div>;
  return (
    <ul className="divide-y" data-testid={testId}>
      {rows.map((r) => (
        <li key={r.id}><Link href={r.href} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/40">
          <div className="min-w-0"><div className="font-mono text-xs font-semibold">{r.number}</div>{r.sub && <div className="truncate text-xs text-muted-foreground">{r.sub}</div>}</div>
          <div className="flex shrink-0 items-center gap-3">{r.extra}{r.amount && <span className="font-medium tabular">{r.amount}</span>}{r.status && <StatusBadge status={r.status} />}</div>
        </Link></li>
      ))}
    </ul>
  );
}
