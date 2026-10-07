'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/AuthProvider';
import { productService, customerService, offerService } from '@/lib/services';
import { buildOrderTotals } from '@/lib/domain/pricing';
import type { Customer, Product } from '@/types/domain';

export interface CartItem { productId: string; quantity: number; }
interface CartState { customerId: string | null; items: CartItem[]; }
interface CartCtx extends CartState {
  count: number;
  setCustomer: (id: string | null) => void;
  add: (productId: string, qty: number) => void;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  replace: (items: CartItem[], customerId?: string) => void;
}
const Ctx = createContext<CartCtx | null>(null);

/**
 * Cart is scoped to the signed-in user. For customers the ordering customer is
 * fixed; sales reps choose which customer they are ordering for (drives pricing).
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const key = user ? `nexus.cart.${user.id}` : null;
  const [state, setState] = useState<CartState>({ customerId: null, items: [] });
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!key) return;
    try {
      const s = JSON.parse(localStorage.getItem(key) || 'null') as CartState | null;
      setState(s ?? { customerId: user?.customerId ?? null, items: [] });
    } catch { setState({ customerId: user?.customerId ?? null, items: [] }); }
    setLoadedKey(key);
  }, [key, user?.customerId]);
  useEffect(() => { if (key && loadedKey === key) localStorage.setItem(key, JSON.stringify(state)); }, [state, key, loadedKey]);

  const customerId = user?.role === 'customer' ? user.customerId ?? null : state.customerId;
  const setCustomer = useCallback((id: string | null) => setState((s) => (s.customerId === id ? s : { customerId: id, items: [] })), []);
  const add = useCallback((productId: string, qty: number) => setState((s) => {
    const ex = s.items.find((i) => i.productId === productId);
    return { ...s, items: ex ? s.items.map((i) => (i.productId === productId ? { ...i, quantity: i.quantity + qty } : i)) : [...s.items, { productId, quantity: qty }] };
  }), []);
  const setQty = useCallback((productId: string, qty: number) => setState((s) => ({ ...s, items: s.items.map((i) => (i.productId === productId ? { ...i, quantity: Math.max(0, qty) } : i)).filter((i) => i.quantity > 0) })), []);
  const remove = useCallback((productId: string) => setState((s) => ({ ...s, items: s.items.filter((i) => i.productId !== productId) })), []);
  const clear = useCallback(() => setState((s) => ({ ...s, items: [] })), []);
  const replace = useCallback((items: CartItem[], cid?: string) => setState((s) => ({ customerId: cid ?? s.customerId, items })), []);

  const value = useMemo<CartCtx>(() => ({ customerId, items: state.items, count: state.items.length, setCustomer, add, setQty, remove, clear, replace }), [customerId, state.items, setCustomer, add, setQty, remove, clear, replace]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart must be used inside CartProvider');
  return c;
}

/** Resolve cart items to priced lines for the ordering customer. */
export function usePricedCart() {
  const cart = useCart();
  const products = useQuery({ queryKey: ['products', 'all'], queryFn: productService.getAll, staleTime: 5 * 60_000 });
  const customer = useQuery({ queryKey: ['customer', cart.customerId], queryFn: () => customerService.getCustomer(cart.customerId!), enabled: !!cart.customerId });
  const offers = useQuery({ queryKey: ['offers', 'manage'], queryFn: () => offerService.list({ manage: true }) });
  const items = cart.items.map((i) => ({ product: products.data?.find((p) => p.id === i.productId) as Product, quantity: i.quantity })).filter((i) => i.product);
  const totals = buildOrderTotals(items, customer.data as Customer, offers.data ?? []);
  return { cart, customer: customer.data, items, totals, loading: products.isLoading || customer.isLoading };
}
