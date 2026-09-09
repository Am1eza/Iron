/**
 * Locale-aware display names for DB-sourced catalog entities (i18n audit
 * follow-up — categories/sub_categories.name_en/name_ar/name_zh, added by
 * migration 0057 and backfilled by scripts/backfillCategoryLocaleNames.ts).
 *
 * `name` (fa) is the only field an admin ever writes; the three translated
 * columns are a one-time backfill over a small, bounded taxonomy and can be
 * null — for a category/sub-category created after the backfill, or one
 * whose slug the backfill script didn't recognize (a real DB's live
 * taxonomy can differ from the fixture set the backfill was written
 * against — see that script's own header comment). Every function here
 * falls back to `name` when the requested locale's column is null, so a
 * missing translation degrades to "still Persian", never to a blank name
 * or a broken page.
 */
import type { AppLocale } from '@/i18n/config';
import { localizeDigits } from './format';

type NamedEntity = { name: string; nameEn?: string | null; nameAr?: string | null; nameZh?: string | null };

/** The plain translated name, or `entity.name` (fa) if this locale has none recorded. */
export function getLocalizedName(entity: NamedEntity, locale: AppLocale): string {
  if (locale === 'fa') return entity.name;
  const translated = locale === 'en' ? entity.nameEn : locale === 'ar' ? entity.nameAr : entity.nameZh;
  return translated || entity.name;
}

/** True only when this locale has a REAL translation on file (not the fa fallback). */
function hasTranslation(entity: NamedEntity, locale: AppLocale): boolean {
  if (locale === 'fa') return true;
  const translated = locale === 'en' ? entity.nameEn : locale === 'ar' ? entity.nameAr : entity.nameZh;
  return !!translated;
}

const INCH_WORD: Record<Exclude<AppLocale, 'fa'>, string> = { en: 'in', ar: 'بوصة', zh: '英寸' };

/** `sku.size` is free text like "۱۰", "۲ اینچ", "۴۰×۸۰", "۲.۵" — localize its
 *  digits and, if present, translate the "اینچ" (inch) unit word. */
function localizedSizeToken(size: string, locale: AppLocale): string {
  if (locale === 'fa') return size;
  const isInch = size.includes('اینچ');
  const digits = localizeDigits(size.replace('اینچ', '').trim(), locale);
  return isInch ? `${digits} ${INCH_WORD[locale]}` : digits;
}

/**
 * Composed SKU display name for a non-fa locale — `skus` has no per-row
 * translated name column (243+ rows in dev alone, growing with every admin
 * catalog edit; a static translated-name column would need re-translating
 * on every price-list change, unlike the bounded, stable category/
 * sub-category taxonomy). Instead this composes
 * `{Category} {SubCategory} {size}` from the already-translated parents
 * plus the SKU's own structured `size` — deliberately NOT attempting to
 * mirror the fa `name` field's free-text pattern verbatim (admin-entered fa
 * names inconsistently include or drop the category word — see the i18n
 * audit's evidence), which produces a MORE consistent result than the
 * source, not a less faithful one.
 *
 * Falls back to the untouched fa `sku.name` — never a mixed-language
 * string — if either parent lacks a real translation for this locale: a
 * "Rebar میلگرد‌جدید 14" half-translated name would read as broken, where
 * the honest all-Persian original reads as "not translated yet", which is
 * the true state.
 */
export function getLocalizedSkuName(
  sku: { name: string; size?: string | null },
  category: NamedEntity | undefined,
  subCategory: NamedEntity | undefined,
  locale: AppLocale,
): string {
  if (locale === 'fa') return sku.name;
  if (!category || !subCategory || !hasTranslation(category, locale) || !hasTranslation(subCategory, locale))
    return sku.name;
  const catName = getLocalizedName(category, locale);
  const subName = getLocalizedName(subCategory, locale);
  const sizePart = sku.size ? ` ${localizedSizeToken(sku.size, locale)}` : '';
  // Sub-category names already carry the distinguishing word in most cases
  // ("Deformed Rebar", "Z-Profile") — prefixing the category name too avoids
  // ever showing a bare adjective ("Galvanized 20×20") out of context on a
  // surface (search results, cart, AI advisor) that doesn't already show
  // the category alongside it. But several translated sub-category names
  // (deliberately, for the same reason) already repeat the category word
  // itself ("Deformed Rebar" under category "Rebar") — prefixing there would
  // read "Rebar Deformed Rebar 10", not "Rebar 10 Deformed". Same
  // deduplication rule `sectionSubject` already applies to the fa headings
  // (see catalogLabels.ts's `subNameCoversCategory`), just word-boundary
  // matched instead of Persian-character-folded, since this runs on
  // already-translated Latin/Arabic/Chinese text.
  // Plain case-insensitive substring, not word-token matching: several
  // translated sub-category names hyphenate the category word into a
  // compound ("Z-Profile" under category "Profile", "I-Beam" phrasing under
  // "I-Beam" itself), which a whitespace-tokenized check misses — and zh has
  // no spaces to tokenize on at all. False-positive risk is low against this
  // specific, hand-reviewed dictionary of 8 categories × 85 sub-categories
  // (see backfillCategoryLocaleNames.ts).
  const subCoversCategory = catName.length > 0 && subName.toLowerCase().includes(catName.toLowerCase());
  return subCoversCategory ? `${subName}${sizePart}` : `${catName} ${subName}${sizePart}`;
}

type TranslatedArticle = {
  title: string;
  excerpt?: string;
  titleEn?: string;
  titleAr?: string;
  titleZh?: string;
  excerptEn?: string;
  excerptAr?: string;
  excerptZh?: string;
};

/**
 * Locale-aware article title/excerpt — same shape and fallback semantics as
 * `getLocalizedName` above (`articles.translations`, added by migration 0058
 * and backfilled by `scripts/backfillArticleTranslations.ts`), just against
 * `title`/`excerpt` instead of `name`, since `Article` doesn't share
 * `NamedEntity`'s field name. Deliberately covers title/excerpt ONLY, not
 * the article body — see the `translations` column's own doc comment in
 * `lib/server/db/schema/content.ts` for why the full body stays untranslated
 * (a real architecture tradeoff, not an oversight).
 */
export function getLocalizedArticleTitle(article: TranslatedArticle, locale: AppLocale): string {
  if (locale === 'fa') return article.title;
  const translated = locale === 'en' ? article.titleEn : locale === 'ar' ? article.titleAr : article.titleZh;
  return translated || article.title;
}

export function getLocalizedArticleExcerpt(article: TranslatedArticle, locale: AppLocale): string | undefined {
  if (locale === 'fa') return article.excerpt;
  const translated =
    locale === 'en' ? article.excerptEn : locale === 'ar' ? article.excerptAr : article.excerptZh;
  return translated || article.excerpt;
}
