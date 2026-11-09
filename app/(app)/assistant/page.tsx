'use client';
import { ShieldCheck, Workflow, Database, Sparkles } from 'lucide-react';
import { AssistantPanel } from '@/components/assistant/AssistantPanel';
import { Card } from '@/components/ui/card';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings';

export default function AssistantPage() {
  const { t } = useT();
  const settings = useSettings();
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px] [&>*]:min-w-0">
      <AssistantPanel fullPage />
      <div className="hidden space-y-3 lg:block">
        <Card className="p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />{t('assistant.howTitle')}</h2>
          <ol className="mt-3 space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-2"><Workflow className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{t('assistant.how1')}</li>
            <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{t('assistant.how2')}</li>
            <li className="flex gap-2"><Database className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{t('assistant.how3', { erp: settings.erpName })}</li>
          </ol>
        </Card>
        <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t('assistant.mockNote')}</Card>
      </div>
    </div>
  );
}
