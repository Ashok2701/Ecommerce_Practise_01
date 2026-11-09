'use client';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Send, Plus, ChevronLeft, MessageSquare, Package } from 'lucide-react';
import { toast } from 'sonner';
import { appConfig } from '@/lib/config';
import { messageService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { useT } from '@/lib/i18n';
import { fmtTime, initials, timeAgo, fmtDate } from '@/lib/format';
import { PageHeader, EmptyState, LoadingState } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { isCustomerRole } from '@/types/domain';

export default function MessagesPage() {
  const { t } = useT();
  const user = useUser();
  const qc = useQueryClient();
  const [sel, setSel] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [nf, setNf] = useState({ subject: '', body: '' });
  const endRef = useRef<HTMLDivElement>(null);
  const q = useQuery({ queryKey: ['conversations', user.id], queryFn: () => messageService.listConversations(user), refetchInterval: 4000 });
  const conv = q.data?.find((c) => c.id === sel);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['conversations'] });
  const read = useMutation({ mutationFn: (id: string) => messageService.markRead(id, user.id), onSuccess: invalidate });
  const send = useMutation({
    mutationFn: () => messageService.send(sel!, user, draft.trim()),
    onSuccess: (c) => { setDraft(''); invalidate(); if (isCustomerRole(user.role) && appConfig.dataSource === 'mock') setTimeout(() => { messageService.simulateReply(c.id); invalidate(); }, 2500); },
  });
  const create = useMutation({ mutationFn: () => messageService.create(user, nf.subject, nf.body), onSuccess: (c) => { invalidate(); setSel(c.id); setNewOpen(false); setNf({ subject: '', body: '' }); toast.success(t('messages.started')); if (isCustomerRole(user.role) && appConfig.dataSource === 'mock') setTimeout(() => { messageService.simulateReply(c.id); invalidate(); }, 2500); } });
  useEffect(() => { if (conv && conv.unreadBy.includes(user.id)) read.mutate(conv.id); }, [conv?.id]); // eslint-disable-line
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [conv?.messages.length, sel]);
  const s = search.toLowerCase();
  const list = (q.data ?? []).filter((c) => !s || [c.subject, ...c.participantNames, ...c.messages.map((m) => m.body)].some((v) => v.toLowerCase().includes(s)));

  return (
    <div>
      <PageHeader title={isCustomerRole(user.role) ? t('messages.titleCustomer') : t('nav.messages')} description={isCustomerRole(user.role) ? t('messages.introCustomer') : t('messages.introStaff')} actions={<Button onClick={() => setNewOpen(true)} data-testid="new-conversation"><Plus className="me-2 h-4 w-4" aria-hidden="true" />{t('messages.new')}</Button>} />
      {q.isLoading ? <LoadingState /> : (
        <Card className="grid h-[calc(100vh-15rem)] min-h-[460px] overflow-hidden md:grid-cols-[320px_1fr]">
          <div className={cn('flex min-h-0 flex-col border-e', sel && 'hidden md:flex')}>
            <div className="border-b p-3"><div className="relative"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input aria-label={t('messages.search')} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('messages.searchPlaceholder')} className="h-9 ps-9" /></div></div>
            <ul className="flex-1 divide-y overflow-y-auto" data-testid="conversation-list">
              {list.map((c) => { const last = c.messages[c.messages.length - 1]; const unread = c.unreadBy.includes(user.id); return (
                <li key={c.id}><button onClick={() => setSel(c.id)} className={cn('flex w-full gap-3 px-3 py-3 text-start hover:bg-muted/50', sel === c.id && 'bg-accent/60')} data-testid={`conv-${c.id}`}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials(last?.senderName)}</span>
                  <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className={cn('truncate text-sm', unread ? 'font-semibold' : 'font-medium')}>{c.subject}</span><span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(c.updatedAt)}</span></span>
                    <span className="flex items-center gap-2"><span className="truncate text-xs text-muted-foreground">{last?.senderName}: {last?.body}</span>{unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label={t('notifications.unreadTab')} />}</span></span>
                </button></li>
              ); })}
              {!list.length && <li className="p-4"><EmptyState icon={MessageSquare} title={t('messages.empty')} /></li>}
            </ul>
          </div>
          <div className={cn('flex min-h-0 flex-col', !sel && 'hidden md:flex')}>
            {!conv ? <div className="flex flex-1 items-center justify-center p-6"><EmptyState icon={MessageSquare} title={t('messages.select')} description={t('messages.selectText')} /></div> : (<>
              <div className="flex items-center gap-2 border-b px-4 py-3">
                <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSel(null)} aria-label={t('common.back')}><ChevronLeft className="h-5 w-5 rtl:rotate-180" /></Button>
                <div className="min-w-0"><div className="truncate text-sm font-semibold">{conv.subject}</div><div className="truncate text-xs text-muted-foreground">{Array.from(new Set(conv.messages.map((m) => m.senderName))).join(', ')}{conv.orderRef && <span className="ms-1 inline-flex items-center gap-1"><Package className="h-3 w-3" />{conv.orderRef}</span>}</div></div>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4" aria-live="polite" data-testid="message-thread">
                {conv.messages.map((m, i) => { const mine = m.senderId === user.id; const showDate = i === 0 || fmtDate(conv.messages[i - 1].at) !== fmtDate(m.at); return (
                  <div key={m.id}>
                    {showDate && <div className="my-2 text-center text-[11px] text-muted-foreground">{fmtDate(m.at)}</div>}
                    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                      <div className={cn('max-w-[80%] rounded-lg px-3.5 py-2 text-sm shadow-sm', mine ? 'bg-primary text-primary-foreground' : 'border bg-card')}>
                        {!mine && <div className="mb-0.5 text-[11px] font-semibold text-primary">{m.senderName} · {t(`roles.${m.senderRole}`)}</div>}
                        <p className="whitespace-pre-wrap">{m.body}</p>
                        <div className={cn('mt-1 text-end text-[10px]', mine ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{fmtTime(m.at)}</div>
                      </div>
                    </div>
                  </div>
                ); })}
                <div ref={endRef} />
              </div>
              <form onSubmit={(e) => { e.preventDefault(); if (draft.trim()) send.mutate(); }} className="flex gap-2 border-t p-3">
                <label htmlFor="reply" className="sr-only">{t('common.reply')}</label>
                <Input id="reply" data-testid="message-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('messages.replyPlaceholder')} className="h-10" />
                <Button type="submit" className="h-10" disabled={!draft.trim() || send.isPending} data-testid="message-send"><Send className="h-4 w-4 sm:me-2 rtl:-scale-x-100" aria-hidden="true" /><span className="hidden sm:inline">{t('common.send')}</span></Button>
              </form>
            </>)}
          </div>
        </Card>
      )}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('messages.new')}</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (nf.subject.trim() && nf.body.trim()) create.mutate(); }}>
            <div className="space-y-1.5"><Label htmlFor="ns">{t('messages.subject')}</Label><Input id="ns" data-testid="new-conv-subject" value={nf.subject} onChange={(e) => setNf({ ...nf, subject: e.target.value })} placeholder={t('messages.subjectPlaceholder')} /></div>
            <div className="space-y-1.5"><Label htmlFor="nb">{t('announcements.message')}</Label><Textarea id="nb" data-testid="new-conv-body" rows={4} value={nf.body} onChange={(e) => setNf({ ...nf, body: e.target.value })} /></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setNewOpen(false)}>{t('common.cancel')}</Button><Button type="submit" disabled={!nf.subject.trim() || !nf.body.trim() || create.isPending} data-testid="new-conv-send">{t('common.send')}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
