/* Core fetch wrapper — typed port of frontend/js/api.js `apiFetch`.
 * Base URL is relative (same origin as the page), matching the legacy
 * config.js. In dev, Vite proxies /api to the backend.
 *
 * The API lives under /api. It used to sit at the root, but the root is the
 * public marketplace's SEO surface (a product page must be able to live at
 * /products/…), so the API moved. Callers still pass root-relative paths —
 * apiFetch('GET', '/orders') — and this prefixes them; nothing else in the app
 * should know the prefix exists. */
import { getToken } from './session';

let API_BASE = '/api';

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

/**
 * GET a binary response (e.g. a generated PDF) as a Blob, carrying auth. The plain
 * apiFetch always parses JSON, which a PDF body is not — so file endpoints use this.
 * An error response IS JSON, so its `error` is read back out for the thrown message.
 */
export async function apiFetchBlob(path: string): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(API_BASE + path, { method: 'GET', headers });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data && typeof data === 'object' && 'error' in data) msg = String(data.error);
    } catch {
      /* non-JSON error body — keep the status message */
    }
    throw new ApiError(msg, res.status);
  }
  return res.blob();
}
