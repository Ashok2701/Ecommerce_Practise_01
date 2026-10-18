'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Building2, Check, ClipboardCheck, Eye, EyeOff, KeyRound, Loader2, ShieldCheck, ShoppingBag, Truck, UserSquare2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/AuthProvider';
import { authService, DEMO_PASSWORD } from '@/lib/services';
import { useErrorText, useT } from '@/lib/i18n';
import { APP_VERSION, useSettings } from '@/lib/settings';
import { fmtMoney, fmtNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Logo } from '@/components/brand/Logo';
import { LanguageSwitcher, ThemeSwitcher } from '@/components/preferences/Preferences';
import type { Role } from '@/types/domain';

const ROLE_ICON: Record<Role, typeof ShieldCheck> = { ADMIN: ShieldCheck, SUPERVISOR: ClipboardCheck, SALES_REP: UserSquare2, SUPPLIER: Truck, CUSTOMER_B2B: Building2, CUSTOMER_B2C: ShoppingBag };

/* ------------------------------------------------------------------ */
/* The request slip: one sales request moving through to delivery.     */
/* Sample content only; it illustrates the request-first workflow.     */
/* ------------------------------------------------------------------ */
const STEPS = ['requested', 'approved', 'ordered', 'delivered'] as const;
const LINES = [{ key: 'item1', qty: 40, price: 186 }, { key: 'item2', qty: 6, price: 4950 }];

