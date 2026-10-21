'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, PackageCheck, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { deliveryService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useAccess } from '@/lib/auth/permissions';
import { useErrorText, useT } from '@/lib/i18n';
import { fmtDate } from '@/lib/format';
import { SectionCard } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PodForm, PodView } from './PodForm';
import { isCustomerRole, type Order } from '@/types/domain';

/**
 * Delivery block on the order page. Staff jump to the delivery note; customers
 * see where their goods are and confirm receipt here (they don't have the
 * Deliveries module).
 */
export function OrderDelivery({ order: o }: { order: Order }) {
  const { t } = useT();
  const errorText = useErrorText();
  const user = useUser();
  const qc = useQueryClient();
  const { can } = useAccess(user.role);
  const customer = isCustomerRole(user.role);
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['delivery', o.deliveryId], queryFn: () => deliveryService.get(o.deliveryId!), enabled: !!o.deliveryId });
  const pod = useMutation({
    mutationFn: (v: Parameters<typeof deliveryService.recordPod>[2]) => deliveryService.recordPod(o.deliveryId!, { id: user.id, name: user.name, role: user.role }, v),
    onSuccess: () => { qc.invalidateQueries(); setOpen(false); toast.success(t('deliveries.msg.delivered')); },
    onError: (e) => toast.error(errorText(e)),
  });
  const d = q.data;
  return (
    <SectionCard title={<span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" aria-hidden="true" />{t('deliveries.cardTitle')}</span>} bodyClassName="space-y-3 p-4 text-sm">
      <p className="text-muted-foreground">{o.deliveryAddress.line1}<br />{o.deliveryAddress.city}, {o.deliveryAddress.state} {o.deliveryAddress.postalCode}</p>
      {d ? (
        <div className="space-y-3 border-t pt-3" data-testid="order-delivery">
          <div className="flex flex-wrap items-center gap-2">
            {can('deliveries') ? <Link href={`/deliveries/${d.id}`} className="font-mono text-xs font-semibold text-primary hover:underline">{d.number}</Link> : <span className="font-mono text-xs font-semibold">{d.number}</span>}
            <StatusBadge status={d.status} />
          </div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><Truck className="h-3.5 w-3.5" aria-hidden="true" />{d.carrier}{d.trackingRef ? ` · ${d.trackingRef}` : ''} · {t('deliveries.plannedFor', { date: fmtDate(d.plannedDate) })}</p>
          {d.pod ? <PodView d={d} /> : customer && ['scheduled', 'out_for_delivery'].includes(d.status) && (
            <Button className="w-full" variant="outline" onClick={() => setOpen(true)} data-testid="order-confirm-receipt"><PackageCheck className="me-2 h-4 w-4" aria-hidden="true" />{t('deliveries.pod.confirmReceipt')}</Button>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
              <DialogHeader><DialogTitle>{t('deliveries.pod.confirmReceipt')}</DialogTitle><DialogDescription>{t('deliveries.podText')}</DialogDescription></DialogHeader>
              <PodForm delivery={d} customer defaultName={user.name} pending={pod.isPending} onCancel={() => setOpen(false)} onSubmit={(v) => pod.mutate(v)} />
            </DialogContent>
          </Dialog>
        </div>
      ) : <p className="flex items-center gap-2 text-xs text-muted-foreground"><Truck className="h-3.5 w-3.5" aria-hidden="true" />{t('deliveries.afterDispatch')}</p>}
    </SectionCard>
  );
}
