'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';

/**
 * Per-installation settings. Every client runs their own copy of the portal,
 * so anything client-specific lives here, never in code.
 *
 * Defaults below are overridden at runtime by `/config/settings.json`
 * (client-config/settings.json, served by app/config/settings.json/route.ts).
 * Clients edit that file — no rebuild needed.
 * Later the backend will serve the same shape from `/api/settings`.
 */
export interface LanguageMeta { code: string; label: string; dir: 'ltr' | 'rtl'; }

export interface AppSettings {
  productName: string;
  companyName: string;
  /** Optional logo image URL. When empty, a monogram of productName is shown. */
  logoUrl: string;
  /** Brand colour as hex, e.g. "#0F5257". Drives buttons, links and focus rings. */
  brandColor: string;
  erpName: string;
  defaultLanguage: string;
  /** Language codes offered to users, in menu order. */
  languages: string[];
  /** Extra languages supplied by the client as /i18n/<code>.json files. */
  customLanguages: LanguageMeta[];
  /** Region used for number and date formats, e.g. "IN" gives 1,00,000. */
  region: string;
  currency: string;
  /** Show one-click demo accounts on the login page. Turn off in production. */
  demoMode: boolean;
  sso: { enabled: boolean; provider: string };
  privacyUrl: string;
  termsUrl: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  productName: 'Nexus B2B',
  companyName: 'Demo Company',
  logoUrl: '',
  brandColor: '#0F5257',
  erpName: 'Sage X3',
  defaultLanguage: 'en',
  languages: ['en', 'fr', 'de', 'es', 'it', 'pt'],
  customLanguages: [],
  region: 'IN',
  currency: 'INR',
  demoMode: true,
  sso: { enabled: false, provider: 'Microsoft' },
  privacyUrl: '',
  termsUrl: '',
};

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '0.4.0';

/** "#0F5257" -> "183 69% 20%" (the HSL triplet format our CSS tokens use). */
export function hexToHslTriplet(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function applyBrand(s: AppSettings) {
  const hsl = hexToHslTriplet(s.brandColor);
  if (!hsl) return;
  const [h, sat, l] = hsl.split(' ');
  const root = document.documentElement.style;
  root.setProperty('--brand-h', h);
  root.setProperty('--brand-s', sat);
  root.setProperty('--brand-l', l);
}

interface SettingsCtx { settings: AppSettings; loaded: boolean; }
const Ctx = createContext<SettingsCtx>({ settings: DEFAULT_SETTINGS, loaded: false });

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SettingsCtx>({ settings: DEFAULT_SETTINGS, loaded: false });
  useEffect(() => {
    let alive = true;
    fetch('/config/settings.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((remote: Partial<AppSettings>) => {
        if (!alive) return;
        const settings: AppSettings = { ...DEFAULT_SETTINGS, ...remote, sso: { ...DEFAULT_SETTINGS.sso, ...(remote.sso ?? {}) } };
        if (!settings.languages?.length) settings.languages = DEFAULT_SETTINGS.languages;
        applyBrand(settings);
        setState({ settings, loaded: true });
      });
    return () => { alive = false; };
  }, []);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useSettings = () => useContext(Ctx).settings;
export const useSettingsLoaded = () => useContext(Ctx).loaded;
