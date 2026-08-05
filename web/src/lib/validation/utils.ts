import { z } from 'zod';
import { ARTICLE_SLUG_PATTERN } from '@/lib/utils/articleSlug';
import { MAX_ARTICLE_TAGS, normalizeArticleTags } from '@/lib/utils/articleTags';
import { isInternalPathValue } from '@/lib/utils/url';

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

/**
 * A URL slug on a server-trust boundary. The admin catalog forms generate
 * conforming slugs client-side via `slugify()`, but the field stays editable
 * and the server never enforced a character set — so `ab/../x`, internal
 * whitespace, RTL-override marks and Persian letters all validated.
 *
 * The interesting case is `..`: `encodeURIComponent` (routes.ts) does NOT
 * escape dots, so a `..` segment survives into `new URL(path, SITE_URL)` in
 * `seo.ts` and `sitemap.ts`, where URL normalization collapses it — silently
 * pointing a real revenue page's canonical tag and sitemap entry at the
 * homepage. Homoglyphs are the other half: two visually identical slugs can
 * coexist past the unique index.
 *
 * Lowercase ASCII, digits, single interior hyphens. `max` varies per entity.
 */
export const slugSchema = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'نشانی فقط می‌تواند شامل حروف کوچک انگلیسی، عدد و خط تیره باشد.');

/**
 * A URL slug for an ARTICLE — unlike `slugSchema` above, this allows Persian
 * letters/digits too (see `articleSlug.ts` for why: a blog/news title has no
 * ASCII-composable facets to build a Latin slug from, so the admin's only
 * realistic input is Persian text, and forcing it through the ASCII-only
 * pattern either rejects every real title or invites Finglish garbage).
 *
 * Same `..`/homoglyph/RTL-override threat model as `slugSchema` — the
 * allowlist has no dot, and `ARTICLE_SLUG_PATTERN` is an explicit letter/digit
 * list (not a Unicode block range — that would also admit Arabic punctuation
 * like «؟»), so control, punctuation and bidi-override characters fail closed.
 * Deliberately a hard `.regex()` reject, not a silent re-derive: client and
 * server must produce byte-identical slugs, never two different "corrected"
 * versions of the same input.
 */
export const articleSlugSchema = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(ARTICLE_SLUG_PATTERN, 'نشانی فقط می‌تواند شامل حروف فارسی یا انگلیسی، عدد و خط تیره باشد.');

/**
 * An internal site path on a server-trust boundary — used for redirect
 * from/to paths. `middleware.ts` only ever mutates `.pathname` on a cloned
 * same-origin `URL`, so an absolute/protocol-relative value here can never
 * actually produce a cross-origin redirect (verified: setting `.pathname` to
 * `https://evil.com/x` or `//evil.com/x` yields `ahantime.com/https://evil.
 * com/x` — the host is structurally locked by the sink). This check exists
 * anyway as defense-in-depth and basic hygiene: `redirectsRepo.normalizePath`
 * doesn't reject a scheme either, so without this a value like
 * `https://evil.com/phish` would silently store as the nonsensical path
 * `/https://evil.com/phish` rather than being rejected as the input error it is.
 *
 * It is NOT only defense-in-depth any more: `articles.seo.canonical` uses this
 * schema, and that value goes straight into `<link rel="canonical">` and
 * `og:url` via `buildMetadata`, where an off-site value is a silent, durable
 * SEO hijack. The check is therefore parser-based (`isInternalPathValue`)
 * rather than the two regexes it used to be — `//evil.com` was caught by
 * those, `/\evil.com` and `/<TAB>/evil.com` were not, and all three resolve to
 * `https://evil.com/`. See `lib/utils/url.ts`.
 */
export const internalPathSchema = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(isInternalPathValue, {
      message: 'باید یک مسیر داخلی سایت باشد، نه یک آدرس کامل یا خارجی.',
    });

/**
 * An uploaded image reference, normalised to a same-origin PATH.
 *
 * `/api/admin/upload` returns a relative `/uploads/<ulid>.<ext>`, but
 * `ImageUpload` resolves it against `window.location.origin` before sending —
 * so what actually landed in the column was an absolute URL pinned to whatever
 * host the admin happened to be on. An image uploaded from the panel host (or
 * from localhost) is then a broken, cross-origin, CSP-blocked `<img>` for every
 * visitor of the public site. Storing the path makes it origin-independent.
 *
 * Also closes the `z.string().url()` hole: that accepts `javascript:`,
 * `data:` and `file:` schemes, since it is a `new URL()` try/catch rather than
 * an http(s) allowlist.
 */
export const uploadPathSchema = z
  .string()
  .trim()
  .max(300)
  .transform((v, ctx) => {
    if (v.startsWith('/uploads/')) return v;
    try {
      const u = new URL(v);
      if ((u.protocol === 'http:' || u.protocol === 'https:') && u.pathname.startsWith('/uploads/')) {
        return u.pathname;
      }
    } catch {
      // fall through to the issue below
    }
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'نشانی تصویر معتبر نیست.' });
    return z.NEVER;
  });

/**
 * Article tags, normalised at the boundary.
 *
 * The `.transform` is the point of this schema, not a nicety: without it
 * «میلگرد» typed on an Arabic keyboard (ي, U+064A) and «میلگرد» typed on a
 * Persian one (ی, U+06CC) are two different rows in the jsonb array that look
 * identical in the panel, which is exactly the failure already documented for
 * SKU factory names. Running it here means it holds for every writer of these
 * endpoints, present and future — see `normalizeArticleTags`.
 *
 * The `.max()` is the pre-normalisation ceiling (a client sending 50 tags is
 * misbehaving and should hear about it); `normalizeArticleTags` independently
 * caps the stored result after de-duplication.
 */
export const articleTagsSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(MAX_ARTICLE_TAGS)
  .transform(normalizeArticleTags)
  .optional();

/** A patch body must actually change something — every field on these schemas
 *  is optional, so `{}` parsed fine and reached drizzle's `.set({})`, which
 *  throws "No values to set" and surfaced as a 500. */
export function nonEmptyPatch<S extends z.ZodTypeAny>(schema: S) {
  return schema.refine((v) => v && typeof v === 'object' && Object.keys(v).length > 0, {
    message: 'هیچ تغییری ارسال نشده است.',
  });
}

/** Flatten a ZodError into a { field: firstMessage } map (Persian messages). */
export function formatZodError(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Parse-or-fallback for tolerant boundaries (bad external/URL data must not crash). */
export function parseOr<S extends z.ZodTypeAny>(schema: S, data: unknown, fallback: z.infer<S>): z.infer<S> {
  const r = schema.safeParse(data);
  return r.success ? r.data : fallback;
}
