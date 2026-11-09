'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Cpu, Globe, Smartphone, Bell, Database, CheckCircle2, Download, Plug, Workflow, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { appConfig } from '@/lib/config';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings';
import { useInstallPrompt } from '@/lib/pwa/useInstallPrompt';
import { PageHeader, SectionCard } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Prefs = { emailDigest: boolean; pushOrders: boolean };
const PREFS_KEY = 'nexus.settings.prefs';

/** Installation settings. Order and approval rules live on the Workflow page; this page covers the ERP link, language and the app itself. */
export default function SettingsPage() {
  const { t, locale, setLocale, languages } = useT();
  const settings = useSettings();
  const install = useInstallPrompt();
  const [sw, setSw] = useState<'checking' | 'active' | 'prodOnly' | 'unsupported'>('checking');
  const [prefs, setPrefs] = useState<Prefs>({ emailDigest: true, pushOrders: true });
  useEffect(() => {
    try { const p = localStorage.getItem(PREFS_KEY); if (p) setPrefs(JSON.parse(p)); } catch { /* ignore */ }
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration().then((r) => setSw(r ? 'active' : 'prodOnly'));
    else setSw('unsupported');
  }, []);
  const save = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ } toast.success(t('settingsPage.saved')); };
  const testConnection = async () => {
    if (appConfig.dataSource === 'mock') return toast.info(t('settingsPage.mockTest'));
    try { const r = await fetch(`${appConfig.apiBaseUrl}/health`); toast[r.ok ? 'success' : 'error'](r.ok ? t('settingsPage.connOk') : t('settingsPage.connFail', { status: r.status })); }
    catch { toast.error(t('settingsPage.connFail', { status: '—' })); }
  };
  const check = (text: React.ReactNode) => <div className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />{text}</div>;
  return (
    <div>
      <PageHeader title={t('nav.settings')} description={t('settingsPage.intro')} actions={<Button onClick={save} data-testid="settings-save">{t('settingsPage.save')}</Button>} />
      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <SectionCard title={<span className="flex items-center gap-2"><Cpu className="h-4 w-4 text-primary" aria-hidden="true" />{t('settingsPage.erp')}</span>} bodyClassName="space-y-4 p-4">
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div className="min-w-0"><div className="text-sm font-medium">{settings.erpName}</div><div className="text-xs text-muted-foreground">{t('settingsPage.adapter')}</div></div>
            <span className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{appConfig.dataSource === 'mock' ? t('settingsPage.mockMode') : t('settingsPage.liveMode')}</span>
          </div>
          <div className="space-y-1.5"><Label htmlFor="api">{t('settingsPage.apiUrl')}</Label><Input id="api" placeholder="https://api.yourcompany.com" defaultValue={appConfig.apiBaseUrl} readOnly /><p className="text-xs text-muted-foreground">{t('settingsPage.apiHint')} <code className="font-mono">NEXT_PUBLIC_DATA_SOURCE=api</code> · <code className="font-mono">NEXT_PUBLIC_API_BASE_URL</code></p></div>
          <div className="flex items-center gap-2 text-sm"><Database className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{t('settingsPage.dataSource')} <b className="uppercase">{appConfig.dataSource}</b></div>
          <Button variant="outline" onClick={testConnection} data-testid="settings-test"><Plug className="me-2 h-4 w-4" aria-hidden="true" />{t('settingsPage.test')}</Button>
          <p className="text-xs text-muted-foreground">{t('settingsPage.planned')}</p>
        </SectionCard>
        <SectionCard title={<span className="flex items-center gap-2"><Workflow className="h-4 w-4 text-primary" aria-hidden="true" />{t('settingsPage.rules')}</span>} bodyClassName="space-y-3 p-4">
          <p className="text-sm text-muted-foreground">{t('settingsPage.rulesText')}</p>
          <Button asChild variant="outline"><Link href="/workflow">{t('nav.workflow')}<ArrowRight className="ms-2 h-4 w-4 rtl:rotate-180" aria-hidden="true" /></Link></Button>
        </SectionCard>
        <SectionCard title={<span className="flex items-center gap-2"><Globe className="h-4 w-4 text-primary" aria-hidden="true" />{t('settingsPage.language')}</span>} bodyClassName="space-y-4 p-4">
          <div className="space-y-1.5"><Label>{t('settingsPage.yourLanguage')}</Label><Select value={locale} onValueChange={(v: any) => setLocale(v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{languages.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}</SelectContent></Select></div>
          <p className="text-xs text-muted-foreground">{t('settingsPage.languageHint')}</p>
          <div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-md bg-muted/60 p-3"><div className="text-xs text-muted-foreground">{t('settingsPage.currency')}</div><div className="font-medium">{settings.currency}</div></div><div className="rounded-md bg-muted/60 p-3"><div className="text-xs text-muted-foreground">{t('settingsPage.region')}</div><div className="font-medium">{settings.region}</div></div></div>
        </SectionCard>
        <SectionCard title={<span className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-primary" aria-hidden="true" />{t('settingsPage.pwa')}</span>} bodyClassName="space-y-4 p-4">
          {check(t('settingsPage.manifest'))}
          {check(t('settingsPage.sw', { state: t(`settingsPage.swState.${sw}`) }))}
          {check(t('settingsPage.offlineQueue'))}
          <Button variant="outline" disabled={!install.available} onClick={install.prompt}><Download className="me-2 h-4 w-4" aria-hidden="true" />{install.installed ? t('settingsPage.installed') : install.available ? t('settingsPage.install') : t('settingsPage.installUnavailable')}</Button>
          <label className="flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2"><Bell className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{t('settingsPage.pushOrders')}</span><Switch checked={prefs.pushOrders} onCheckedChange={(v) => setPrefs({ ...prefs, pushOrders: v })} /></label>
          <label className="flex items-center justify-between gap-3 text-sm"><span>{t('settingsPage.digest')}</span><Switch checked={prefs.emailDigest} onCheckedChange={(v) => setPrefs({ ...prefs, emailDigest: v })} /></label>
        </SectionCard>
      </div>
    </div>
  );
}
