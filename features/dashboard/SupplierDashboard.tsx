'use client';
import Link from 'next/link';
import { ClipboardList, MessageSquare, Truck, Wallet } from 'lucide-react';
import { useUser } from '@/lib/auth/AuthProvider';
import { useT } from '@/lib/i18n';
import { PageHeader, SectionCard } from '@/components/common';
import { Button } from '@/components/ui/button';

/**
 * Supplier home. Purchasing (purchase orders, pickup requests, receipts, payments)
 * is the next release; until then this page says what is coming and how to reach purchasing.
 */
export function SupplierDashboard() {
  const { t } = useT();
  const user = useUser();
  const items = [
    { icon: ClipboardList, title: t('supplierDash.purchaseOrders'), text: t('supplierDash.purchaseOrdersText') },
    { icon: Truck, title: t('supplierDash.pickups'), text: t('supplierDash.pickupsText') },
    { icon: Wallet, title: t('supplierDash.payments'), text: t('supplierDash.paymentsText') },
  ];
  return (
    <div>
      <PageHeader eyebrow={user.erpCode ? t('supplierDash.code', { code: user.erpCode }) : undefined}
        title={t('dashboard.customer', { name: user.name.split(' ')[0] })} description={user.title} />

      <SectionCard title={t('supplierDash.comingTitle')}>
        <p className="px-4 pt-4 text-sm text-muted-foreground">{t('supplierDash.comingText')}</p>
        <ul className="grid gap-3 p-4 sm:grid-cols-3">
          {items.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-lg border border-dashed p-4">
              <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
              <div className="mt-3 text-sm font-semibold">{title}</div>
              <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{text}</p>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard className="mt-4" title={t('supplierDash.contactTitle')}>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{t('supplierDash.contactText')}</p>
          <Button asChild variant="outline" className="shrink-0"><Link href="/messages"><MessageSquare className="me-2 h-4 w-4" aria-hidden="true" />{t('supplierDash.openMessages')}</Link></Button>
        </div>
      </SectionCard>
    </div>
  );
}
