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
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'validation', message: 'ورودی نامعتبر است.', fields: formatZodError(result.error) },
        { status: 400 },
      ),
    };
  }
  return { ok: true, data: result.data };
}
