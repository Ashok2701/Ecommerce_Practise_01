'use client';
import { useEffect, useState } from 'react';
import { Cpu, Globe, Smartphone, Bell, Database, CheckCircle2, Download, Plug } from 'lucide-react';
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

export default function SettingsPage() {
  const { locale, setLocale, languages } = useT();
  const settings = useSettings();
  const install = useInstallPrompt();
  const [sw, setSw] = useState('checking…');
  const [prefs, setPrefs] = useState({ approvalThreshold: '200000', autoApproveTierA: true, emailDigest: true, pushOrders: true });
  useEffect(() => { if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration().then((r) => setSw(r ? 'Active' : 'Registered in production builds')); else setSw('Not supported'); }, []);
  return (
    <div>
      <PageHeader title="Application settings" description="Platform configuration for Version 1." actions={<Button onClick={() => toast.success('Settings saved (demo)')}>Save changes</Button>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={<span className="flex items-center gap-2"><Cpu className="h-4 w-4 text-primary" />ERP integration</span>} bodyClassName="space-y-4 p-4">
          <div className="flex items-center justify-between rounded-md border p-3"><div><div className="text-sm font-medium">{settings.erpName}</div><div className="text-xs text-muted-foreground">Adapter: sage-x3 · via Node.js backend</div></div><span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{appConfig.dataSource === 'mock' ? 'Mock' : 'Live'} mode</span></div>
          <div className="space-y-1.5"><Label htmlFor="api">Backend API base URL</Label><Input id="api" placeholder="https://api.yourcompany.com" defaultValue={appConfig.apiBaseUrl} /><p className="text-xs text-muted-foreground">Set <code className="font-mono">NEXT_PUBLIC_DATA_SOURCE=api</code> and <code className="font-mono">NEXT_PUBLIC_API_BASE_URL</code> to switch every service from mock data to the backend.</p></div>
          <div className="flex items-center gap-2 text-sm"><Database className="h-4 w-4 text-muted-foreground" />Current data source: <b className="uppercase">{appConfig.dataSource}</b></div>
          <Button variant="outline" onClick={() => toast.info('Connection test will call GET /health on the Node.js backend.')}><Plug className="mr-2 h-4 w-4" />Test connection</Button>
          <p className="text-xs text-muted-foreground">Planned adapters: SAP Business One / S/4HANA, Microsoft Dynamics 365, Oracle NetSuite.</p>
        </SectionCard>
        <SectionCard title="Order approval rules" bodyClassName="space-y-4 p-4">
          <div className="space-y-1.5"><Label htmlFor="thr">Manager approval required above (₹)</Label><Input id="thr" type="number" value={prefs.approvalThreshold} onChange={(e) => setPrefs({ ...prefs, approvalThreshold: e.target.value })} /></div>
          <label className="flex items-center justify-between gap-3 text-sm"><span>Fast-track Tier A customers within credit limit</span><Switch checked={prefs.autoApproveTierA} onCheckedChange={(v) => setPrefs({ ...prefs, autoApproveTierA: v })} /></label>
          <label className="flex items-center justify-between gap-3 text-sm"><span>Block orders for customers on hold</span><Switch defaultChecked /></label>
        </SectionCard>
        <SectionCard title={<span className="flex items-center gap-2"><Globe className="h-4 w-4 text-primary" />Language & region</span>} bodyClassName="space-y-4 p-4">
          <div className="space-y-1.5"><Label>Default language</Label><Select value={locale} onValueChange={(v: any) => setLocale(v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{languages.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}</SelectContent></Select></div>
          <p className="text-xs text-muted-foreground">All UI strings are served from translation dictionaries (<code className="font-mono">lib/i18n/locales</code>). Arabic is configured for right-to-left layout.</p>
          <div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-md bg-muted/60 p-3"><div className="text-xs text-muted-foreground">Currency</div><div className="font-medium">{settings.currency}</div></div><div className="rounded-md bg-muted/60 p-3"><div className="text-xs text-muted-foreground">Number format</div><div className="font-medium">{settings.region}</div></div></div>
        </SectionCard>
        <SectionCard title={<span className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-primary" />PWA & notifications</span>} bodyClassName="space-y-4 p-4">
          <div className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Web app manifest configured</div>
          <div className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Service worker: {sw}</div>
          <div className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Offline order queue (Pending Sync) enabled</div>
          <Button variant="outline" disabled={!install.available} onClick={install.prompt}><Download className="mr-2 h-4 w-4" />{install.installed ? 'App installed' : install.available ? 'Install app' : 'Install available in supported browsers'}</Button>
          <label className="flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2"><Bell className="h-4 w-4 text-muted-foreground" />Push notifications for order updates</span><Switch checked={prefs.pushOrders} onCheckedChange={(v) => setPrefs({ ...prefs, pushOrders: v })} /></label>
          <label className="flex items-center justify-between gap-3 text-sm"><span>Daily email digest for managers</span><Switch checked={prefs.emailDigest} onCheckedChange={(v) => setPrefs({ ...prefs, emailDigest: v })} /></label>
        </SectionCard>
      </div>
    </div>
  );
}