function RequestSlip() {
  const { t } = useT();
  const total = LINES.reduce((s, l) => s + l.qty * l.price, 0);
  return (
    <figure aria-label={t('login.slipLabel')} className="relative w-full max-w-[420px] rounded-xl bg-card p-5 text-card-foreground shadow-[0_24px_60px_-20px_rgb(0_0_0/0.55)] ring-1 ring-white/10 lg:-rotate-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold">{t('login.slip.title')}</span>
        <span className="text-[13px] tabular-nums text-muted-foreground">SR-1042</span>
      </div>
      <div className="mt-3 border-y border-dashed py-3">
        <div className="text-[11.5px] text-muted-foreground">{t('login.slip.customer')}</div>
        <div className="text-[15px] font-semibold">Lakshmi Traders, Hyderabad</div>
      </div>
      <ul className="divide-y divide-dashed text-[13px]">
        {LINES.map((l) => (
          <li key={l.key} className="flex items-baseline gap-3 py-2">
            <span className="min-w-0 flex-1 truncate">{t(`login.slip.${l.key}`)}</span>
            <span className="tabular-nums text-muted-foreground">{fmtNumber(l.qty)} ×</span>
            <span className="w-24 text-right tabular-nums">{fmtMoney(l.qty * l.price)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between border-t pt-2.5 text-[13px]">
        <span className="text-muted-foreground">{t('login.slip.lines', { count: LINES.length })}</span>
        <span className="font-semibold tabular-nums">{t('login.slip.total')} {fmtMoney(total)}</span>
      </div>

      <ol className="mt-5 grid grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s} className="relative flex flex-col items-center text-center">
            {i > 0 && (
              <span aria-hidden="true" className="absolute top-[7px] h-0.5 w-full -translate-x-1/2 rtl:translate-x-1/2 bg-border start-0">
                <span className="slip-rail absolute inset-0 bg-primary" style={{ animationDelay: `${0.3 + i * 0.5}s` }} />
              </span>
            )}
            <span aria-hidden="true" className="slip-step relative z-10 h-4 w-4 rounded-full bg-primary ring-4 ring-card" style={{ animationDelay: `${0.35 + i * 0.5}s` }} />
            <span className="mt-2 px-1 text-[11.5px] leading-tight text-muted-foreground">{t(`login.slip.steps.${s}`)}</span>
          </li>
        ))}
      </ol>

      <span aria-hidden="true" className="slip-stamp pointer-events-none absolute -right-2 top-14 rounded-md border-2 border-signal px-2.5 py-1 text-sm font-bold text-signal-foreground dark:text-signal bg-signal/10 backdrop-blur-[1px]" style={{ animationDelay: '2.4s' }}>
        {t('login.slip.steps.delivered')}
      </span>
    </figure>
  );
}

function BrandPanel() {
  const { t } = useT();
  const s = useSettings();
  return (
    <section className="relative hidden overflow-hidden bg-sidebar text-white lg:flex lg:min-h-screen lg:flex-col" aria-labelledby="brand-title">
      <div aria-hidden="true" className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:56px_56px]" />
      <div className="relative flex flex-1 flex-col px-12 py-10 xl:px-16">
        <Logo />
        <div className="my-auto max-w-[560px] py-10">
          <h2 id="brand-title" className="max-w-[15ch] text-[44px] font-semibold leading-[1.06] tracking-[-0.02em] text-white 2xl:text-[52px]">{t('login.heroTitle')}</h2>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/70">{t('login.heroText', { erp: s.erpName })}</p>
          <div className="mt-10"><RequestSlip /></div>
          <ul className="mt-9 grid gap-x-6 gap-y-2.5 xl:grid-cols-3 [@media(max-height:820px)]:hidden">
            {(['pricing', 'approvals', 'devices'] as const).map((k) => (
              <li key={k} className="flex gap-2.5 text-[13px] leading-snug text-white/75">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--sidebar-primary))]" aria-hidden="true" />{t(`login.points.${k}`)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function DemoAccounts({ busy, onPick }: { busy: string | null; onPick: (email: string) => void }) {
  const { t } = useT();
  const demo = authService.demoAccounts();
  return (
    <section className="mt-8 border-t pt-6" aria-labelledby="demo-title">
      <h2 id="demo-title" className="text-sm font-semibold">{t('login.demo')}</h2>
      <p className="mt-0.5 text-[13px] text-muted-foreground">{t('login.demoHint', { password: DEMO_PASSWORD })}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {demo.map((u) => {
          const Icon = ROLE_ICON[u.role];
          return (
            <button key={u.id} type="button" data-testid={`demo-login-${u.role}`} disabled={!!busy} onClick={() => onPick(u.email)}
              className="flex items-start gap-3 rounded-lg border bg-card p-2.5 text-start transition-colors hover:border-primary/50 hover:bg-accent/50 disabled:opacity-60">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                {busy === u.email ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold leading-snug">{t(`roles.${u.role}`)}</span>
                <span className="block text-[12px] leading-snug text-muted-foreground">{t(`roleBlurb.${u.role}`)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function LoginForm() {
  const { t } = useT();
  const errorText = useErrorText();
  const s = useSettings();
  const { login, user, ready } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { if (ready && user) router.replace(next || '/dashboard'); }, [ready, user, next, router]);

  const signIn = async (creds: { email: string; password: string }) => {
    setError(''); setBusy(creds.email);
    try {
      const u = await login(creds.email, creds.password);
      toast.success(t('login.welcome', { name: u.name.split(' ')[0] }));
      router.replace(next || '/dashboard');
    } catch (err) { setError(errorText(err)); setBusy(null); }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) { setError(t('login.missing')); return; }
    signIn({ email, password });
  };

  const year = new Date().getFullYear();

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1.2fr)_minmax(460px,1fr)]">
      <BrandPanel />

      <main className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between gap-2 px-5 pt-4 sm:px-8 lg:justify-end">
          <span className="lg:hidden"><Logo onDark={false} /></span>
          <div className="flex items-center gap-1"><LanguageSwitcher /><ThemeSwitcher /></div>
        </header>

        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[400px]">
            <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.015em]">{t('login.title')}</h1>
            <p className="mt-1.5 text-[15px] text-muted-foreground">{t('login.subtitle')}</p>

            {s.sso.enabled && (
              <>
                <Button type="button" variant="outline" className="mt-7 h-11 w-full bg-card font-medium" onClick={() => toast.info(t('login.ssoInfo'))} data-testid="login-sso">
                  <KeyRound className="me-2 h-4 w-4" aria-hidden="true" />{t('login.ssoWith', { provider: s.sso.provider })}
                </Button>
                <div className="my-6 flex items-center gap-3 text-[13px] text-muted-foreground"><span className="h-px flex-1 bg-border" />{t('login.orEmail')}<span className="h-px flex-1 bg-border" /></div>
              </>
            )}

            <form onSubmit={submit} className={cn('space-y-4', !s.sso.enabled && 'mt-7')} noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="email">{t('login.email')}</Label>
                <Input id="email" data-testid="login-email" type="email" autoComplete="username" inputMode="email" placeholder={t('login.emailPlaceholder')}
                  className="h-11 bg-card text-[15px]" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">{t('login.password')}</Label>
                <div className="relative">
                  <Input id="password" data-testid="login-password" type={show ? 'text' : 'password'} autoComplete="current-password"
                    className="h-11 bg-card pe-11 text-[15px]" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!error} />
                  <button type="button" onClick={() => setShow((v) => !v)} aria-pressed={show} aria-label={show ? t('login.hidePassword') : t('login.showPassword')}
                    className="absolute end-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                    {show ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground"><Checkbox checked={remember} onCheckedChange={(v) => setRemember(!!v)} />{t('login.remember')}</label>
                <button type="button" className="rounded text-[13px] font-medium text-primary underline-offset-4 hover:underline" onClick={() => toast.info(t('login.forgotInfo'))}>{t('login.forgot')}</button>
              </div>
              {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[13px] text-destructive" data-testid="login-error">{error}</p>}
              <Button type="submit" className="h-11 w-full text-[15px] font-semibold" disabled={!!busy} data-testid="login-submit">
                {busy && busy === email ? <><Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />{t('login.signingIn')}</> : <>{t('login.signIn')}<ArrowRight className="ms-2 h-4 w-4 rtl:rotate-180" aria-hidden="true" /></>}
              </Button>
            </form>

            {s.demoMode && <DemoAccounts busy={busy} onPick={(em) => signIn({ email: em, password: DEMO_PASSWORD })} />}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 pb-5 text-[12px] text-muted-foreground sm:px-8">
          <span>© {year} {s.companyName} · {t('login.version', { version: APP_VERSION })}</span>
          <span className="flex gap-4">
            {s.privacyUrl && <a className="hover:text-foreground hover:underline" href={s.privacyUrl} target="_blank" rel="noreferrer">{t('login.privacy')}</a>}
            {s.termsUrl && <a className="hover:text-foreground hover:underline" href={s.termsUrl} target="_blank" rel="noreferrer">{t('login.terms')}</a>}
          </span>
        </footer>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
