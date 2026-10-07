'use client';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

/** UI-only state: connectivity (with demo offline simulation) and the AI panel. */
interface UICtx { online: boolean; browserOnline: boolean; simulateOffline: boolean; setSimulateOffline: (v: boolean) => void; assistantOpen: boolean; setAssistantOpen: (v: boolean) => void; }
const Ctx = createContext<UICtx | null>(null);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [browserOnline, setBrowserOnline] = useState(true);
  const [simulateOffline, setSim] = useState(false);
  const setSimulateOffline = (v: boolean) => { setSim(v); try { sessionStorage.setItem('nexus.simOffline', v ? '1' : '0'); } catch {} };
  const [assistantOpen, setAssistantOpen] = useState(false);
  useEffect(() => {
    const update = () => setBrowserOnline(navigator.onLine);
    update();
    try { setSim(sessionStorage.getItem('nexus.simOffline') === '1'); } catch {}
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  const value = useMemo(() => ({ online: browserOnline && !simulateOffline, browserOnline, simulateOffline, setSimulateOffline, assistantOpen, setAssistantOpen }), [browserOnline, simulateOffline, assistantOpen]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUI() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useUI must be used inside UIProvider');
  return c;
}
