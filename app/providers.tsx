'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { CartProvider } from '@/lib/cart/CartProvider';
import { UIProvider } from '@/lib/ui/UIProvider';
import { I18nProvider } from '@/lib/i18n';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } } }));
  useEffect(() => {
    // PWA: register service worker (offline shell + cached GET data)
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AuthProvider>
          <UIProvider>
            <CartProvider>
              {children}
              <Toaster position="top-right" richColors closeButton />
            </CartProvider>
          </UIProvider>
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
