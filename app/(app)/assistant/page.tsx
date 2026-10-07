'use client';
import { ShieldCheck, Workflow, Database, Sparkles } from 'lucide-react';
import { AssistantPanel } from '@/components/assistant/AssistantPanel';
import { Card } from '@/components/ui/card';

export default function AssistantPage() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <AssistantPanel fullPage />
      <div className="hidden space-y-3 lg:block">
        <Card className="p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" />How the assistant will work</h2>
          <ol className="mt-3 space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-2"><Workflow className="mt-0.5 h-4 w-4 shrink-0 text-primary" />The LLM runs in the Node.js backend and only calls approved business functions (orders, invoices, catalog).</li>
            <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Every function call is checked against the signed-in user's role and data scope.</li>
            <li className="flex gap-2"><Database className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Data comes from the ERP adapter (Sage X3 today) – never direct database access.</li>
          </ol>
        </Card>
        <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">This is a <b>mock preview</b>. Responses are generated locally from the same service layer the UI uses.</Card>
      </div>
    </div>
  );
}
