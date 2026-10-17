'use client';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Check, ChevronDown, Languages, Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

/** Language picker. Shows only the languages the client enabled in settings. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, languages, t } = useT();
  const cur = languages.find((l) => l.code === locale);
  if (languages.length < 2) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={cn('h-9 gap-1.5 px-2.5 font-medium', className)} data-testid="language-switcher" aria-label={t('meta.language')}>
          <Languages className="h-4 w-4" aria-hidden="true" /><span>{cur?.label ?? locale}</span><ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t('meta.language')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {languages.map((l) => (
          <DropdownMenuItem key={l.code} onSelect={() => setLocale(l.code)} data-testid={`lang-${l.code}`} lang={l.code} dir={l.dir}>
            <span className="flex-1">{l.label}</span>{locale === l.code && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const THEMES = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
] as const;

/** Light / dark / system theme picker. */
export function ThemeSwitcher({ className }: { className?: string }) {
  const { t } = useT();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const Icon = !mounted ? Monitor : resolvedTheme === 'dark' ? Moon : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn('h-9 w-9', className)} aria-label={t('theme.label')} data-testid="theme-switcher">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t('theme.label')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {THEMES.map(({ value, icon: I }) => (
          <DropdownMenuItem key={value} onSelect={() => setTheme(value)} data-testid={`theme-${value}`}>
            <I className="mr-2 h-4 w-4" aria-hidden="true" /><span className="flex-1">{t(`theme.${value}`)}</span>
            {mounted && theme === value && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
