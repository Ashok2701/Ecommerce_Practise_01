'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useAccess } from '@/lib/auth/permissions';
import { useT } from '@/lib/i18n';
import { AppShell } from '@/components/shell/AppShell';
import { EmptyState } from '@/components/common';
import { Button } from '@/components/ui/button';
import type { User } from '@/types/domain';

const Spinner = () => <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" role="status" /></div>;

/** Protected area: requires a session; each page needs its module to be switched on for the user's role. */
export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const hadUser = useRef(false);
  if (user) hadUser.current = true;
  // deep links keep ?next=; an explicit sign-out goes to a clean login
  useEffect(() => { if (ready && !user) router.replace(hadUser.current ? '/login' : `/login?next=${encodeURIComponent(path)}`); }, [ready, user, router, path]);
  if (!ready || !user) return <Spinner />;
  return <Guarded user={user} path={path}>{children}</Guarded>;
}

function Guarded({ user, path, children }: { user: User; path: string; children: React.ReactNode }) {
  const { t } = useT();
  const access = useAccess(user.role);
  if (!access.ready) return <Spinner />;
  return (
    <AppShell>
      {access.canPath(path) ? children : (
        <div data-testid="access-denied">
          <EmptyState icon={ShieldAlert} title={t('access.deniedTitle')} description={t('access.deniedText')}
            action={<Button asChild><Link href="/dashboard">{t('access.goDashboard')}</Link></Button>} />
        </div>
      )}
    </AppShell>
  );
}
