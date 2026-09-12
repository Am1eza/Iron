/**
 * H-199: `fetch()` wrapped with BOTH a timeout AND a hard cap on response
 * body bytes.
 *
 * Every server-side integration already timed out its outbound fetch (an
 * `AbortController` + `setTimeout`, or `AbortSignal.timeout`), but none of
 * them capped how much of the RESPONSE they would read: `res.json()` /
 * `res.text()` buffer the whole body in memory with no limit. A
 * misbehaving or compromised third-party (Matomo, Telegram, Google,
 * SMS.ir) that returned a huge body would be read to completion regardless
 * — timeout and size-limit are two separate protections, and only the
 * first existed.
 *
 * Mirrors the inbound-request pattern this app already has in
 * `requestBody.ts`'s `readBody`: check `Content-Length` up front when
 * present, then stream-and-count, aborting past the cap before the whole
 * body is ever buffered — same shape, opposite direction (outbound
 * response instead of inbound request).
 *
 * Deliberately owns its OWN `AbortController` rather than accepting a
 * caller-supplied `signal` in `init`: the size cap has to be able to abort
 * the read independently of the timeout, and every existing call site
 * (matomo/pagespeed's manual controller, telegram/searchConsole/smsir's
 * `AbortSignal.timeout`) only ever needed a plain timeout anyway.
 */

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5MB — same order of magnitude as
// requestBody.ts's inbound caps (1MB JSON, 6MB multipart); no real payload
// from any of today's integrations (Matomo/PSI/Telegram/GSC/SMS.ir JSON
// envelopes) is anywhere near this.

export class ResponseTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Response body exceeds ${maxBytes} bytes`);
    this.name = 'ResponseTooLargeError';
  }
}

export interface FetchWithLimitsOptions {
  /** Required — every existing call site already picked one; this makes
   *  forgetting a timeout impossible for a NEW call site too. */
  timeoutMs: number;
  maxBytes?: number;
}

/** A `Response`-shaped result whose body is already fully (and boundedly)
 *  buffered — `.json()`/`.text()` are synchronous re-reads of that buffer,
 *  not a second network read, so either can be called (including both, on
 *  different branches, as several call sites already do for the error vs.
 *  success path). */
export interface LimitedResponse {
  ok: boolean;
  status: number;
  headers: Headers;
  json<T = unknown>(): T;
  text(): string;
}

function wrap(res: Response, bytes: Uint8Array): LimitedResponse {
  let decoded: string | undefined;
  const text = () => {
    if (decoded === undefined) decoded = new TextDecoder().decode(bytes);
    return decoded;
  };
  return {
    ok: res.ok,
    status: res.status,
    headers: res.headers,
    text,
    json: <T = unknown>() => JSON.parse(text()) as T,
  };
}

/**
 * `fetch()` with a timeout and a response-size cap. Throws `ResponseTooLargeError`
 * the instant the cap is crossed (declared via `Content-Length`, or actually
 * read past it) — before the rest of the body is ever buffered — and a
 * regular `AbortError`/`TimeoutError` on timeout, same as every call site
 * already handled from its own manual `AbortController`/`AbortSignal.timeout`.
 */
export async function fetchWithLimits(
  input: string,
  init: RequestInit = {},
  opts: FetchWithLimitsOptions,
): Promise<LimitedResponse> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  try {
    const res = await fetch(input, { ...init, signal: ctrl.signal });
    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) {
      void res.body?.cancel().catch(() => undefined);
      throw new ResponseTooLargeError(maxBytes);
    }
    if (!res.body) return wrap(res, new Uint8Array());

    const reader = res.body.getReader();
    let bytes = new Uint8Array(Math.min(64 * 1024, maxBytes));
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          void reader.cancel().catch(() => undefined);
          throw new ResponseTooLargeError(maxBytes);
        }
        if (size > bytes.length) {
          const expanded = new Uint8Array(Math.min(maxBytes, Math.max(size, bytes.length * 2)));
          expanded.set(bytes);
          bytes = expanded;
        }
        bytes.set(value, size - value.byteLength);
      }
    } finally {
      reader.releaseLock();
    }
    return wrap(res, bytes.subarray(0, size));
  } finally {
    clearTimeout(timer);
  }
}
