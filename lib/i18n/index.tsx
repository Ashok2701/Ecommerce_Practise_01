'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import en from './locales/en.json';
import { setFormatLocale } from '@/lib/format';
import { useSettings, useSettingsLoaded, type LanguageMeta } from '@/lib/settings';

/**
 * Translations
 * ------------
 * Every piece of UI text comes from a language file. Lookup order for a key:
 *
 *   1. /i18n/overrides/<lang>.json   client wording (client-config/i18n/overrides, editable without rebuild)
 *   2. <lang> base file              lib/i18n/locales/<lang>.json, or /i18n/<lang>.json (client-config/i18n) for a client-added language
 *   3. /i18n/overrides/en.json       client's English wording
 *   4. English base file             lib/i18n/locales/en.json
 *   5. the key itself                (and a console warning in development)
 *
 * See docs/TRANSLATIONS.md.
 */
type Dict = { [k: string]: string | Dict };
type Vars = Record<string, string | number>;

/** Languages we ship. Clients enable a subset in settings.languages. */
export const LOCALES: LanguageMeta[] = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'fr', label: 'Français', dir: 'ltr' },
  { code: 'de', label: 'Deutsch', dir: 'ltr' },
  { code: 'es', label: 'Español', dir: 'ltr' },
  { code: 'it', label: 'Italiano', dir: 'ltr' },
  { code: 'pt', label: 'Português', dir: 'ltr' },
];

const BUNDLED: Record<string, () => Promise<Dict>> = {
  en: async () => en as Dict,
  fr: () => import('./locales/fr.json').then((m) => m.default as Dict),
  de: () => import('./locales/de.json').then((m) => m.default as Dict),
  es: () => import('./locales/es.json').then((m) => m.default as Dict),
  it: () => import('./locales/it.json').then((m) => m.default as Dict),
  pt: () => import('./locales/pt.json').then((m) => m.default as Dict),
};

const STORAGE_KEY = 'nexus.locale';

async function fetchJson(url: string): Promise<Dict> {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    return r.ok ? ((await r.json()) as Dict) : {};
  } catch { return {}; }
}

const cache = new Map<string, Promise<Dict>>();
const load = (k: string, f: () => Promise<Dict>) => { if (!cache.has(k)) cache.set(k, f().catch(() => ({}))); return cache.get(k)!; };
const loadBase = (code: string) => load(`base:${code}`, () => (BUNDLED[code] ? BUNDLED[code]() : fetchJson(`/i18n/${code}.json`)));
const loadOverride = (code: string) => load(`ovr:${code}`, () => fetchJson(`/i18n/overrides/${code}.json`));

function lookup(dict: Dict | undefined, path: string): string | Dict | undefined {
  let cur: string | Dict | undefined = dict;
  for (const k of path.split('.')) { if (cur == null || typeof cur === 'string') return undefined; cur = cur[k]; }
  return cur;
}

const warned = new Set<string>();

interface Layers { override: Dict; base: Dict; enOverride: Dict; }
interface I18nCtx {
  locale: string;
  setLocale: (code: string) => void;
  t: (key: string, vars?: Vars) => string;
  /** True when the key exists in any layer (useful for translating error codes). */
  has: (key: string) => boolean;
  dir: 'ltr' | 'rtl';
  languages: LanguageMeta[];
}
const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const settings = useSettings();
  const settingsLoaded = useSettingsLoaded();
  const languages = useMemo(() => {
    const all = [...LOCALES, ...settings.customLanguages];
    return settings.languages.map((c) => all.find((l) => l.code === c)).filter(Boolean) as LanguageMeta[];
  }, [settings.languages, settings.customLanguages]);

  const [locale, setLocaleState] = useState('en');
  const [layers, setLayers] = useState<Layers>({ override: {}, base: en as Dict, enOverride: {} });
  const req = useRef(0);

  // Pick the starting language once settings are known: saved choice, then browser, then the client default.
  useEffect(() => {
    if (!settingsLoaded) return;
    const ok = (c?: string | null) => !!c && languages.some((l) => l.code === c);
    let saved: string | null = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch {}
    const browser = navigator.language?.slice(0, 2);
    setLocaleState(ok(saved) ? saved! : ok(browser) ? browser : ok(settings.defaultLanguage) ? settings.defaultLanguage : languages[0]?.code ?? 'en');
  }, [settingsLoaded, languages, settings.defaultLanguage]);

  // Load the language files; keep showing the previous language until the new one is ready (no flash).
  useEffect(() => {
    const id = ++req.current;
    Promise.all([loadOverride(locale), loadBase(locale), loadOverride('en')]).then(([override, base, enOverride]) => {
      if (id === req.current) setLayers({ override, base, enOverride });
    });
  }, [locale]);

  const meta = languages.find((l) => l.code === locale) ?? LOCALES.find((l) => l.code === locale) ?? LOCALES[0];
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = meta.dir;
    setFormatLocale(locale, settings.region, settings.currency);
  }, [locale, meta.dir, settings.region, settings.currency]);

  const setLocale = useCallback((code: string) => {
    setLocaleState(code);
    try { localStorage.setItem(STORAGE_KEY, code); } catch {}
  }, []);

  const resolve = useCallback((key: string) =>
    lookup(layers.override, key) ?? lookup(layers.base, key) ?? lookup(layers.enOverride, key) ?? lookup(en as Dict, key), [layers]);

  const t = useCallback((key: string, vars?: Vars) => {
    let v = resolve(key);
    // Plurals: { "one": "...", "other": "..." } chosen by vars.count
    if (v && typeof v === 'object' && typeof vars?.count === 'number') {
      const form = new Intl.PluralRules(locale).select(vars.count);
      v = (v[form] ?? v.other) as string | Dict | undefined;
    }
    if (typeof v !== 'string') {
      if (process.env.NODE_ENV !== 'production' && !warned.has(key)) { warned.add(key); console.warn(`[i18n] missing key: ${key}`); }
      return key;
    }
    return vars ? v.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : v;
  }, [resolve, locale]);

  const has = useCallback((key: string) => typeof resolve(key) === 'string', [resolve]);

  const value = useMemo(() => ({ locale, setLocale, t, has, dir: meta.dir, languages }), [locale, setLocale, t, has, meta.dir, languages]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useT must be used inside I18nProvider');
  return c;
}

/** Turn an error into user-facing text: error messages are translation keys (e.g. "errors.auth.inactive"). */
export function useErrorText() {
  const { t, has } = useT();
  return useCallback((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err ?? '');
    return has(msg) ? t(msg) : t('errors.generic');
  }, [t, has]);
}
