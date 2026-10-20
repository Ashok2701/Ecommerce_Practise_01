'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/AuthProvider';
import { siteService } from '@/lib/services/siteService';
import { setCurrentSite } from './current';
import type { Site } from '@/types/domain';

interface SiteCtx {
  /** Current site code, or null when signed out or no site is assigned. */
  site: string | null;
  /** Full record of the current site. */
  current?: Site;
  /** Sites this user may switch between. */
  sites: Site[];
  setSite: (code: string) => void;
}
const Ctx = createContext<SiteCtx>({ site: null, sites: [], setSite: () => {} });

export function SiteProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const allowed = useMemo(() => user?.allowedSites ?? [], [user]);
  const key = user ? `nexus.site.${user.id}` : null;
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    let saved: string | null = null;
    try { saved = key ? localStorage.getItem(key) : null; } catch {}
    setChosen(saved);
  }, [key]);

  const site = !user ? null
    : chosen && allowed.includes(chosen) ? chosen
    : user.defaultSite && allowed.includes(user.defaultSite) ? user.defaultSite
    : allowed[0] ?? null;

  // Set synchronously so every query started in this render already carries the site.
  setCurrentSite(site);

  // A different site means different stock, prices and documents: drop cached data and refetch.
  const prev = useRef(site);
  useEffect(() => {
    if (prev.current !== site) { prev.current = site; qc.resetQueries(); }
  }, [site, qc]);

  const all = useQuery({ queryKey: ['sites'], queryFn: siteService.list, enabled: !!user, staleTime: 10 * 60_000 });
  const sites = useMemo(() => allowed.map((c) => all.data?.find((s) => s.code === c) ?? { code: c, name: c, city: '', kind: 'warehouse' as const }), [allowed, all.data]);

  const setSite = useCallback((code: string) => {
    if (!allowed.includes(code)) return;
    setChosen(code);
    try { if (key) localStorage.setItem(key, code); } catch {}
  }, [allowed, key]);

  const value = useMemo(() => ({ site, current: sites.find((s) => s.code === site), sites, setSite }), [site, sites, setSite]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSite = () => useContext(Ctx);
