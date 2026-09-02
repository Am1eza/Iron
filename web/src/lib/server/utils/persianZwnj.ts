/**
 * ZWNJ («نیم‌فاصله», U+200C) handling for catalog text — the one Persian
 * canonicalisation `normalizePersian` does not do.
 *
 * It folds Arabic ك/ي, tatweel, harakat and Arabic-Indic digits, then collapses
 * whitespace with `\s+` — and JavaScript's `\s` does NOT include U+200C. So the
 * catalog stores «ذوب‌آهن» and «ذوب آهن» as two different factories that look
 * near-identical in the panel, an admin searching «ذوب آهن» gets nothing for
 * the row saved as «ذوب‌آهن», and the public factory-comparison table splits
 * one mill in two. `catalogAdminRepo`'s own comment on `distinctFactories`
 * names that exact risk («invents a ZWNJ variant that splits the public
 * factory-comparison table in two») without anything actually preventing it.
 *
 * Two halves, because they need opposite things:
 *
 *  - the WRITE path must keep a meaningful ZWNJ (Persian typography needs it:
 *    «می‌رود» is not «می رود»), so `foldCatalogZwnj` only removes the ones that
 *    carry no meaning — doubled, or sitting next to a space that already
 *    separates the words. It does NOT decide between «ذوب‌آهن» and «ذوب آهن»:
 *    both are legitimate spellings a human may intend, and rewriting the
 *    admin's text is not this function's business.
 *  - the READ path therefore has to match ACROSS that choice, which is what
 *    `foldZwnjForSearch` is for: fold ZWNJ to a space on BOTH sides — the term
 *    here, the column in SQL — and the two spellings become one string.
 *
 * Written with `\u200c` escapes throughout, never the literal character: it is
 * zero-width, so a literal one in a regex or a string is invisible in every
 * editor and diff.
 *
 * Kept out of `lib/utils/persianText` deliberately: that module is also the
 * normalizer for article tags and the SEO keyword tools, and this is a
 * catalog-search decision, not a change to what Persian text means everywhere.
 */

import { normalizePersian, normalizeSizeText } from '@/lib/utils/persianText';

export const ZWNJ = '\u200c';

/** Runs of ZWNJ, optionally mixed with ordinary whitespace. */
const ZWNJ_RUN = /[\s\u200c]*\u200c[\s\u200c]*/g;
const EDGE_ZWNJ = /^\u200c+|\u200c+$/g;
const ANY_ZWNJ = /\u200c/g;

/**
 * The stored form of catalog free text, applied after `normalizePersian`.
 *
 * A run containing real whitespace collapses to a single space (a space
 * already breaks the letter join, so the ZWNJ beside it renders nothing and
 * only exists to make the value unmatchable); a run of ZWNJ alone collapses to
 * one; leading/trailing ZWNJ goes, the same way `trim()` treats a space.
 */
export function foldCatalogZwnj(input: string): string {
  return input
    .replace(ZWNJ_RUN, (run) => (/[^\u200c]/.test(run) ? ' ' : ZWNJ))
    .replace(EDGE_ZWNJ, '')
    .trim();
}

/**
 * The MATCHING form of a Persian string: ZWNJ reads as a space.
 *
 * Applied to the search term in JS and to the column in SQL (see
 * `adminListSkus`), so «ذوب آهن» finds «ذوب‌آهن» and vice versa. Folding both
 * sides can only ever ADD matches — it is a character-for-character
 * substitution, so every substring match that held before still holds.
 */
export function foldZwnjForSearch(input: string): string {
  return input.replace(ANY_ZWNJ, ' ');
}

/**
 * The stored form of a catalog free-text field: what `normalizePersian`
 * already guaranteed, plus the half-space it never covered.
 *
 * Every catalog write goes through this instead of `normalizePersian` alone —
 * name, factory, grade, condition, standard, group label — so one product line
 * cannot acquire two spellings that differ by an invisible character.
 */
export function normalizeCatalogText(input: string): string {
  return foldCatalogZwnj(normalizePersian(input));
}

/** The same, for the size-shaped columns (`size`, `dimensions`, `schedule`),
 *  which additionally settle on Persian digits and «×». */
export function normalizeCatalogSize(input: string): string {
  return foldCatalogZwnj(normalizeSizeText(input));
}
