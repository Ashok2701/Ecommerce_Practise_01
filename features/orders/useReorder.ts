'use client';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useCart } from '@/lib/cart/CartProvider';
import type { Order } from '@/types/domain';

/** Repeat an order: copy its lines to the cart at today's customer prices. */
export function useReorder() {
  const cart = useCart();
  const router = useRouter();
  return (o: Order) => {
    cart.replace(o.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })), o.customerId);
    toast.success(`${o.lines.length} items from ${o.number} added to cart`, { description: 'Prices refreshed to current customer pricing.' });
    router.push('/cart');
  };
}
