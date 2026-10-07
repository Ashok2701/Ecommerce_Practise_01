'use client';
import { useCallback, useEffect, useState } from 'react';

/** Captures the browser's install prompt so the app can offer "Install app". */
export function useInstallPrompt() {
  const [evt, setEvt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setEvt(e); };
    const i = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', h);
    window.addEventListener('appinstalled', i);
    if (window.matchMedia?.('(display-mode: standalone)').matches) setInstalled(true);
    return () => { window.removeEventListener('beforeinstallprompt', h); window.removeEventListener('appinstalled', i); };
  }, []);
  const prompt = useCallback(async () => { if (!evt) return; evt.prompt(); await evt.userChoice; setEvt(null); }, [evt]);
  return { available: !!evt, installed, prompt };
}
