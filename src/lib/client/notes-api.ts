export type Note = { id: string; title: string; text: string; pinned: boolean; created_at: string; updated_at: string; revision: number };
export type Summary = { total: number; pinned: number; recent: Note[]; pinnedNotes: Note[] };
export type Operation = { method: 'POST'; endpoint: string; body: Record<string, string | number | boolean> };
export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public fields?: Record<string, string>, public current?: Note) { super(message); }
}
export async function request<T>(endpoint: string, body?: object, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(20000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await fetch(endpoint, { method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin', signal: requestSignal, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  let data;
  try { data = await response.json(); } catch { throw new Error('No se pudo confirmar la respuesta del servidor.'); }
  if (!response.ok) throw new ApiError(response.status, data.error?.message || 'No se pudo completar la acción. Reintenta.', data.error?.code, data.error?.fields, data.current);
  return data as T;
}
let initialization: Promise<void> | null = null;
export function ensureSession(retry = false): Promise<void> {
  if (retry) initialization = null;
  if (!initialization) initialization = (async () => {
    if (!navigator.locks) throw new Error('Este navegador no permite iniciar una sesión privada de forma segura. Abre la app en un navegador compatible y reintenta.');
    await navigator.locks.request('notas-de-bolsillo:session', { mode: 'exclusive' }, async () => {
      try { await request('/api/session', { action: 'verify' }); return; }
      catch (error) { if (!(error instanceof ApiError) || error.status !== 401) throw error; }
      await request('/api/session', { action: 'ensure' });
      try { await request('/api/session', { action: 'verify' }); }
      catch { throw new Error('El navegador debe permitir la cookie de sesión para abrir tus notas. Revisa los permisos de cookies y reintenta.'); }
    });
  })();
  return initialization;
}
export function dateLabel(value: string) { return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
export function notifyNotesChanged() {
  window.dispatchEvent(new Event('notas:changed'));
  if ('BroadcastChannel' in window) { const channel = new BroadcastChannel('notas:updates'); channel.postMessage('changed'); channel.close(); }
}
export const recoveryKey = 'notas:pending-operations:v1';
export function readOperations(): Operation[] {
  try { const values = JSON.parse(sessionStorage.getItem(recoveryKey) || '[]'); return Array.isArray(values) ? values.filter((o) => o.method === 'POST' && /^\/api\/notas(?:\/[\da-f-]+\/(?:guardar|fijar|eliminar))?$/.test(o.endpoint) && typeof o.body?.idempotency_key === 'string') : []; } catch { return []; }
}
export function retainOperation(operation: Operation) { const all = readOperations(); if (!all.some(o => o.body.idempotency_key === operation.body.idempotency_key)) all.push(operation); sessionStorage.setItem(recoveryKey, JSON.stringify(all)); }
export function clearOperation(operation: Operation) { sessionStorage.setItem(recoveryKey, JSON.stringify(readOperations().filter(o => o.body.idempotency_key !== operation.body.idempotency_key))); }

/** Only a fixed action name is sent; note values never enter analytics. */
export function trackNoteStarted() {
 (window as Window & {constructorTrack?: (event:string)=>void}).constructorTrack?.('Nota iniciada');
}
