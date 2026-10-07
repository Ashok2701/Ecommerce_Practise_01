'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Send, ShieldCheck, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { useUser } from '@/lib/auth/AuthProvider';
import { useT } from '@/lib/i18n';
import { useUI } from '@/lib/ui/UIProvider';
import { useCart } from '@/lib/cart/CartProvider';
import { assistantService, orderService, ASSISTANT_SUGGESTIONS, type AssistantReply } from '@/lib/services';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Msg { id: number; from: 'user' | 'ai'; text: string; reply?: AssistantReply; }

export function AssistantPanel({ fullPage = false }: { fullPage?: boolean }) {
  const { t } = useT();
  const user = useUser();
  const ui = useUI();
  const cart = useCart();
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, from: 'ai', text: `Hi ${user.name.split(' ')[0]}, I can answer questions about your orders, deliveries, balances and products. What would you like to know?` }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, busy]);

  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    setMsgs((m) => [...m, { id: Date.now(), from: 'user', text: q }]);
    setInput(''); setBusy(true);
    try {
      const reply = await assistantService.ask(q, user);
      setMsgs((m) => [...m, { id: Date.now() + 1, from: 'ai', text: reply.text, reply }]);
    } finally { setBusy(false); }
  };

  const act = async (a: NonNullable<AssistantReply['actions']>[number]) => {
    if (a.kind === 'reorder' && a.orderId) {
      const o = await orderService.getOrder(a.orderId);
      cart.replace(o.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })), o.customerId);
      toast.success(`${o.lines.length} items from ${o.number} added to cart`);
      ui.setAssistantOpen(false); router.push('/cart');
    } else if (a.href) { ui.setAssistantOpen(false); router.push(a.href); }
  };

  return (
    <div className={cn('flex h-full min-h-0 flex-col', fullPage && 'h-[calc(100vh-11rem)] rounded-lg border bg-card md:h-[calc(100vh-9rem)]')} data-testid="assistant-panel">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[hsl(216_58%_12%)]"><Sparkles className="h-4 w-4 text-sky-300" /></div>
        <div className="flex-1"><div className="flex items-center gap-2 text-sm font-semibold">{t('assistant.title')}<span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">{t('assistant.preview')}</span></div><div className="text-xs text-muted-foreground">Answers limited to your {t(`roles.${user.role}`)} permissions</div></div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {msgs.map((m) => (
          <div key={m.id} className={cn('flex', m.from === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[88%] rounded-lg px-3.5 py-2.5 text-sm', m.from === 'user' ? 'bg-primary text-primary-foreground' : 'border bg-muted/40')}>
              <p>{m.text}</p>
              {!!m.reply?.bullets?.length && <ul className="mt-2 space-y-1 text-[13px]">{m.reply.bullets.map((b, i) => <li key={i} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-current opacity-60" />{b}</li>)}</ul>}
              {!!m.reply?.actions?.length && <div className="mt-3 flex flex-wrap gap-2">{m.reply.actions.map((a, i) => <Button key={i} size="sm" variant={a.kind ? 'default' : 'outline'} className="h-8" onClick={() => act(a)} data-testid="assistant-action">{a.label}</Button>)}</div>}
              {m.reply?.tool && <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground"><Wrench className="h-3 w-3" />via <code className="font-mono">{m.reply.tool}</code></div>}
            </div>
          </div>
        ))}
        {busy && <div className="flex gap-1 px-2" aria-label="Assistant is typing">{[0, 1, 2].map((i) => <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50" style={{ animationDelay: `${i * 120}ms` }} />)}</div>}
        <div ref={endRef} />
      </div>
      <div className="border-t p-3">
        <div className="mb-2 flex gap-2 overflow-x-auto scrollbar-none">
          {(ASSISTANT_SUGGESTIONS[user.role] ?? []).map((s) => <button key={s} onClick={() => ask(s)} className="shrink-0 rounded-full border bg-background px-3 py-1 text-xs hover:border-primary/40 hover:text-primary">{s}</button>)}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="flex gap-2">
          <label htmlFor="ai-input" className="sr-only">{t('assistant.placeholder')}</label>
          <input id="ai-input" data-testid="assistant-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder={t('assistant.placeholder')} className="h-10 flex-1 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          <Button type="submit" size="icon" className="h-10 w-10" disabled={!input.trim() || busy} aria-label={t('common.send')}><Send className="h-4 w-4" /></Button>
        </form>
        <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground"><ShieldCheck className="h-3 w-3" />{t('assistant.disclaimer')}</p>
      </div>
    </div>
  );
}
