'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import en, { type Dictionary } from './locales/en';

/**
 * Locale registry. Additional languages are lazy-loaded dictionaries that
 * fall back to English for missing keys. Arabic is flagged RTL.
 */
export const LOCALES = [
  { code: 'en', label: 'English', dir: 'ltr', ready: true },
  { code: 'te', label: 'తెలుగు (Telugu)', dir: 'ltr', ready: false },
  { code: 'hi', label: 'हिन्दी (Hindi)', dir: 'ltr', ready: false },
  { code: 'ar', label: 'العربية (Arabic)', dir: 'rtl', ready: false },
  { code: 'fr', label: 'Français', dir: 'ltr', ready: false },
  { code: 'es', label: 'Español', dir: 'ltr', ready: false },
] as const;
export type LocaleCode = (typeof LOCALES)[number]['code'];

const dictionaries: Partial<Record<LocaleCode, Partial<Dictionary>>> = { en };

function lookup(dict: any, path: string) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict);
}

interface I18nCtx { locale: LocaleCode; setLocale: (l: LocaleCode) => void; t: (key: string, vars?: Record<string, string | number>) => string; dir: 'ltr' | 'rtl'; }
const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>('en');
  useEffect(() => { const s = localStorage.getItem('nexus.locale') as LocaleCode | null; if (s) setLocaleState(s); }, []);
  const meta = LOCALES.find((l) => l.code === locale)!;
  useEffect(() => { document.documentElement.lang = locale; document.documentElement.dir = meta.dir; }, [locale, meta.dir]);
  const setLocale = useCallback((l: LocaleCode) => { setLocaleState(l); localStorage.setItem('nexus.locale', l); }, []);
  const t = useCallback((key: string, vars?: Record<string, string | number>) => {
    let s = lookup(dictionaries[locale], key) ?? lookup(en, key) ?? key;
    if (typeof s !== 'string') return key;
    if (vars) Object.entries(vars).forEach(([k, v]) => { s = (s as string).replace(`{${k}}`, String(v)); });
    return s as string;
  }, [locale]);
  const value = useMemo(() => ({ locale, setLocale, t, dir: meta.dir as 'ltr' | 'rtl' }), [locale, setLocale, t, meta.dir]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useT must be used inside I18nProvider');
  return c;
}
