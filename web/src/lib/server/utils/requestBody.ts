import { NextResponse } from 'next/server';

/** Bound bytes before JSON/multipart parsers allocate their object graphs. */
export class PayloadTooLargeError extends Error {
  constructor() {
    super('Request body exceeds the byte limit');
    this.name = 'PayloadTooLargeError';
  }
}

/** H-174: a deeply nested object is cheap to send (well under the byte cap
 *  above) but expensive for downstream code to walk — every recursive Zod
 *  refinement, every `redactValue`-style traversal, every JSON.stringify of
 *  the echoed payload pays for the depth. A separate cap from the byte size. */
export class JsonTooDeepError extends Error {
  constructor() {
    super('Request JSON nesting exceeds the depth limit');
    this.name = 'JsonTooDeepError';
  }
}

const MAX_JSON_DEPTH = 20;

/** Bails out the instant depth is exceeded, before descending into whatever
 *  the caller nested next — so a pathological input never costs more than
 *  MAX_JSON_DEPTH stack frames to reject, regardless of how deep it actually
 *  goes. JSON.parse output is never circular, so no cycle guard is needed. */
function exceedsMaxDepth(value: unknown, depth: number): boolean {
  if (depth > MAX_JSON_DEPTH) return true;
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => exceedsMaxDepth(item, depth + 1));
  return Object.values(value as Record<string, unknown>).some((v) => exceedsMaxDepth(v, depth + 1));
}

async function readBody(req: Request, maxBytes: number) {
  if (Number(req.headers.get('content-length')) > maxBytes) {
    void req.body?.cancel().catch(() => undefined);
    throw new PayloadTooLargeError();
  }
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  let bytes = new Uint8Array(Math.min(64 * 1024, maxBytes));
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        void reader.cancel().catch(() => undefined);
        throw new PayloadTooLargeError();
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
  return bytes.subarray(0, size);
}

/** Invalid JSON remains null; oversized bodies must not become valid defaults. */
export async function readJsonBody(req: Request, maxBytes = 1024 * 1024): Promise<unknown> {
  const bytes = await readBody(req, maxBytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (exceedsMaxDepth(parsed, 0)) throw new JsonTooDeepError();
  return parsed;
}

/** Aggregate cap includes extra fields/files and multipart overhead. Individual
 * file limits still belong to each route, after authentication and rate limits. */
export async function readFormBody(req: Request): Promise<FormData | null> {
  const bytes = await readBody(req, 6 * 1024 * 1024);
  try {
    return await new Response(bytes, {
      headers: { 'content-type': req.headers.get('content-type') ?? '' },
    }).formData();
  } catch {
    return null;
  }
}

export function payloadTooLargeResponse(): NextResponse {
  return NextResponse.json(
    { error: 'payload_too_large', message: 'حجم درخواست بیش از حد مجاز است.' },
    { status: 413 },
  );
}

export function jsonTooDeepResponse(): NextResponse {
  return NextResponse.json(
    { error: 'validation', message: 'ساختار ورودی بیش از حد تودرتو است.' },
    { status: 400 },
  );
}
