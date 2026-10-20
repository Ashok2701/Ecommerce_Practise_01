'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { useTheme } from 'next-themes';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { CartProvider } from '@/lib/cart/CartProvider';
import { UIProvider } from '@/lib/ui/UIProvider';
import { I18nProvider } from '@/lib/i18n';
import { SettingsProvider } from '@/lib/settings';
import { SiteProvider } from '@/lib/sites/SiteProvider';
import { ThemeProvider } from 'next-themes';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } } }));
  useEffect(() => {
    // PWA: register service worker (offline shell + cached GET data)
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="nexus.theme">
      <I18nProvider>
        <AuthProvider>
          <SiteProvider>
          <UIProvider>
            <CartProvider>
              {children}
              <ThemedToaster />
            </CartProvider>
          </UIProvider>
          </SiteProvider>
        </AuthProvider>
      </I18nProvider>
      </ThemeProvider>
      </SettingsProvider>
    </QueryClientProvider>
  );
}

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster position="top-right" richColors closeButton theme={resolvedTheme === 'dark' ? 'dark' : 'light'} />;
}
