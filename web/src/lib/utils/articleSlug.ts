/**
 * Article URL segment generation — Persian-native, not transliterated.
 *
 * A product SKU composes its URL from structured facets (category + size +
 * factory: `rebar-14-a3-zobahan`), which is why `slugify()` transliterating
 * to Latin makes sense there — the whole segment is short, factual, already
 * near-ASCII. An article has nothing but its Persian TITLE to derive a URL
 * from, and running that through the same letter-by-letter transliteration
 * produces unreadable Finglish («راهنمای انتخاب گرید» → `rahnmay-antkhab-
 * grid»), which is exactly the garbage a non-technical admin saw wherever
 * this leaked into view.
 *
 * Persian Wikipedia, Persian WordPress, and most Persian news/blog platforms
 * instead keep the URL in Persian. Browsers render a percent-encoded Persian
 * path as readable Persian text in the address bar (verified: `new
 * URL('/blog/' + encodeURIComponent('راهنمای-میلگرد'), origin).pathname`
 * round-trips through `decodeURIComponent` losslessly, and Next.js decodes
 * dynamic route params the same way before your code ever sees them) — so
 * this costs nothing in correctness and the admin never has to invent an
 * English phrase for something that doesn't have one.
 */
import { normalizePersian } from './persianText';

/**
 * Standard Persian alphabet, common hamza forms, and Persian digits —
 * deliberately an explicit list, not the U+0600–U+06FF block range it looks
 * like it should be: that block also holds Arabic punctuation (،  ؛  ؟),
 * diacritics and format characters, none of which belong in a URL. A first
 * version of this file used the block range and let «؟» straight through
 * (caught by articleSlug.test.ts, not by eye — it renders identically to a
 * hyphen-adjacent letter at a glance).
 */
const PERSIAN_CHARS = 'ءآأؤإئابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی۰۱۲۳۴۵۶۷۸۹';

/** Persian letters/digits plus ASCII letters/digits plus hyphen. Nothing
 *  else — in particular, no dot, so this can never form a `..` path segment,
 *  and no RTL-override or zero-width marks, which sit outside this set. */
export const ARTICLE_SLUG_PATTERN = new RegExp(`^[a-z0-9${PERSIAN_CHARS}]+(?:-[a-z0-9${PERSIAN_CHARS}]+)*$`);

const STRIP_DISALLOWED = new RegExp(`[^a-z0-9${PERSIAN_CHARS}-]+`, 'g');

/** Title → URL segment. Spaces, ZWNJ (نیم‌فاصله — common in real Persian
 *  text, e.g. «می‌شود») and underscores become hyphens; anything else outside
 *  the allowed set is dropped rather than mis-encoded. */
export function articleSlugify(input: string): string {
  return normalizePersian(input)
    .toLowerCase()
    .replace(/[\s‌_]+/g, '-')
    .replace(STRIP_DISALLOWED, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}
