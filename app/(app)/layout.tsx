'use client';
import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { canAccess } from '@/lib/auth/permissions';
import { AppShell } from '@/components/shell/AppShell';
import { EmptyState } from '@/components/common';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

/** Protected area: requires a session and enforces role-based route access. */
export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const hadUser = useRef(false);
  if (user) hadUser.current = true;
  // deep links keep ?next=; an explicit sign-out goes to a clean login
  useEffect(() => { if (ready && !user) router.replace(hadUser.current ? '/login' : `/login?next=${encodeURIComponent(path)}`); }, [ready, user, router, path]);
  if (!ready || !user) return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-label="Loading" /></div>;
  return (
    <AppShell>
      {canAccess(path, user.role) ? children : (
        <div data-testid="access-denied"><EmptyState icon={ShieldAlert} title="You don't have access to this page" description="This area is not available for your role. Contact your administrator if you believe this is an error." action={<Button asChild><Link href="/dashboard">Go to dashboard</Link></Button>} /></div>
      )}
    </AppShell>
  );
}
