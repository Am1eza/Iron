/**
 * Canonicalisation for article tags (W7).
 *
 * Tags are free text typed by an editor, and the failure mode is the one
 * already documented for SKU factory names in `catalogAdminRepo` /
 * `persianText`: «میلگرد» typed with an Arabic ي (U+064A) and «میلگرد» typed
 * with a Persian ی (U+06CC) are visually identical, so the editor sees one tag
 * where the database holds two. Nothing surfaces the split — the tag list just
 * quietly shows half the articles under each spelling, forever.
 *
 * ZWNJ (نیم‌فاصله, U+200C) is the same problem one step further: «آهن‌آلات» and
 * «آهن آلات» are the same word to a reader. `articleSlugify` already treats
 * ZWNJ as a word boundary (it maps to a hyphen), so a tag folds it to a plain
 * space for the same reason and stays consistent with the slug it will one day
 * share a filter URL with.
 *
 * Applied server-side in the zod transform on both article write endpoints, so
 * it holds no matter which client writes.
 */
import { normalizePersian } from './persianText';

/** Hard ceiling on tags per article — also enforced by zod at the boundary.
 *  A tag set is an editorial hint, not a taxonomy; past a dozen it stops
 *  discriminating between articles and just inflates the index. */
export const MAX_ARTICLE_TAGS = 12;

/**
 * One tag → its canonical stored form. ZWNJ becomes a space (a word boundary,
 * as in `articleSlugify`); the remaining zero-width and bidi-control
 * characters are pure invisible noise that would make two identical-looking
 * tags unequal, so they are dropped outright. `normalizePersian` then folds
 * the Arabic letter forms and Arabic-Indic digits, strips diacritics and
 * tatweel, and collapses/trims whitespace.
 */
export function normalizeArticleTag(input: string): string {
  return normalizePersian(
    input
      .replace(/‌/g, ' ') // ZWNJ (نیم‌فاصله) → word boundary
      // ZWSP, ZWJ, LRM/RLM, the LRE…RLO embedding block, the isolate block
      // and BOM — invisible, and every one of them is a real paste artefact.
      .replace(/[​‍-‏‪-‮⁦-⁩﻿]/g, ''),
  );
}

/**
 * A raw tag list → the canonical set actually stored. Trims, drops empties,
 * de-duplicates case-insensitively (Persian has no case, but a Latin tag like
 * `Rebar`/`rebar` splits just as invisibly) keeping the FIRST spelling the
 * editor typed, and caps the result.
 */
export function normalizeArticleTags(input: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const tag = normalizeArticleTag(raw);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_ARTICLE_TAGS) break;
  }
  return out;
}
