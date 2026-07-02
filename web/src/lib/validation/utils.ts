import { z } from 'zod';

export type FieldErrors = Record<string, string>;

/**
 * Base for any numeric field on a server-trust boundary (API route bodies).
 * `z.number()` alone accepts `Infinity`/`NaN` — Zod does not reject
 * non-finite values by default (verified: `z.number().positive().safeParse
 * (Infinity).success === true`, and `JSON.parse('{"q":1e400}')` yields
 * `{q: Infinity}`, so a raw API client can smuggle it through unless every
 * numeric schema explicitly chains `.finite()`). Always build request-body
 * number schemas from this, not `z.number()` directly, and pair with a
 * business-realistic `.max()` — `.finite()` alone still allows e.g.
 * `Number.MAX_VALUE`, which is finite but nonsensical for a quantity/price.
 */
export const finiteNumber = z.number().finite();

/** Flatten a ZodError into a { field: firstMessage } map (Persian messages). */
export function formatZodError(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Safe validate → discriminated result for use anywhere. */
export function safeValidate<S extends z.ZodTypeAny>(
  schema: S,
  data: unknown,
): { ok: true; data: z.infer<S> } | { ok: false; errors: FieldErrors } {
  const r = schema.safeParse(data);
  return r.success ? { ok: true, data: r.data } : { ok: false, errors: formatZodError(r.error) };
}

/** Parse-or-fallback for tolerant boundaries (bad external/URL data must not crash). */
export function parseOr<S extends z.ZodTypeAny>(schema: S, data: unknown, fallback: z.infer<S>): z.infer<S> {
  const r = schema.safeParse(data);
  return r.success ? r.data : fallback;
}
