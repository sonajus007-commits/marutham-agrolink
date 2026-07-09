/* Core fetch wrapper — typed port of frontend/js/api.js `apiFetch`.
 * Base URL defaults to relative (same origin as the page), matching the legacy
 * config.js `API_BASE: ''`. In dev, Vite proxies these paths to the backend. */
import { getToken } from './session';

let API_BASE = '';

export function setApiBase(base: string): void {
  API_BASE = base;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export async function apiFetch<T = unknown>(
  method: Method,
  path: string,
  body?: unknown,
  auth = true,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
  }

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty / non-JSON body */
  }

  if (!res.ok) {
    const msg =
      (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) ||
      `Request failed (${res.status})`;
    throw new ApiError(String(msg), res.status);
  }
  return data as T;
}
