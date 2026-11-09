'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authService, type Session } from '@/lib/services/authService';
import type { User } from '@/types/domain';

interface AuthCtx { user: User | null; ready: boolean; login: (email: string, password: string) => Promise<User>; logout: () => void; }
const Ctx = createContext<AuthCtx | null>(null);
const KEY = 'nexus.session';

/** Session abstraction – swap authService.login for the Node.js auth endpoint later. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try { const s = localStorage.getItem(KEY); if (s) setSession(JSON.parse(s)); } catch {}
    setReady(true);
  }, []);
  const login = useCallback(async (email: string, password: string) => {
    const s = await authService.login(email, password);
    localStorage.setItem(KEY, JSON.stringify(s));
    setSession(s);
    return s.user;
  }, []);
  // signing out also drops the catalogue and customer data the service worker kept for offline use
  const logout = useCallback(() => { localStorage.removeItem(KEY); try { void caches?.delete('nexus-api-catalogue-v1'); } catch { /* no Cache API */ } setSession(null); }, []);
  const value = useMemo(() => ({ user: session?.user ?? null, ready, login, logout }), [session, ready, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used inside AuthProvider');
  return c;
}

/** Signed-in user (only use under the protected (app) layout). */
export function useUser() { return useAuth().user as User; }
