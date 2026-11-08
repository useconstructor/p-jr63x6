'use client';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { ensureSession } from '@/lib/client/notes-api';
const Context = createContext({ ready: false, error: '', version: 0, retry: () => {}, guardHistory: (_guard: ((event: PopStateEvent) => void) | null) => {} });
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const historyGuard = useRef<((event: PopStateEvent) => void) | null>(null);
  const guardHistory = useCallback((guard: ((event: PopStateEvent) => void) | null) => { historyGuard.current = guard; }, []);
  useLayoutEffect(() => {
    const guard = (event: PopStateEvent) => historyGuard.current?.(event);
    window.addEventListener('popstate', guard);
    return () => window.removeEventListener('popstate', guard);
  }, []);
  const [ready, setReady] = useState(false); const [error, setError] = useState(''); const [version, setVersion] = useState(0);
  const start = useCallback((retry = false) => { setError(''); setReady(false); ensureSession(retry).then(() => setReady(true)).catch(e => setError(e.message)); }, []);
  useEffect(() => { start(); const invalidate = () => setVersion(v => v + 1); window.addEventListener('focus', invalidate); window.addEventListener('notas:changed', invalidate); const channel = 'BroadcastChannel' in window ? new BroadcastChannel('notas:updates') : null; if (channel) channel.onmessage = invalidate; return () => { channel?.close(); window.removeEventListener('focus', invalidate); window.removeEventListener('notas:changed', invalidate); }; }, [start]);
  return <Context.Provider value={{ready, error, version, guardHistory, retry: () => start(true)}}>{children}</Context.Provider>;
}
export const useSession = () => useContext(Context);
