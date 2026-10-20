'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { customerService, workflowService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings';
import { PageHeader, QueryView, SectionCard } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { WorkflowSettings } from '@/types/domain';

type Mode = 'block' | 'warn';

/** Workflow rules for sales requests (Admin and Supervisor). */
export default function WorkflowPage() {
  const { t } = useT();
  const settings = useSettings();
  const user = useUser();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['workflow'], queryFn: workflowService.get });
  const customers = useQuery({ queryKey: ['customers', 'all'], queryFn: () => customerService.getCustomers({}) });
  const [draft, setDraft] = useState<WorkflowSettings | null>(null);
  const [pick, setPick] = useState('');
  useEffect(() => { if (q.data && !draft) setDraft(structuredClone(q.data)); }, [q.data, draft]);
  const dirty = !!draft && !!q.data && JSON.stringify(draft) !== JSON.stringify(q.data);
  const save = useMutation({
    mutationFn: () => workflowService.save(draft!, { id: user.id, name: user.name, role: user.role }),
    onSuccess: (w) => { qc.setQueryData(['workflow'], w); setDraft(structuredClone(w)); toast.success(t('workflow.saved')); },
  });
  const set = (patch: Partial<WorkflowSettings>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const b2b = (customers.data ?? []).filter((c) => c.type === 'B2B');
  const nameOf = (id: string) => b2b.find((c) => c.id === id)?.name ?? id;
  const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));
  const currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: settings.currency }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? settings.currency;

  return (
    <div className="pb-24">
      <PageHeader title={t('workflow.title')} description={t('workflow.intro')} />
      <QueryView query={q}>
        {() => draft && (
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title={t('workflow.credit.title')} className="lg:col-span-2">
              <div className="grid gap-6 p-4 lg:grid-cols-2">
                <div>
                  <p className="mb-3 text-sm text-muted-foreground">{t('workflow.credit.text')}</p>
                  <RadioGroup value={draft.creditMode} onValueChange={(v) => set({ creditMode: v as Mode })} className="space-y-2">
                    {(['warn', 'block'] as const).map((m) => (
                      <label key={m} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-primary">
                        <RadioGroupItem value={m} className="mt-0.5" data-testid={`credit-mode-${m}`} />
                        <span><span className="block text-sm font-medium">{t(`workflow.credit.${m}`)}</span><span className="block text-xs text-muted-foreground">{t(`workflow.credit.${m}Text`)}</span></span>
                      </label>
                    ))}
                  </RadioGroup>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-medium">{t('workflow.credit.exceptions')}</h3>
                  <ul className="divide-y rounded-lg border" data-testid="credit-exceptions">
                    {Object.entries(draft.creditOverrides).length ? Object.entries(draft.creditOverrides).map(([id, mode]) => (
                      <li key={id} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">{nameOf(id)}</span>
                        <Select value={mode} onValueChange={(v) => set({ creditOverrides: { ...draft.creditOverrides, [id]: v as Mode } })}>
                          <SelectTrigger className="h-8 w-48" aria-label={nameOf(id)}><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="warn">{t('workflow.credit.warn')}</SelectItem><SelectItem value="block">{t('workflow.credit.block')}</SelectItem></SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('workflow.credit.remove')}
                          onClick={() => { const { [id]: _, ...rest } = draft.creditOverrides; set({ creditOverrides: rest }); }}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
                      </li>
                    )) : <li className="px-3 py-3 text-sm text-muted-foreground">{t('workflow.credit.none')}</li>}
                  </ul>
                  <div className="mt-2 flex gap-2">
                    <Select value={pick} onValueChange={setPick}>
                      <SelectTrigger className="h-9 flex-1" aria-label={t('workflow.credit.customer')} data-testid="exception-customer"><SelectValue placeholder={t('workflow.credit.customer')} /></SelectTrigger>
                      <SelectContent>{b2b.filter((c) => !(c.id in draft.creditOverrides)).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button variant="outline" disabled={!pick} data-testid="exception-add"
                      onClick={() => { set({ creditOverrides: { ...draft.creditOverrides, [pick]: draft.creditMode === 'warn' ? 'block' : 'warn' } }); setPick(''); }}>
                      <Plus className="me-1 h-4 w-4" aria-hidden="true" />{t('workflow.credit.add')}
                    </Button>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title={t('workflow.auto.title')}>
              <div className="space-y-3 p-4">
                <p className="text-sm text-muted-foreground">{t('workflow.auto.text')}</p>
                <label className="flex items-center justify-between gap-3 text-sm"><span>{t('workflow.auto.enabled')}</span>
                  <Switch checked={draft.autoApprove.enabled} onCheckedChange={(v) => set({ autoApprove: { ...draft.autoApprove, enabled: v } })} data-testid="auto-approve" /></label>
                <div className="space-y-1.5">
                  <Label htmlFor="max">{t('workflow.auto.max')}</Label>
                  <div className="flex items-center gap-2"><span className="text-sm text-muted-foreground">{currency}</span>
                    <Input id="max" inputMode="numeric" className="max-w-40" value={draft.autoApprove.maxTotal} disabled={!draft.autoApprove.enabled}
                      onChange={(e) => set({ autoApprove: { ...draft.autoApprove, maxTotal: num(e.target.value) } })} data-testid="auto-max" /></div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title={t('workflow.b2c.title')}>
              <div className="space-y-3 p-4">
                <p className="text-sm text-muted-foreground">{t('workflow.b2c.text')}</p>
                <label className="flex items-center justify-between gap-3 text-sm"><span>{t('workflow.b2c.enabled')}</span>
                  <Switch checked={draft.b2cAutoConvert} onCheckedChange={(v) => set({ b2cAutoConvert: v })} data-testid="b2c-auto" /></label>
              </div>
            </SectionCard>

            <SectionCard title={t('workflow.hold.title')}>
              <div className="space-y-2 p-4">
                <p className="text-sm text-muted-foreground">{t('workflow.hold.text')}</p>
                <div className="flex items-center gap-2"><Input id="hold" inputMode="numeric" className="max-w-24" value={draft.stockHoldHours} onChange={(e) => set({ stockHoldHours: num(e.target.value) })} data-testid="hold-hours" aria-label={t('workflow.hold.hours')} /><span className="text-sm text-muted-foreground">{t('workflow.hold.hours')}</span></div>
              </div>
            </SectionCard>

            <SectionCard title={t('workflow.expiry.title')}>
              <div className="space-y-2 p-4">
                <p className="text-sm text-muted-foreground">{t('workflow.expiry.text')}</p>
                <div className="flex items-center gap-2"><Input id="exp" inputMode="numeric" className="max-w-24" value={draft.requestExpiryDays} onChange={(e) => set({ requestExpiryDays: num(e.target.value) })} data-testid="expiry-days" aria-label={t('workflow.expiry.days')} /><span className="text-sm text-muted-foreground">{t('workflow.expiry.days')}</span></div>
              </div>
            </SectionCard>
          </div>
        )}
      </QueryView>

      {dirty && (
        <div className="fixed inset-x-0 bottom-16 z-40 border-t bg-card px-4 py-3 shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.25)] md:bottom-0 md:ps-20 lg:ps-72">
          <div className="mx-auto flex max-w-[1400px] items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => q.data && setDraft(structuredClone(q.data))}>{t('workflow.discard')}</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="workflow-save">{t('workflow.save')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
