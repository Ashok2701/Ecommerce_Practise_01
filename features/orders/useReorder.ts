'use client';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useCart } from '@/lib/cart/CartProvider';
import { useT } from '@/lib/i18n';
import type { Order } from '@/types/domain';

/** Repeat an order: copy its lines to the cart at today's customer prices. */
export function useReorder() {
  const { t } = useT();
  const cart = useCart();
  const router = useRouter();
  return (o: Order) => {
    cart.replace(o.lines.filter((l) => !l.free).map((l) => ({ productId: l.productId, quantity: l.quantity })), o.customerId);
    const paid = o.lines.filter((l) => !l.free).length;
    toast.success(t('assistant.reordered', { count: paid, number: o.number }), { description: t('orders.repriced') });
    router.push('/cart');
  };
}
