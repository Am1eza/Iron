import { z } from 'zod';

export type FieldErrors = Record<string, string>;

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
