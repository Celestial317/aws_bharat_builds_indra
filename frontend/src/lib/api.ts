// Single place that talks to the INDRA backend: base URL, auth headers, error shape.
import { auth } from './firebase';

// "" (empty) means same-origin (nginx proxies /api). Unset falls back to the local dev server.
const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(status: number, message: string, code = 'error', requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  /** Attach the signed-in user's identity (needed for tanks, subscriptions, admin actions). */
  auth?: boolean;
}

async function authHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  const headers: Record<string, string> = { 'X-Demo-User': user.uid }; // honoured only by AUTH_MODE=demo
  try {
    headers.Authorization = `Bearer ${await user.getIdToken()}`;
  } catch {
    // token refresh failed (offline); the request will be rejected with 401 if the server needs it
  }
  return headers;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const params = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  const qs = params.toString();
  return `${BASE}${path}${qs ? `?${qs}` : ''}`;
}

/** Accepts the new `{error:{message}}` shape and the legacy FastAPI `{detail}` shape. */
function messageFrom(payload: unknown, fallback: string): { message: string; code?: string; requestId?: string } {
  if (payload && typeof payload === 'object') {
    const p = payload as { error?: { message?: string; code?: string; request_id?: string }; detail?: unknown };
    if (p.error?.message) return { message: p.error.message, code: p.error.code, requestId: p.error.request_id };
    if (typeof p.detail === 'string') return { message: p.detail };
  }
  return { message: fallback };
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal, auth: needsAuth = false } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (needsAuth) Object.assign(headers, await authHeaders());

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'Cannot reach the INDRA server. Check your connection or that the backend is running.', 'network');
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON error page from a proxy
  }
  if (!response.ok) {
    const { message, code, requestId } = messageFrom(payload, `Request failed (${response.status})`);
    throw new ApiError(response.status, message, code, requestId);
  }
  return payload as T;
}

export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
