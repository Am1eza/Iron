/**
 * Canonicalisation for Persian free text stored in the DB (W24).
 *
 * Arabic ك (U+0643) and ي (U+064A) are visually IDENTICAL to Persian ک
 * (U+06A9) and ی (U+06CC) but are different code points — and an Arabic
 * keyboard layout, an Excel paste, or a copy from a supplier's site produces
 * the Arabic forms constantly. A name stored with ي will never ILIKE-match a
 * query typed with ی, so the product silently becomes unfindable in both the
 * admin panel and site search, permanently and invisibly.
 *
 * `slugify` already folds these when generating a slug; the STORED text never
 * was. Applied server-side in the zod transform so it holds no matter which
 * client writes.
 */

/** Arabic presentation forms → Persian, plus tatweel and diacritic removal. */
export function normalizePersian(input: string): string {
  return (
    input
      .replace(/ك/g, 'ک') // ك → ک
      .replace(/[يى]/g, 'ی') // ي, ى → ی
      .replace(/ة/g, 'ه') // ة → ه
      .replace(/ـ/g, '') // tatweel (kashida) — pure decoration
      .replace(/[ً-ٰٟ]/g, '') // harakat/diacritics
      // Arabic-Indic ٠-٩ → Persian ۰-۹. Two digit sets that render almost
      // identically would otherwise split one size across two spellings.
      .replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0x06f0 - 0x0660))
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Sizes are display strings, not numbers («۴۰×۴۰», «۲ اینچ», «۱۴»). Two
 * spellings of the same size split the catalog, so settle on Persian digits
 * (what the public pages render) and the true multiplication sign.
 */
export function normalizeSizeText(input: string): string {
  return normalizePersian(input)
    .replace(/[xX*٭]/g, '×') // x, *, ٭ → ×
    .replace(/\s*×\s*/g, '×')
    .replace(/[0-9]/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0x06f0 - 0x30));
}
