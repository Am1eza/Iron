import { ApiError } from './errors';
import { BASE_URL, DEFAULT_GET_RETRIES, DEFAULT_TIMEOUT_MS } from './config';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions<T> {
  method?: Method;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
  schema?: { parse: (data: unknown) => T };
  cache?: RequestCache;
  next?: { revalidate?: number | false; tags?: string[] };
}

/* ---- request interceptor (locale, future CSRF/token) ---- */
type RequestHook = (headers: Headers) => void;
let requestHook: RequestHook = (h) => h.set('Accept-Language', 'fa');
export function setRequestHook(hook: RequestHook) {
  requestHook = hook;
}

/* ---- helpers ---- */
const backoff = (n: number) => new Promise((r) => setTimeout(r, Math.min(2 ** n * 200, 2000)));

function anySignal(signals: AbortSignal[]): AbortSignal {
  const ctrl = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      ctrl.abort(s.reason);
      break;
    }
    s.addEventListener('abort', () => ctrl.abort(s.reason), { once: true });
  }
  return ctrl.signal;
}

async function toApiError(res: Response): Promise<ApiError> {
  let message = 'خطایی رخ داد. دوباره تلاش کنید.';
  let fields: Record<string, string> | undefined;
  let code: string | undefined;
  try {
    const body = (await res.json()) as { message?: string; fields?: Record<string, string>; error?: string };
    if (body?.message) message = body.message;
    fields = body?.fields;
    code = body?.error;
  } catch {
    /* keep the friendly default */
  }
  return new ApiError(res.status, message, { fields, code });
}

function buildInit<T>(opts: RequestOptions<T>): RequestInit & { headers: Headers } {
  const headers = new Headers({ 'Content-Type': 'application/json', ...(opts.headers ?? {}) });
  requestHook(headers);
  return {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: 'include',
    cache: opts.cache,
    ...(opts.next ? { next: opts.next } : {}),
  } as RequestInit & { headers: Headers };
}

/** Core request: timeout, retry-with-backoff (idempotent GET), normalized errors, optional schema. */
export async function httpRequest<T>(path: string, opts: RequestOptions<T> = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const init = buildInit(opts);
  const maxRetries = opts.retries ?? (method === 'GET' ? DEFAULT_GET_RETRIES : 0);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let attempt = 0;
  for (;;) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const signal = opts.signal ? anySignal([opts.signal, ctrl.signal]) : ctrl.signal;
    try {
      const res = await fetch(url, { ...init, signal });
      clearTimeout(timer);
      if (!res.ok) {
        if (method === 'GET' && res.status >= 500 && attempt < maxRetries) {
          attempt++;
          await backoff(attempt);
          continue;
        }
        throw await toApiError(res);
      }
      if (res.status === 204) return undefined as T;
      const data = (await res.json()) as unknown;
      return opts.schema ? opts.schema.parse(data) : (data as T);
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof ApiError) throw e;
      if (method === 'GET' && attempt < maxRetries) {
        attempt++;
        await backoff(attempt);
        continue;
      }
      throw new ApiError(0, 'ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.');
    }
  }
}

/** Streaming POST (AI). Returns the Response; caller reads response.body. */
export async function httpStream(
  path: string,
  body: unknown,
  opts?: { signal?: AbortSignal },
): Promise<Response> {
  const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'text/event-stream' });
  requestHook(headers);
  const res = await fetch(path.startsWith('http') ? path : `${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    credentials: 'include',
    signal: opts?.signal,
  });
  if (!res.ok) throw await toApiError(res);
  return res;
}

export const http = {
  get: <T>(path: string, opts?: Omit<RequestOptions<T>, 'method' | 'body'>) =>
    httpRequest<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions<T>, 'method'>) =>
    httpRequest<T>(path, { ...opts, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions<T>, 'method'>) =>
    httpRequest<T>(path, { ...opts, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions<T>, 'method'>) =>
    httpRequest<T>(path, { ...opts, method: 'PATCH', body }),
  del: <T>(path: string, opts?: Omit<RequestOptions<T>, 'method' | 'body'>) =>
    httpRequest<T>(path, { ...opts, method: 'DELETE' }),
  stream: httpStream,
};
