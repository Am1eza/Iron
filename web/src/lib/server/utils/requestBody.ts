import { NextResponse } from 'next/server';

/** Bound bytes before JSON/multipart parsers allocate their object graphs. */
export class PayloadTooLargeError extends Error {
  constructor() {
    super('Request body exceeds the byte limit');
    this.name = 'PayloadTooLargeError';
  }
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
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
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
