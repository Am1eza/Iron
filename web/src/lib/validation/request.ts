import {
  readJsonBody,
  PayloadTooLargeError,
  payloadTooLargeResponse,
  JsonTooDeepError,
  jsonTooDeepResponse,
} from '@/lib/server/utils/requestBody';
import type { z } from 'zod';
import { NextResponse } from 'next/server';
import { formatZodError } from './utils';

/**
 * Server-side body validation for route handlers (never trust the client).
 * Usage:
 *   const v = await validateBody(req, schema);
 *   if (!v.ok) return v.response;
 *   const { data } = v;
 */
export async function validateBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: NextResponse }> {
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return { ok: false, response: payloadTooLargeResponse() };
    }
    if (error instanceof JsonTooDeepError) {
      return { ok: false, response: jsonTooDeepResponse() };
    }
    throw error;
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'validation',
          message: 'ورودی نامعتبر است.',
          fields: formatZodError(result.error),
        },
        { status: 400 },
      ),
    };
  }
  return { ok: true, data: result.data };
}

/**
 * H-172: server-side query-string validation, the `validateQuery` sibling
 * `validateBody` never had. Before this, every route that reads
 * `searchParams` did so ad hoc (`/api/search`'s own hand-rolled
 * `.trim().slice(0, 100)` was the only precedent) — no shared cap, no shared
 * error shape. Values come out as plain strings (or `undefined` when absent);
 * the caller's schema is responsible for any further shape (`.min()`,
 * `.max()`, `.regex()`, coercion via `z.coerce.number()`, …), exactly like
 * `validateBody`'s schema owns the body's shape.
 *
 * Repeated keys collapse to the FIRST value, matching `URLSearchParams.get`
 * (the convention every existing route already uses) rather than silently
 * picking the last or building an array no caller expects.
 *
 * Usage:
 *   const v = validateQuery(req, schema);
 *   if (!v.ok) return v.response;
 *   const { data } = v;
 */
export function validateQuery<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): { ok: true; data: z.infer<S> } | { ok: false; response: NextResponse } {
  const searchParams = new URL(req.url).searchParams;
  const raw: Record<string, string> = {};
  for (const key of searchParams.keys()) {
    if (!(key in raw)) raw[key] = searchParams.get(key) ?? '';
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'validation',
          message: 'پارامترهای درخواست نامعتبر است.',
          fields: formatZodError(result.error),
        },
        { status: 400 },
      ),
    };
  }
  return { ok: true, data: result.data };
}
