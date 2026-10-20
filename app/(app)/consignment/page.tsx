'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, MapPin, PackageOpen } from 'lucide-react';
import { consignmentService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useSite } from '@/lib/sites/SiteProvider';
import { useT } from '@/lib/i18n';
import { fmtNumber } from '@/lib/format';
import { PageHeader, QueryView, EmptyState } from '@/components/common';
import { Card } from '@/components/ui/card';
import { isCustomerRole } from '@/types/domain';

/** Consignment stock: customers see theirs, staff see every consignment at the site. */
export default function ConsignmentListPage() {
  const { t } = useT();
  const user = useUser();
  const { site } = useSite();
  const customer = isCustomerRole(user.role);
  const scope = customer ? { customerId: user.customerId } : {};
  const q = useQuery({ queryKey: ['consignments', site, scope], queryFn: () => consignmentService.list(scope) });
  return (
    <div>
      <PageHeader title={t('consignment.title')} description={customer ? t('consignment.introCustomer') : t('consignment.introStaff', { site: site ?? '' })} />
      <QueryView query={q} loading={undefined}>
        {(list) => list.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="cons-list">
            {list.map((c) => {
              const low = c.lines.filter((l) => l.low).length;
              const units = c.lines.reduce((s, l) => s + l.quantity, 0);
              return (
                <Link key={c.id} href={`/consignment/${c.id}`} data-testid={`cons-card-${c.id}`}>
                  <Card className="h-full p-4 transition-colors hover:border-primary/40 hover:bg-muted/30">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><div className="truncate font-semibold">{customer ? c.location : c.customerName}</div><div className="font-mono text-xs text-muted-foreground">{c.number}</div></div>
                      <PackageOpen className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{c.site} · {c.location}</div>
                    <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-md bg-muted/50 p-2"><dt className="text-[11px] text-muted-foreground">{t('consignment.products')}</dt><dd className="font-semibold tabular">{c.lines.length}</dd></div>
                      <div className="rounded-md bg-muted/50 p-2"><dt className="text-[11px] text-muted-foreground">{t('consignment.units')}</dt><dd className="font-semibold tabular">{fmtNumber(units)}</dd></div>
                      <div className="rounded-md bg-muted/50 p-2"><dt className="text-[11px] text-muted-foreground">{t('consignment.openCallOffs')}</dt><dd className="font-semibold tabular">{c.openCallOffs.length}</dd></div>
                    </dl>
                    {low > 0 && <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />{t('consignment.belowMin', { count: low })}</p>}
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : <EmptyState icon={PackageOpen} title={t('consignment.empty')} description={customer ? t('consignment.emptyCustomer') : undefined} />}
      </QueryView>
    </div>
  );
}
