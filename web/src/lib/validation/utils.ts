import { z } from 'zod';
import { ARTICLE_SLUG_PATTERN } from '@/lib/utils/articleSlug';
import { MAX_ARTICLE_TAGS, normalizeArticleTags } from '@/lib/utils/articleTags';
import { isInternalPathValue } from '@/lib/utils/url';
import { RESERVED_SUB_SLUGS } from '@/lib/routes';

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
 * A SUB-CATEGORY slug. Same rules as `slugSchema`, minus the handful of
 * literal segments that already have a meaning one level down.
 *
 * `/prices/[category]/factory/[factory]` and `/prices/[category]/size/[size]`
 * are real file routes, and Next's router prefers a literal segment over a
 * dynamic one — so a sub-category slugged `factory` would keep its own
 * `/prices/rebar/factory` page but lose every `/prices/rebar/factory/[sku]`
 * URL beneath it to the factory landing page. Rejecting the name at the point
 * of entry is the only place that can prevent it; the alternative is silently
 * broken product URLs discovered months later. See `routes.ts`.
 */
export const subCategorySlugSchema = (max: number) =>
  slugSchema(max).refine((s) => !(RESERVED_SUB_SLUGS as readonly string[]).includes(s), {
    message: 'این نشانی رزرو شده است و برای زیرشاخه قابل استفاده نیست.',
  });

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
 * from/to paths. `proxy.ts` only ever mutates `.pathname` on a cloned
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

/**
 * Catalog category ids an article is filed under (US-14.5) — always real
 * `categories.id` values picked from a closed list in the editor, never free
 * text, so unlike `articleTagsSchema` there is no normalization/dedup step:
 * a stale or unknown id simply matches nothing when a public page filters by
 * it, which is a harmless no-op rather than something worth rejecting here.
 */
export const articleCategoryIdsSchema = z.array(z.string().min(1).max(60)).max(20).optional();

/**
 * Market-news topic slugs (اخبار بازار) — same reasoning as
 * `articleCategoryIdsSchema` above (a closed picker, not free text, so no
 * normalization step), over the fixed `NEWS_TOPICS` list instead of the
 * DB `categories` table. A stale/unknown slug is a harmless no-op the
 * same way, so this validates shape only, not membership.
 */
export const articleNewsTopicIdsSchema = z.array(z.string().min(1).max(60)).max(10).optional();

/**
 * Admin-editable per-article FAQ (US-14.7) — free text, unlike the two
 * pickers above, since a question/answer pair has no closed set to pick
 * from. Each answer is capped well above the site's other single-field
 * limits (`seoMetaSchema.description` is 200) because an FAQ answer
 * is real prose meant to stand alone for an AI/answer-engine consumer
 * (see `lib/seo.faqJsonLd`'s own comment on that), not a meta snippet.
 */
/**
 * A reader comment body (US-14.8) — plain text, real bounds (no comment
 * is a novel), enforced here so the API route and the panel's own
 * character counter can never silently disagree about the limit.
 */
export const commentBodySchema = z.string().trim().min(1).max(1000);

export const articleFaqSchema = z
  .array(
    z.object({
      question: z.string().trim().min(1).max(200),
      answer: z.string().trim().min(1).max(2000),
    }),
  )
  .max(20)
  .optional();

/**
 * A path that provably cannot leave this site's own origin.
 *
 * Stricter than `internalPathSchema` above and used where the value becomes a
 * cache key or part of an outbound request — `internalPathSchema` is a list of
 * prohibitions, and lists of prohibitions leak. Concretely: the WHATWG URL
 * parser treats a BACKSLASH as a slash for special schemes, so `/\evil.com`
 * satisfies "starts with /, no //, no ://" and then resolves to
 * `https://evil.com/`. Proving the property by construction — resolve it, and
 * require the result to be same-origin, path-only and byte-identical to the
 * input — has no equivalent gap, and the round-trip requirement additionally
 * stops `/blog/x`, `/blog/x/` and `/a/../blog/x` from becoming three cache
 * keys for one page.
 *
 * `base` defaults to the site origin; it is a parameter only so tests can pin
 * it without touching the environment.
 */
export function sitePathSchema(base: string = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ahantime.com', max = 300) {
  const origin = new URL(base).origin;
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (v) => {
        if (!v.startsWith('/') || /[?#\s]/.test(v)) return false;
        let resolved: URL;
        try {
          resolved = new URL(v, origin);
        } catch {
          return false;
        }
        return resolved.origin === origin && resolved.pathname === v && !resolved.search && !resolved.hash;
      },
      { message: 'مسیر صفحه معتبر نیست.' },
    );
}

/**
 * A `seo` jsonb blob — the editor's Google-result overrides plus the focus
 * keyword the on-page checklist keys off (US-14.4).
 *
 * Named for `SeoMeta`, not for articles: `articles.seo`, `categories.seo`,
 * `sub_categories.seo` and `skus.seo` are the same column of the same shape,
 * and the category route reuses this schema rather than restating four fields
 * that would then drift. (It was `articleSeoSchema` until 2026-08-20, when
 * category descriptions became admin-editable.)
 *
 * Shared by BOTH article routes rather than declared in each. It used to live
 * only on PATCH, which is why creating an article silently threw away every
 * SEO field the writer had filled in: the drawer sent them, `createPayload`
 * had no key for them, zod stripped them, and the post-create reseed then
 * blanked the inputs on screen with a success toast — no error, no dirty
 * flag, no way to tell it had happened.
 *
 * Empty strings become `undefined` so a blank input is "unset" rather than a
 * stored empty value; the keyword trims first, so «   » is a blank too.
 */
export const seoMetaSchema = z
  .object({
    title: z.string().trim().max(70).optional(),
    description: z.string().trim().max(200).optional(),
    // internalPathSchema is parser-based (isInternalPathValue), not a
    // startswith-slash regex: a startswith check alone lets //evil.com and
    // /\evil.com through, and both resolve to https://evil.com/ in
    // buildMetadata, publishing an attacker-controlled canonical/og:url.
    canonical: z.preprocess(
      (v) => (v === '' ? undefined : v),
      internalPathSchema(300).optional(),
    ),
    ogImage: z.preprocess((v) => (v === '' ? undefined : v), uploadPathSchema.optional()),
    focusKeyword: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().trim().max(100).optional(),
    ),
  })
  .nullable()
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
