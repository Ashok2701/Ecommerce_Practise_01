'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, Building2, UserSquare2, ClipboardCheck, ArrowRight, Loader2, Lock, Mail, Eye, EyeOff, CheckCircle2, RefreshCw, Truck, KeyRound, Fingerprint, BadgeCheck, Zap, Globe2, Check, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/AuthProvider';
import { authService, DEMO_PASSWORD } from '@/lib/services';
import { useT, LOCALES } from '@/lib/i18n';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Logo } from '@/components/shell/AppShell';
import type { Role } from '@/types/domain';

const HERO = 'https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=1600&q=75';

const ROLE_META: Record<Role, { icon: any; blurb: string; tone: string }> = {
  admin: { icon: ShieldCheck, blurb: 'login.blurbAdmin', tone: 'bg-slate-900 text-white' },
  manager: { icon: ClipboardCheck, blurb: 'login.blurbManager', tone: 'bg-indigo-600 text-white' },
  sales: { icon: UserSquare2, blurb: 'login.blurbSales', tone: 'bg-emerald-600 text-white' },
  customer: { icon: Building2, blurb: 'login.blurbCustomer', tone: 'bg-amber-500 text-white' },
};

const HIGHLIGHTS = [['login.h1', 'login.h1d'], ['login.h2', 'login.h2d'], ['login.h3', 'login.h3d']];

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = useT();
  const cur = LOCALES.find((l) => l.code === locale) ?? LOCALES[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={`h-9 gap-1.5 rounded-full bg-card px-3 shadow-sm ${className}`} data-testid="language-switcher" aria-label={t('meta.language')}>
          <Globe2 className="h-4 w-4 text-muted-foreground" /><span className="text-xs font-semibold">{cur.short}</span><span className="hidden text-xs text-muted-foreground sm:inline">{cur.label}</span><ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t('meta.language')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LOCALES.map((l) => (
          <DropdownMenuItem key={l.code} disabled={!l.ready} onSelect={() => setLocale(l.code)} data-testid={`lang-${l.code}`} className="gap-2">
            <span className="w-6 rounded bg-muted px-1 text-center text-[10px] font-semibold">{l.short}</span>
            <span className="flex-1">{l.label}</span>
            {!l.ready ? <span className="text-[10px] text-muted-foreground">Soon</span> : locale === l.code ? <Check className="h-4 w-4 text-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function HeroPanel() {
  const { t } = useT();
  return (
    <section className="relative hidden overflow-hidden lg:sticky lg:top-0 lg:block lg:h-screen" aria-label="About Nexus B2B">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={HERO} alt="High-bay warehouse aisle with stocked pallet racking" className="absolute inset-0 h-full w-full scale-105 object-cover" />
      <div className="absolute inset-0 bg-[linear-gradient(160deg,hsl(222_60%_8%/0.92)_0%,hsl(222_55%_10%/0.78)_45%,hsl(222_60%_8%/0.95)_100%)]" />
      <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:48px_48px]" />

      <div className="relative flex h-full flex-col p-10 text-white xl:p-14">
        <div className="flex items-center justify-between">
          <Logo />
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-200 backdrop-blur">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" /></span>
            {t('login.connector')}
          </span>
        </div>

        <div className="mt-auto grid gap-10 2xl:grid-cols-[1fr_auto] 2xl:items-end">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">{t('login.kicker')}</p>
            <h2 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-tight 2xl:text-[44px]">
              {t('login.heroTitle')}<br /><span className="text-sky-300">{t('login.heroAccent')}</span>
            </h2>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-slate-300">
              {t('login.heroText')}
            </p>
            <ul className="mt-8 space-y-3.5">
              {HIGHLIGHTS.map(([h, d]) => (
                <li key={h} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
                  <div><div className="text-sm font-semibold">{t(h)}</div><div className="text-[13px] text-slate-400">{t(d)}</div></div>
                </li>
              ))}
            </ul>
          </div>

          {/* Product glimpse: floating live cards */}
          <div className="hidden w-72 space-y-3 2xl:block" aria-hidden="true">
            <div className="rounded-xl border border-white/10 bg-white/[0.07] p-4 shadow-2xl backdrop-blur-md">
              <div className="flex items-center justify-between text-[11px] text-slate-400"><span>SO-2026-04812</span><span className="rounded bg-emerald-400/15 px-1.5 py-0.5 font-medium text-emerald-300">Confirmed</span></div>
              <div className="mt-2 text-sm font-semibold">ABC Distributors</div>
              <div className="mt-0.5 text-xs text-slate-400">14 lines · Deep groove bearings, EP2 grease…</div>
              <div className="mt-3 flex items-end justify-between"><span className="text-xl font-semibold tabular-nums">₹4,86,230</span><span className="flex items-center gap-1 text-[11px] text-sky-300"><RefreshCw className="h-3 w-3" />Synced to ERP</span></div>
            </div>
            <div className="ml-8 rounded-xl border border-white/10 bg-white/[0.07] p-3.5 shadow-2xl backdrop-blur-md">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-400/15 text-sky-300"><Truck className="h-4 w-4" /></span>
                <div className="min-w-0"><div className="text-xs font-semibold">Dispatched · Sri Lakshmi Traders</div><div className="text-[11px] text-slate-400">Expected delivery tomorrow</div></div>
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.07] p-3.5 shadow-2xl backdrop-blur-md">
              <div className="flex items-center justify-between text-xs"><span className="text-slate-300">Monthly target</span><span className="font-semibold">82%</span></div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[82%] rounded-full bg-gradient-to-r from-sky-400 to-emerald-400" /></div>
            </div>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-3 gap-6 border-t border-white/10 pt-6 [@media(max-height:760px)]:hidden">
          {[['1,200+', 'login.s1'], [t('login.s2v'), 'login.s2'], ['99.9%', 'login.s3']].map(([v, l]) => (
            <div key={l}><div className="text-2xl font-semibold tabular-nums">{v}</div><div className="mt-0.5 text-xs text-slate-400">{t(l)}</div></div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LoginForm() {
  const { t } = useT();
  const { login, user, ready } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const demo = authService.demoAccounts();

  useEffect(() => { if (ready && user) router.replace(next || '/dashboard'); }, [ready, user, next, router]);

  const submit = async (e?: React.FormEvent, creds?: { email: string; password: string }) => {
    e?.preventDefault();
    const c = creds ?? { email, password };
    if (!creds && (!c.email || !c.password)) { setError(t('login.missing')); return; }
    setError(''); setBusy(c.email);
    try {
      const u = await login(c.email, c.password);
      toast.success(t('login.welcome', { name: u.name.split(' ')[0] }));
      router.replace(next || '/dashboard');
    } catch (err: any) { setError(err.message); setBusy(null); }
  };

  const sso = (p: string) => toast.info(`${p} single sign-on will be enabled through the Node.js auth service.`);

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.15fr_1fr]">
      <HeroPanel />

      <section className="relative flex flex-col">
        {/* Mobile hero strip */}
        <div className="relative h-44 overflow-hidden lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={HERO} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-[hsl(222_60%_8%/0.75)] to-[hsl(222_60%_8%/0.92)]" />
          <div className="relative flex h-full flex-col justify-between p-5 text-white">
            <Logo />
            <p className="max-w-xs text-lg font-semibold leading-snug">{t('login.mobileTitle')} <span className="text-sky-300">{t('login.mobileAccent')}</span></p>
          </div>
        </div>

        <div className="absolute inset-0 -z-0 hidden opacity-60 [background-image:radial-gradient(hsl(var(--border))_1px,transparent_1px)] [background-size:20px_20px] [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)] lg:block" aria-hidden="true" />

        <div className="relative flex flex-1 items-center justify-center px-5 py-8 sm:px-10 lg:py-12">
          <div className="w-full max-w-[420px]">
            <div className="mb-6 flex items-center justify-between gap-3"><div className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm"><BadgeCheck className="h-3.5 w-3.5 text-primary" />{t('login.secure')}</div><LanguageSwitcher /></div>
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight">{t('login.title')}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{t('login.subtitle')}</p>

            <div className="mt-7 grid grid-cols-2 gap-2.5">
              <Button type="button" variant="outline" className="h-11 font-medium" onClick={() => sso('Microsoft')}>
                <svg viewBox="0 0 21 21" className="mr-2 h-4 w-4" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#f25022" /><rect x="11" y="1" width="9" height="9" fill="#7fba00" /><rect x="1" y="11" width="9" height="9" fill="#00a4ef" /><rect x="11" y="11" width="9" height="9" fill="#ffb900" /></svg>Microsoft
              </Button>
              <Button type="button" variant="outline" className="h-11 font-medium" onClick={() => sso(t('login.sso'))}><KeyRound className="mr-2 h-4 w-4" />{t('login.sso')}</Button>
            </div>
            <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />{t('login.orEmail')}<span className="h-px flex-1 bg-border" /></div>

            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="email">{t('login.email')}</Label>
                <div className="relative"><Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="email" data-testid="login-email" type="email" autoComplete="email" placeholder="you@company.com" className="h-12 rounded-lg bg-card pl-10 text-[15px] shadow-sm" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between"><Label htmlFor="password">{t('login.password')}</Label><button type="button" className="rounded text-xs font-medium text-primary hover:underline" onClick={() => toast.info('Password reset will be handled by the Node.js auth service.')}>{t('login.forgot')}</button></div>
                <div className="relative"><Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="password" data-testid="login-password" type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" className="h-12 rounded-lg bg-card pl-10 pr-11 text-[15px] shadow-sm" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground"><Checkbox checked={remember} onCheckedChange={(v) => setRemember(!!v)} />{t('login.remember')}</label>
              {error && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive" data-testid="login-error">{error}</p>}
              <Button type="submit" className="group h-12 w-full rounded-lg text-[15px] font-semibold shadow-md shadow-primary/20" disabled={!!busy} data-testid="login-submit">
                {busy && busy === email ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{t('login.signIn')}<ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-0.5" />
              </Button>
            </form>

            <div className="mt-8 rounded-xl border bg-muted/40 p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground"><Zap className="h-3.5 w-3.5 text-primary" />{t('login.demo')}</span>
                <span className="text-[11px] text-muted-foreground">{t('login.oneClick')}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {demo.map((u) => {
                  const M = ROLE_META[u.role];
                  return (
                    <button key={u.id} data-testid={`demo-login-${u.role}`} disabled={!!busy} onClick={() => submit(undefined, { email: u.email, password: DEMO_PASSWORD })}
                      className="group flex items-center gap-2.5 rounded-lg border bg-card p-2.5 text-left shadow-sm transition hover:-translate-y-px hover:border-primary/40 hover:shadow-md disabled:opacity-60">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${M.tone}`}>{busy === u.email ? <Loader2 className="h-4 w-4 animate-spin" /> : <M.icon className="h-4 w-4" />}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between text-[13px] font-semibold">{t(`roles.${u.role}`)}<ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" /></span>
                        <span className="block truncate text-[11px] text-muted-foreground">{t(M.blurb)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><Fingerprint className="h-3.5 w-3.5" />{t('login.security')}</span>
              <span>© 2026 Nexus B2B · <button type="button" className="hover:text-foreground hover:underline" onClick={() => toast.info('Privacy policy placeholder')}>{t('login.privacy')}</button> · <button type="button" className="hover:text-foreground hover:underline" onClick={() => toast.info('Terms placeholder')}>{t('login.terms')}</button></span>
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
