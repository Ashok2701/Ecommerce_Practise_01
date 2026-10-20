import { appConfig } from '@/lib/config';
import { getCurrentSite } from '@/lib/sites/current';

/**
 * Thin HTTP client for the future Node.js backend.
 * Auth token is attached from the session; the backend enforces permissions
 * and talks to the ERP adapter (Sage X3 today, SAP/Dynamics/Oracle later).
 */
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function token() {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem('nexus.session') || 'null')?.token ?? null; } catch { return null; }
}

async function request<T>(method: string, path: string, body?: unknown, query?: object): Promise<T> {
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString() : '';
  const res = await fetch(`${appConfig.apiBaseUrl}${path}${qs}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...(getCurrentSite() ? { 'X-Site': getCurrentSite()! } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    // Backend errors are { "code": "errors.requests.creditBlocked", "message": "..." }.
    // The code is a translation key, so the user sees the message in their language.
    const text = await res.text();
    let code = text;
    try { const j = JSON.parse(text); code = j.code ?? j.message ?? text; } catch {}
    throw new ApiError(res.status, code);
  }
  return res.json();
}

export const http = {
  get: <T,>(p: string, q?: object) => request<T>('GET', p, undefined, q),
  post: <T,>(p: string, b?: unknown) => request<T>('POST', p, b),
  patch: <T,>(p: string, b?: unknown) => request<T>('PATCH', p, b),
  put: <T,>(p: string, b?: unknown) => request<T>('PUT', p, b),
  del: <T,>(p: string) => request<T>('DELETE', p),
};

/** Route a service call to the mock repository or the real API. */
export async function source<T>(mock: () => T | Promise<T>, api: () => Promise<T>): Promise<T> {
  if (appConfig.dataSource === 'api') return api();
  await new Promise((r) => setTimeout(r, appConfig.mockLatencyMs * (0.5 + Math.random())));
  return JSON.parse(JSON.stringify(await mock()));
}
