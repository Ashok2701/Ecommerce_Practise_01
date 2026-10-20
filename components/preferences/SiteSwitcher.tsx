'use client';
import { Check, ChevronDown, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { useSite } from '@/lib/sites/SiteProvider';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

/** Header control for the working site. Shows a plain label when the user has only one site. */
export function SiteSwitcher({ className }: { className?: string }) {
  const { t } = useT();
  const { site, current, sites, setSite } = useSite();
  if (!site) return null;
  const label = (
    <>
      <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="font-semibold">{site}</span>
      {current?.name && current.name !== site && <span className="hidden max-w-[160px] truncate text-muted-foreground lg:inline">{current.name}</span>}
    </>
  );
  if (sites.length < 2) {
    return <span className={cn('inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm', className)} title={`${t('sites.label')}: ${current?.name ?? site}`} data-testid="site-label">{label}</span>;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={cn('h-9 gap-1.5 px-2 text-sm font-normal', className)} aria-label={`${t('sites.label')}: ${current?.name ?? site}`} data-testid="site-switcher">
          {label}<ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t('sites.choose')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {sites.map((s) => (
          <DropdownMenuItem key={s.code} data-testid={`site-${s.code}`}
            onSelect={() => { if (s.code !== site) { setSite(s.code); toast.success(t('sites.switched', { site: s.name })); } }}>
            <span className="w-16 shrink-0 text-xs font-semibold">{s.code}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm">{s.name}</span>{s.city && <span className="block text-xs text-muted-foreground">{s.city}</span>}</span>
            {s.code === site && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
