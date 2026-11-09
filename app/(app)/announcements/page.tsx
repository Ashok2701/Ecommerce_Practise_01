'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pin, Pencil, Trash2, Megaphone, Eye, EyeOff, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { announcementService } from '@/lib/services';
import { useUser } from '@/lib/auth/AuthProvider';
import { canManageContent } from '@/lib/auth/permissions';
import { useT } from '@/lib/i18n';
import { fmtDate } from '@/lib/format';
import { PageHeader, QueryView, EmptyState } from '@/components/common';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { Announcement, Audience } from '@/types/domain';

const CAT_TONE = { company: 'bg-blue-50 text-blue-700', product: 'bg-violet-50 text-violet-700', notice: 'bg-amber-50 text-amber-800' };
const AUD: Audience[] = ['all', 'CUSTOMER_B2B', 'CUSTOMER_B2C', 'SALES_REP', 'SUPERVISOR', 'SUPPLIER'];

function Editor({ value, onClose }: { value: Partial<Announcement> | null; onClose: () => void }) {
  const { t } = useT();
  const user = useUser();
  const qc = useQueryClient();
  const [f, setF] = useState<Partial<Announcement>>(value ?? {});
  const m = useMutation({ mutationFn: () => announcementService.save({ ...f, title: f.title! }, user.name), onSuccess: () => { qc.invalidateQueries(); toast.success(f.id ? t('announcements.updated') : t('announcements.created')); onClose(); } });
  const set = (k: keyof Announcement, v: any) => setF((s) => ({ ...s, [k]: v }));
  const aud = f.audience ?? ['all'];
  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{f.id ? t('announcements.editTitle') : t('announcements.new')}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!f.title?.trim()) return toast.error(t('announcements.titleRequired')); m.mutate(); }}>
          <div className="space-y-1.5"><Label htmlFor="a-title">{t('announcements.titleLabel')}</Label><Input id="a-title" data-testid="ann-title" value={f.title ?? ''} onChange={(e) => set('title', e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="a-body">{t('announcements.message')}</Label><Textarea id="a-body" data-testid="ann-body" rows={4} value={f.body ?? ''} onChange={(e) => set('body', e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>{t('announcements.categoryLabel')}</Label><Select value={f.category ?? 'company'} onValueChange={(v) => set('category', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="company">{t('announcements.category.company')}</SelectItem><SelectItem value="product">{t('announcements.category.product')}</SelectItem><SelectItem value="notice">{t('announcements.category.notice')}</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label>{t('common.status')}</Label><Select value={f.status ?? 'draft'} onValueChange={(v) => set('status', v)}><SelectTrigger data-testid="ann-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">{t('status.draft')}</SelectItem><SelectItem value="scheduled">{t('status.scheduled')}</SelectItem><SelectItem value="published">{t('announcements.publishNow')}</SelectItem></SelectContent></Select></div>
          </div>
          {f.status === 'scheduled' && <div className="space-y-1.5"><Label htmlFor="a-date">{t('announcements.publishOn')}</Label><Input id="a-date" type="datetime-local" value={(f.publishAt ?? '').slice(0, 16)} onChange={(e) => set('publishAt', new Date(e.target.value).toISOString())} /></div>}
          <fieldset><legend className="mb-2 text-sm font-medium">{t('announcements.target')}</legend><div className="flex flex-wrap gap-3">{AUD.map((a) => (
            <label key={a} className="flex items-center gap-2 text-sm capitalize"><Checkbox checked={aud.includes(a)} onCheckedChange={(v) => set('audience', v ? (a === 'all' ? ['all'] : [...aud.filter((x) => x !== 'all'), a]) : aud.filter((x) => x !== a))} />{a === 'all' ? t('announcements.everyone') : t(`roles.${a}`)}</label>
          ))}</div></fieldset>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!f.pinned} onCheckedChange={(v) => set('pinned', !!v)} />{t('announcements.pinToTop')}</label>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" disabled={m.isPending} data-testid="ann-save">{t('common.save')}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AnnouncementsPage() {
  const { t } = useT();
  const user = useUser();
  const qc = useQueryClient();
  const manage = canManageContent(user.role);
  const [cat, setCat] = useState('all');
  const [edit, setEdit] = useState<Partial<Announcement> | null>(null);
  const [del, setDel] = useState<Announcement | null>(null);
  const q = useQuery({ queryKey: ['announcements', user.role, manage], queryFn: () => announcementService.list(user.role, manage) });
  const status = useMutation({ mutationFn: ({ id, s }: { id: string; s: Announcement['status'] }) => announcementService.setStatus(id, s), onSuccess: (a) => { qc.invalidateQueries(); toast.success(a.status === 'published' ? t('announcements.publishedToast') : t('announcements.unpublishedToast')); } });
  const remove = useMutation({ mutationFn: (id: string) => announcementService.remove(id), onSuccess: () => { qc.invalidateQueries(); toast.success(t('announcements.deleted')); } });
  const rows = (q.data ?? []).filter((a) => cat === 'all' || a.category === cat);
  return (
    <div>
      <PageHeader title={t('nav.announcements')} description={manage ? t('announcements.introManage') : t('announcements.introView')} actions={manage ? <Button onClick={() => setEdit({ audience: ['all'], status: 'draft', category: 'company' })} data-testid="new-announcement"><Plus className="me-2 h-4 w-4" />{t('announcements.new')}</Button> : undefined} />
      <div className="mb-4 flex gap-1.5 overflow-x-auto scrollbar-none" role="tablist">{['all', 'company', 'product', 'notice'].map((k) => <button key={k} role="tab" aria-selected={cat === k} onClick={() => setCat(k)} className={cn('shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium', cat === k ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground')}>{k === 'all' ? t('common.all') : k === 'notice' ? t('announcements.notices') : t(`announcements.category.${k}`)}</button>)}</div>
      <QueryView query={q} isEmpty={() => !rows.length} empty={<EmptyState icon={Megaphone} title={t('announcements.empty')} />}>
        {() => (
          <ul className="space-y-3" data-testid="announcements-list">
            {rows.map((a) => (
              <li key={a.id}><Card className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={cn('rounded px-1.5 py-0.5 font-medium', CAT_TONE[a.category])}>{t(`announcements.category.${a.category}`)}</span>
                      {a.pinned && <span className="flex items-center gap-1 text-muted-foreground"><Pin className="h-3 w-3" />{t('announcements.pinned')}</span>}
                      <span className="text-muted-foreground">{a.status === 'scheduled' ? <span className="flex items-center gap-1"><CalendarClock className="h-3 w-3" />{t('announcements.scheduledFor', { date: fmtDate(a.publishAt) })}</span> : fmtDate(a.publishAt)} · {a.createdBy}</span>
                      {manage && <StatusBadge status={a.status} />}
                    </div>
                    <h2 className="mt-2 font-semibold"><Link href={`/announcements/${a.id}`} className="hover:text-primary" data-testid={`ann-link-${a.id}`}>{a.title}</Link></h2>
                    <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{a.body}</p>
                    {manage && <p className="mt-2 text-xs text-muted-foreground">{t('announcements.audience')}: {a.audience.includes('all') ? t('announcements.everyone') : a.audience.map((x) => t(`roles.${x}`)).join(', ')}</p>}
                  </div>
                  {manage && <div className="flex shrink-0 gap-1">
                    {a.status !== 'published' ? <Button size="sm" onClick={() => status.mutate({ id: a.id, s: 'published' })} data-testid={`publish-${a.id}`}><Eye className="me-1 h-3.5 w-3.5" />{t('announcements.publish')}</Button> : <Button size="sm" variant="outline" onClick={() => status.mutate({ id: a.id, s: 'draft' })}><EyeOff className="me-1 h-3.5 w-3.5" />{t('announcements.unpublish')}</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setEdit(a)} aria-label={t('common.edit')}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setDel(a)} aria-label={t('common.delete')}><Trash2 className="h-4 w-4" /></Button>
                  </div>}
                </div>
              </Card></li>
            ))}
          </ul>
        )}
      </QueryView>
      {edit && <Editor value={edit} onClose={() => setEdit(null)} />}
      <ConfirmDialog open={!!del} onOpenChange={(v) => !v && setDel(null)} title={t('announcements.deleteTitle')} description={del?.title} confirmLabel={t('common.delete')} destructive onConfirm={() => del && remove.mutate(del.id)} />
    </div>
  );
}
