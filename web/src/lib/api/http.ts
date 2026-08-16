import { ApiError } from './errors';
import { BASE_URL, DEFAULT_GET_RETRIES, DEFAULT_TIMEOUT_MS, UPLOAD_TIMEOUT_MS } from './config';

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

/**
 * 401 recovery — registered by AuthHydrator while a session is active. The
 * access token is short-lived and normally rotated by a background timer,
 * but a hidden/backgrounded tab can have that timer throttled or suspended
 * by the browser past the token's real expiry, so a request can genuinely
 * hit a stale cookie. Returning `true` means the caller may retry once with
 * the (now fresh) cookie. Never consulted for `/api/auth/*` itself, so a
 * real refresh failure can't recursively try to "fix" itself.
 */
type UnauthorizedHook = () => Promise<boolean>;
let unauthorizedHook: UnauthorizedHook | null = null;
export function setUnauthorizedHook(hook: UnauthorizedHook | null) {
  unauthorizedHook = hook;
}
function recoveryHookFor(path: string): UnauthorizedHook | null {
  return path.startsWith('/api/auth/') ? null : unauthorizedHook;
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
  let details: Record<string, unknown> | undefined;
  try {
    const body = (await res.json()) as { message?: string; fields?: Record<string, string>; error?: string } & Record<
      string,
      unknown
    >;
    if (body?.message) message = body.message;
    fields = body?.fields;
    code = body?.error;
    details = body;
  } catch {
    /* keep the friendly default */
  }
  return new ApiError(res.status, message, { fields, code, details, retryAfterSeconds: retryAfter(res) });
}

/** `Retry-After` as whole seconds. Only the delta-seconds form is honoured —
 *  the HTTP-date form is legal but nothing in this app emits it, and guessing
 *  at a malformed value would be worse than having no countdown at all. */
function retryAfter(res: Response): number | undefined {
  // `res.headers` is guaranteed by the platform but NOT by every hand-rolled
  // test double of a Response — and a missing countdown must never be what
  // turns an error response into a thrown TypeError inside the error path.
  const raw = res.headers?.get('retry-after');
  if (!raw) return undefined;
  const secs = Number(raw.trim());
  return Number.isFinite(secs) && secs >= 0 ? Math.ceil(secs) : undefined;
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
  let authRetried = false;
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
        const hook = res.status === 401 && !authRetried ? recoveryHookFor(path) : null;
        if (hook) {
          authRetried = true;
          if (await hook()) continue;
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

/** Multipart file upload (admin image upload). No `Content-Type` header —
 *  the browser sets the multipart boundary itself for a `FormData` body;
 *  forcing `application/json` (like the JSON path above) would break it. */
export async function httpUpload<T>(path: string, file: File): Promise<T> {
  const doUpload = async (): Promise<Response> => {
    const headers = new Headers();
    requestHook(headers);
    const form = new FormData();
    form.set('file', file);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), UPLOAD_TIMEOUT_MS);
    try {
      return await fetch(path.startsWith('http') ? path : `${BASE_URL}${path}`, {
        method: 'POST',
        headers,
        body: form,
        credentials: 'include',
        signal: ctrl.signal,
      });
    } catch {
      // A raw fetch failure here (dropped connection mid-upload, aborted
      // timeout) never reaches the server — nothing to log server-side —
      // and previously propagated as a bare, unhandled exception instead of
      // the same friendly ApiError every other request path already gives a
      // flaky connection (real risk on this deployment's network).
      throw new ApiError(0, 'ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.');
    } finally {
      clearTimeout(timer);
    }
  };
  let res = await doUpload();
  const hook = res.status === 401 ? recoveryHookFor(path) : null;
  if (hook && (await hook())) {
    res = await doUpload();
  }
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
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
  upload: httpUpload,
};
