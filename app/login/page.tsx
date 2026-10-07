'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, Building2, UserSquare2, ClipboardCheck, ArrowRight, Loader2, Lock, Mail, Eye, EyeOff, Cpu, CloudOff, Globe2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/AuthProvider';
import { authService, DEMO_PASSWORD } from '@/lib/services';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/shell/AppShell';
import type { Role } from '@/types/domain';

const ROLE_META: Record<Role, { icon: any; blurb: string }> = {
  admin: { icon: ShieldCheck, blurb: 'Users, customers, content & settings' },
  manager: { icon: ClipboardCheck, blurb: 'Approvals, team & operations' },
  sales: { icon: UserSquare2, blurb: 'Field orders, visits & follow-ups' },
  customer: { icon: Building2, blurb: 'Catalog, orders, invoices & account' },
};

function LoginForm() {
  const { t } = useT();
  const { login, user, ready } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const demo = authService.demoAccounts();

  useEffect(() => { if (ready && user) router.replace(next || '/dashboard'); }, [ready, user, next, router]);

  const submit = async (e?: React.FormEvent, creds?: { email: string; password: string }) => {
    e?.preventDefault();
    const c = creds ?? { email, password };
    setError(''); setBusy(c.email);
    try {
      const u = await login(c.email, c.password);
      toast.success(`Signed in as ${u.name}`);
      router.replace(next || '/dashboard');
    } catch (err: any) { setError(err.message); setBusy(null); }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[hsl(216_58%_12%)] lg:block" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="https://images.unsplash.com/photo-1587293852726-70cdb56c2866?auto=format&fit=crop&w=1400&q=70" alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
        <div className="absolute inset-0 bg-gradient-to-t from-[hsl(216_58%_10%)] via-[hsl(216_58%_12%/0.85)] to-[hsl(216_58%_12%/0.6)]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <Logo />
          <div className="max-w-lg">
            <h2 className="text-3xl font-semibold leading-tight tracking-tight">One portal for your customers, sales team and operations.</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-slate-300">Customer-specific pricing, real-time order status and invoices — synchronised with your ERP. Built for the warehouse office and the field.</p>
            <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-white/10 pt-8">
              {[[Cpu, 'ERP-ready', 'Sage X3 today, SAP & Dynamics next'], [CloudOff, 'Offline-ready', 'Draft orders sync safely'], [Globe2, 'Multi-language', 'English, తెలుగు, हिन्दी, العربية']].map(([Icon, title, d]: any) => (
                <div key={title}><Icon className="h-5 w-5 text-sky-300" /><dt className="mt-3 text-sm font-semibold">{title}</dt><dd className="mt-1 text-xs leading-relaxed text-slate-400">{d}</dd></div>
              ))}
            </dl>
          </div>
          <p className="text-xs text-slate-500">© 2026 Nexus B2B · Prototype build · Mock data</p>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden"><Logo light={false} /></div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('login.title')}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{t('login.subtitle')}</p>

          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">{t('login.email')}</Label>
              <div className="relative"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="email" data-testid="login-email" type="email" autoComplete="email" placeholder="you@company.com" className="h-11 pl-9" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between"><Label htmlFor="password">{t('login.password')}</Label><button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => toast.info('Password reset will be handled by the Node.js auth service.')}>{t('login.forgot')}</button></div>
              <div className="relative"><Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="password" data-testid="login-password" type={show ? 'text' : 'password'} autoComplete="current-password" className="h-11 pl-9 pr-10" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
            </div>
            {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="login-error">{error}</p>}
            <Button type="submit" className="h-11 w-full" disabled={!!busy} data-testid="login-submit">{busy === email && busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{t('login.signIn')}</Button>
          </form>

          <div className="mt-10">
            <div className="flex items-center gap-3"><span className="h-px flex-1 bg-border" /><span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('login.demo')}</span><span className="h-px flex-1 bg-border" /></div>
            <p className="mt-2 text-center text-xs text-muted-foreground">{t('login.demoHint')}</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {demo.map((u) => {
                const M = ROLE_META[u.role];
                return (
                  <button key={u.id} data-testid={`demo-login-${u.role}`} disabled={!!busy} onClick={() => submit(undefined, { email: u.email, password: DEMO_PASSWORD })}
                    className="group flex items-start gap-3 rounded-lg border bg-card p-3 text-left transition hover:border-primary/50 hover:shadow-sm disabled:opacity-60">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">{busy === u.email ? <Loader2 className="h-4 w-4 animate-spin" /> : <M.icon className="h-4 w-4" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 text-sm font-semibold">{t(`roles.${u.role}`)}<ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" /></span>
                      <span className="block truncate text-xs text-muted-foreground">{u.role === 'customer' ? 'ABC Distributors' : u.name}</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground/80">{M.blurb}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
