/**
 * Per-category display labels for the shared SKU attribute columns.
 *
 * `skus.size` is one column for the whole catalog, but it does not mean the
 * same thing in every category. For میلگرد/تیرآهن/لوله/… it really is a
 * «سایز» (the market size number). For ورق it is a **thickness in
 * millimetres** — the trade calls it «ضخامت», never «سایز», and the owner
 * asked for the public and admin UI to say so. Nothing about the stored data
 * changes: this is a label, resolved from the CATEGORY the row is being shown
 * under, so the rename can never leak into a category that legitimately says
 * «سایز».
 *
 * Keyed on the category SLUG (`categories.slug`, e.g. `sheet`) — the same
 * identifier `PriceRow.categoryId` carries (catalogRepo's `toPriceRow` maps
 * the FK to the slug) and the same one the admin form's `parentCategory.slug`
 * has, so every caller can answer the question without a lookup.
 *
 * The same idea, one level deeper, drives the grade/standard column: تیرآهن
 * resolves it from the SUB-category slug too, because «گرید» is meaningless
 * there except on هاش سبک/هاش سنگین, where the meaningful value lives in a
 * different stored column (`skus.standard`) entirely.
 */

import type { PriceBasis, PriceUnit } from '@/lib/types/domain';
import { toPersianDigits } from '@/lib/utils/format';
import { CITIES } from '@/lib/data/logistics';

/** Categories whose `size` column holds a thickness. Only ورق today. */
const THICKNESS_CATEGORIES = new Set(['sheet']);

/** Categories that additionally carry a width×length. Only ورق — a plate has
 *  three dimensions and `size` only holds the thickness. */
const DIMENSIONS_CATEGORIES = new Set(['sheet']);

/** The exact نبشی sub-categories whose wall thickness the owner asked to
 *  record alongside the existing «سایز» (1405/06). Deliberately an allow-list:
 *  `angle-channel` also contains وال‌پست and تی‌بار, and the request was for
 *  نبشی only — widening this to the whole parent category would give those
 *  unrelated product lines a meaningless extra field. */
const NABSHI_THICKNESS_SUBS = new Set(['nabshi', 'angle-unequal', 'spot']);

/** تیرآهن sub-category slugs where «استاندارد» (`skus.standard`, e.g. HEA/HEB
 *  per DIN 1025) is the meaningful column. Everywhere else in تیرآهن the
 *  «گرید» column is unfilled noise the owner asked removed. */
const IBEAM_STANDARD_SUBS = new Set(['hash-sabok', 'hash-sangin']);

/**
 * لوله sub-categories that carry a «رده» (`skus.schedule`) — the pipe
 * schedule, the trade's own name for a wall-thickness/pressure class
 * («رده ۴۰», «رده ۸۰», per ASME B36.10).
 *
 * Deliberately an allow-list rather than the whole category, for the same
 * reason the نبشی thickness one is: «رده» is a real property of pipe sold by
 * pressure/schedule class, and of nothing else under لوله. لولهٔ مبلی is
 * furniture tube sold on outside diameter and wall gauge, and لولهٔ داربستی
 * is scaffold tube sold to a scaffolding spec; neither carries a schedule
 * rating at all, so offering the field there would ask an admin to invent a
 * value for a property the product does not have — these two stay excluded.
 *
 * BOTH مانیسمان subs are listed because that sub-category really is split in
 * production — «مانیسمان داخلی» and «مانیسمان خارجی» — and a schedule is the
 * same fact on either side of the split. The slugs are the live ones, read
 * from the production catalog rather than from `data/nav.ts`, which still
 * lists a single `seamless` sub that no longer exists and would therefore
 * have matched no rows at all.
 *
 * اسپیرال, جدار چاه and گوشت‌دار were initially left out pending an owner
 * decision (each is arguably pressure-rated too, and جدار چاه already
 * records «ST37» in `skus.standard`) — the owner confirmed all three should
 * get «رده» as well (1405/06). `schedule` is its own column, independent of
 * `standard`, so جدار چاه now correctly carries both facts on one row rather
 * than one column meaning two things.
 */
const PIPE_SCHEDULE_SUBS = new Set([
  'seamless-internal',
  'seamless-external',
  'gas',
  'industrial',
  'spiral',
  'well-casing',
  'thick-walled',
]);

/**
 * لوله sub-categories whose «کارخانه» column is really a «برند».
 *
 * مانیسمان sold here is IMPORTED, not rolled by a named Iranian mill, so the
 * only value an admin can honestly put in that box is an origin — «چینی»,
 * «اروپایی» — and not a factory at all. That is the same real-world situation
 * `factoryIsMeaningful` documents for استیل, and the owner's reasoning is the
 * one quoted there.
 *
 * The RESOLUTION is deliberately different. استیل drops the column outright,
 * because nothing in it was worth publishing. مانیسمان keeps it, because an
 * origin genuinely IS what a مانیسمان buyer compares on — what is wrong is
 * the column's name and its expected contents, not its existence. So this
 * belongs with `sizeLabel`/`dimensionsLabel` — one stored column, relabelled
 * per context — and not with the factory removal.
 *
 * Go-forward only, and nothing is backfilled: the live مانیسمان rows still
 * hold mill-shaped values and keep them until an admin edits each one, the
 * same way the نبشی thickness column was left null rather than guessed at.
 */
const SEAMLESS_BRAND_SUBS = new Set(['seamless-internal', 'seamless-external']);

export const SIZE_LABEL = 'سایز';
export const THICKNESS_LABEL = 'ضخامت';
export const DIMENSIONS_LABEL = 'ابعاد';
export const GRADE_LABEL = 'گرید';
export const STANDARD_LABEL = 'استاندارد';
export const SCHEDULE_LABEL = 'رده';
/** The default name of the `skus.factory` column — see `factoryLabel`. */
export const FACTORY_LABEL = 'کارخانه';
/** …and what مانیسمان calls it instead, where the value is an origin. */
export const BRAND_LABEL = 'برند';
export const WEIGHT_LABEL = 'وزن';
export const BRANCH_WEIGHT_LABEL = 'وزن شاخه';

/** True when this category measures its products by thickness. */
export function usesThickness(categorySlug: string | null | undefined): boolean {
  return Boolean(categorySlug && THICKNESS_CATEGORIES.has(categorySlug));
}

/**
 * True when the shared `skus.dimensions` column is meaningful in this exact
 * catalog context. For ورق it remains category-wide width×length. For the
 * three owner-approved نبشی subs it is wall thickness; every other
 * `angle-channel` sub stays untouched.
 *
 * Drives whether the column/field is OFFERED at all — callers must pass the
 * active/product sub-category so a mixed «همه» view does not grow a column
 * that is meaningless for some of its rows.
 */
export function usesDimensions(
  categorySlug: string | null | undefined,
  subCategorySlug: string | null = null,
): boolean {
  if (categorySlug && DIMENSIONS_CATEGORIES.has(categorySlug)) return true;
  return (
    categorySlug === 'angle-channel' &&
    Boolean(subCategorySlug && NABSHI_THICKNESS_SUBS.has(subCategorySlug))
  );
}

/** «ابعاد» for ورق's width×length, «ضخامت» for the three نبشی
 *  subs approved by the owner. The generic fallback stays «ابعاد» so an
 *  unknown or mixed context can never silently misdescribe the shared column
 *  as thickness; those contexts do not render it in the first place. */
export function dimensionsLabel(
  categorySlug: string | null | undefined,
  subCategorySlug: string | null = null,
): string {
  return categorySlug === 'angle-channel' &&
    subCategorySlug &&
    NABSHI_THICKNESS_SUBS.has(subCategorySlug)
    ? THICKNESS_LABEL
    : DIMENSIONS_LABEL;
}

/** «ضخامت» for ورق, «سایز» everywhere else (including unknown/mixed lists). */
export function sizeLabel(categorySlug: string | null | undefined): string {
  return usesThickness(categorySlug) ? THICKNESS_LABEL : SIZE_LABEL;
}

/**
 * «وزن» for ورق, «وزن شاخه» everywhere else.
 *
 * ورق is sold per برگ (sheet/leaf), never in a «شاخه» (mill bar/rod) — the
 * word does not describe the product at all there, unlike میلگرد/تیرآهن/نبشی
 * where the stored theoretical weight genuinely is one branch's weight. Keyed
 * on the same THICKNESS_CATEGORIES set sizeLabel already uses: it is exactly
 * the categories where «شاخه» stops applying.
 */
export function weightLabel(categorySlug: string | null | undefined): string {
  return usesThickness(categorySlug) ? WEIGHT_LABEL : BRANCH_WEIGHT_LABEL;
}

/* ---------------------- per-sub attribute columns ---------------------- */

/**
 * پروفیل sub-category slugs where the fabricated «کارخانه» value is not shown.
 *
 * ahanonline — the reference the owner benchmarks these pages against — has no
 * per-brand factory column on پروفیل at all: it groups by CITY («پروفیل
 * اصفهان», «پروفیل تهران») and uses «محل تحویل: کارخانه» as a delivery TERM
 * (ex-works pickup vs warehouse delivery), never as a company name. The
 * `skus.factory` values this catalog carried for these sub-categories («نیکان
 * پروفیل», «کیان پرشیا», …) correspond to nothing in that data and were never
 * real brand identities the way «فولاد مبارکه» genuinely is for ورق — so the
 * owner asked for the distinction removed rather than corrected.
 *
 * «پروفیل ساختمانی» is deliberately NOT in this set: it keeps its factory
 * column exactly as before.
 *
 * The stored column is untouched — this suppresses the value at the DTO
 * boundary (`catalogRepo.toPriceRow`), so every surface fed by a `PriceRow`
 * (table, cards, spec sheet, facet rail, sitemap, export, the AI's grounding)
 * agrees, and the raw rows stay queryable for audit.
 */
const PROFILE_NO_FACTORY_SUBS = new Set([
  'prvfyl-snaty',
  'profil-mobli',
  'profil-sotuni',
  'profil-galvanizeh',
  'profil-z',
  'prvfyl-astyl',
]);

/**
 * Whether a mill name means anything for products in this category/sub-category
 * — i.e. whether `skus.factory` should be published at all. True everywhere
 * except the پروفیل sub-categories listed above and the whole استیل category.
 *
 * **استیل is category-wide and has no exceptions.** Every product in it is
 * IMPORTED stainless, so there is no Iranian mill to name, and the owner's
 * employer asked for the column removed outright: «برای استیل‌ها چون که
 * وارداتی هست باید کلاک کارخانه رو حذف بکنیم، فقط محصول رو می‌ذاریم، آلیاژش
 * رو می‌نویسیم و طولش رو» (1405/06). The stored `skus.factory` values agree
 * that it was never a mill: they are «چین» on every نبشی row and «تایوان» on
 * every ناودانی row — a country of ORIGIN, empty for لوله and پروفیل — so the
 * page was publishing a «کارخانه» column, a «مرتب‌سازی بخش‌های کارخانه» sort
 * control and a «۱ کارخانه» stat on top of a field that holds no factory at
 * all. Unlike پروفیل this needs no per-sub allow-list: the reason applies to
 * every sub under استیل, including the empty ones (فلنج، مش، رینگ، فنر، تسمه،
 * تیوب، توری), which are imported stainless too.
 */
export function factoryIsMeaningful(
  categorySlug: string | null | undefined,
  subCategorySlug: string | null | undefined,
): boolean {
  if (categorySlug === 'steel') return false;
  if (categorySlug !== 'profile') return true;
  return !(subCategorySlug && PROFILE_NO_FACTORY_SUBS.has(subCategorySlug));
}

/**
 * What the `skus.factory` column is CALLED in this exact catalog context —
 * «برند» on مانیسمان, «کارخانه» everywhere else.
 *
 * The companion to `factoryIsMeaningful`, and deliberately a SEPARATE
 * question from it: that one decides whether the column is published at all,
 * this one decides what to call it where it is published. A sub can perfectly
 * well have a meaningful factory column under a name other than «کارخانه»,
 * which is exactly مانیسمان's case, so a caller that needs both answers asks
 * both.
 *
 * Keyed on category AND sub like `dimensionsLabel`, and with the same
 * fallback rule: anything unknown, and any mixed «همه» view whose rows do not
 * agree on one sub, resolves to the generic «کارخانه». That is the safe
 * direction — a مانیسمان row sitting under a «کارخانه» header is merely
 * generic, whereas a گازی row under a «برند» header would be a false claim
 * about what its mill name is.
 *
 * Before this existed «کارخانه» was a bare string literal repeated across the
 * table header, the row cell's `data-label`, the compare sheet, the section
 * noun, the spec sheet and the admin form. Six hand-copied copies is how a
 * relabel like this one silently half-lands.
 */
export function factoryLabel(
  categorySlug: string | null | undefined,
  subCategorySlug: string | null | undefined = null,
): string {
  return categorySlug === 'pipe' && subCategorySlug && SEAMLESS_BRAND_SUBS.has(subCategorySlug)
    ? BRAND_LABEL
    : FACTORY_LABEL;
}

export const BRANCH_LENGTH_LABEL = 'طول شاخه';
export const CUSTOM_LENGTH_LABEL = 'طول سفارشی';
export const ALLOY_LABEL = 'آلیاژ';
export const CONDITION_LABEL = 'حالت';

/** Printed where the column is not a property of THAT row's product at all —
 *  «نامشخص» would claim the value is merely unknown. */
export const NOT_APPLICABLE = '—';
/** Printed where it IS a property of the product but nobody has entered it. */
export const UNKNOWN_VALUE = 'نامشخص';
/** «طول سفارشی» for a product with no standard branch length: پروفیل Z is cut
 *  to order, so an empty length is an answer, not a gap. */
const CUT_TO_ORDER = 'بر اساس سفارش';

/** The identity of one attribute column. Not a free label: the same key drives
 *  the header, the desktop cell, the mobile card line and the spec sheet, so
 *  they cannot drift into three different words for one fact. */
export type AttrKey =
  | 'grade'
  | 'standard'
  | 'alloy'
  | 'condition'
  | 'branchLength'
  | 'customLength'
  | 'schedule';

/** The subset of a price row the attribute columns read. Deliberately
 *  structural rather than `PriceRow` so the admin tables and the spec sheet can
 *  reuse it without carrying the public DTO. */
export type AttrRow = {
  subCategoryId: string;
  grade?: string;
  standard?: string;
  schedule?: string;
  branchLengthM?: number;
};

function metres(m: number | null | undefined): string | undefined {
  return m ? `${toPersianDigits(m)} متر` : undefined;
}

const ATTR_DEFS: Record<AttrKey, { label: string; read: (r: AttrRow) => string | undefined }> = {
  grade: { label: GRADE_LABEL, read: (r) => r.grade },
  standard: { label: STANDARD_LABEL, read: (r) => r.standard },
  // «آلیاژ» is `skus.grade` re-labelled, not a new stored column: on a
  // stainless product the stored grade genuinely IS the alloy
  // (۲۰۱/۳۰۴/۳۰۴L/۳۱۶L), which is the one spec a stainless buyer actually asks
  // for. Used by the whole استیل category and by پروفیل استیل.
  alloy: { label: ALLOY_LABEL, read: (r) => r.grade },
  // «حالت» is the same established re-label pattern as استیل's
  // «آلیاژ» above: it is NOT a new stored fact. On ورق the owner has
  // already been using `skus.grade` for the product form supplied to the
  // buyer — values such as «برش‌خورده» and «رول» — rather than for a
  // metallurgical grade. Reading the existing column through a distinct key
  // changes only what the UI calls it; validation, persistence and every
  // stored value remain untouched.
  condition: { label: CONDITION_LABEL, read: (r) => r.grade },
  branchLength: { label: BRANCH_LENGTH_LABEL, read: (r) => metres(r.branchLengthM) },
  // «رده» — the pipe schedule. Its own stored column (`skus.schedule`), and
  // deliberately NOT a re-label of `standard` the way `alloy` re-labels
  // `grade`: لولهٔ جدار چاه already stores a real «استاندارد» there (ST37, on
  // every live row of that sub), so borrowing the column would have made one
  // column mean two different things inside a single category — the exact
  // collision the ورق/نبشی reuse of `dimensions` avoids by never letting two
  // meanings meet under one parent.
  schedule: { label: SCHEDULE_LABEL, read: (r) => r.schedule },
  customLength: {
    label: CUSTOM_LENGTH_LABEL,
    read: (r) => metres(r.branchLengthM) ?? CUT_TO_ORDER,
  },
};

/**
 * پروفیل sub-categories whose «گرید» column is replaced (owner decision,
 * 1405/05). Every پروفیل sub NOT listed here — «ساختمانی», «مبلی», «ستونی»,
 * «گالوانیزه» — keeps the plain «گرید» column untouched.
 *
 * صنعتی and Z each swap grade for a length one-for-one; استیل is the only one
 * that GAINS a column rather than trading one, because a stainless buyer needs
 * both the alloy and the length. Z's is «طول سفارشی», not «طول شاخه»: it is not
 * sold in a fixed standard branch length, it is cut to order.
 */
const PROFILE_ATTRS: Record<string, AttrKey[]> = {
  'prvfyl-snaty': ['branchLength'],
  'profil-z': ['customLength'],
  'prvfyl-astyl': ['alloy', 'branchLength'],
};

/**
 * Which attribute columns a table shows, given the page's category and the
 * currently-active sub-category filter (`null` = «همه», every sub-category
 * mixed into one table).
 *
 * Only تیرآهن, پروفیل, استیل, لوله and ورق ever deviate; every other
 * category always gets its one «گرید» column exactly as before. The mixed
 * «همه» view resolves to the category's default column set — the rule تیرآهن
 * has always used — and each cell then answers for its own row (see
 * `attributeColumns`).
 *
 * استیل deviates at the CATEGORY level rather than per-sub: every product in it
 * is stainless, so every stored `grade` in it is an alloy designation
 * (۲۰۱/۳۰۴/۳۰۴L/۳۱۶L — verified across all 55 live SKUs, 1405/06), and the
 * owner's employer asked for the column to say «آلیاژ» throughout. That holds
 * for its currently-empty subs (فلنج، مش، رینگ، فنر، تسمه، تیوب، توری) too:
 * they are stainless products as well, so «آلیاژ» is already the right word for
 * the day they get stock. Because the answer is the same for every sub, the
 * mixed «همه» view needs no special case and no cell can read `NOT_APPLICABLE`.
 *
 * It also carries «طول شاخه» — the second half of the same instruction that
 * removed its factory column (see `factoryIsMeaningful`): with the mill gone,
 * the length is the spec a stainless buyer needs beside the alloy, and it is
 * exactly the column the trade's own stainless tables publish. Same
 * `branchLength` definition پروفیل استیل already uses, so the two tables — the
 * same product under two categories — cannot word one fact differently.
 */
export function attrKeysFor(
  categorySlug: string | null | undefined,
  sub: string | null,
): AttrKey[] {
  if (categorySlug === 'ibeam') {
    if (sub === null) return ['standard'];
    return IBEAM_STANDARD_SUBS.has(sub) ? ['standard'] : [];
  }
  if (categorySlug === 'profile' && sub !== null) {
    return PROFILE_ATTRS[sub] ?? ['grade'];
  }
  // ورق is category-wide, exactly like استیل's alloy relabel: every
  // sheet row uses the existing `grade` value to describe its supplied
  // condition («برش‌خورده»/«رول»), so both an individual sub and
  // the mixed «همه» view have one unambiguous label. No stored value moves.
  if (categorySlug === 'sheet') return ['condition'];
  // لوله is the one category that ADDS an attribute column rather than
  // trading one away: its pressure-pipe subs keep the «گرید» column they have
  // always had and gain «رده» beside it. (Compare پروفیل صنعتی, which swaps
  // grade for a length — there the two facts are alternatives; here a pipe
  // genuinely has both a steel grade and a schedule.)
  //
  // The mixed «همه» view is deliberately left on the plain default: most لوله
  // subs have no schedule at all, so a «رده» column across that page would
  // read `NOT_APPLICABLE` for the majority of its own rows — the outcome
  // `usesDimensions`' sub-scoping exists to prevent.
  if (categorySlug === 'pipe' && sub !== null) {
    return PIPE_SCHEDULE_SUBS.has(sub) ? ['grade', 'schedule'] : ['grade'];
  }
  if (categorySlug === 'steel') return ['alloy', 'branchLength'];
  return ['grade'];
}

export type AttrColumn = {
  key: AttrKey;
  label: string;
  /** Desktop table cell — always a string, so the column stays aligned. */
  cell: (row: AttrRow) => string;
  /** Mobile card line, or null when there is nothing worth a line: a card is a
   *  summary, not a spec sheet, and by the established convention of that card
   *  it omits a field rather than printing a placeholder. */
  card: (row: AttrRow) => string | null;
};

/**
 * The attribute columns for one table, each able to answer for any row in it.
 *
 * A cell reads `NOT_APPLICABLE` when the column is not a property of THAT row's
 * own sub-category — which only happens in a mixed «همه» view, where e.g. a
 * non-هاش تیرآهن row sits under «استاندارد», or a پروفیل صنعتی row (whose grade
 * was replaced by a length) sits under «گرید».
 */
export function attributeColumns(
  categorySlug: string | null | undefined,
  sub: string | null,
): AttrColumn[] {
  return attrKeysFor(categorySlug, sub).map((key) => {
    const def = ATTR_DEFS[key];
    const appliesTo = (row: AttrRow) => attrKeysFor(categorySlug, row.subCategoryId).includes(key);
    return {
      key,
      label: def.label,
      cell: (row) => (appliesTo(row) ? (def.read(row) ?? UNKNOWN_VALUE) : NOT_APPLICABLE),
      card: (row) => (appliesTo(row) ? (def.read(row) ?? null) : null),
    };
  });
}

/**
 * The Persian noun for one `PriceUnit` — what `qty` COUNTS in.
 *
 * This existed as four hand-copied `Record<PriceUnit, string>` literals: the
 * cart, the admin lead drawer, the admin lead-item route and the پیش‌فاکتور.
 * Adding «متر مربع» meant editing all four and hoping none was missed — the
 * same shape of problem that once labelled every coupler line «متر» on a
 * customer's proforma. One table now, and the `Record` makes the compiler
 * demand a key for every future member. (`track/TrackLookup` keeps its own
 * switch on purpose; it renders `kg` as «تن».)
 */
export const PRICE_UNIT_LABEL: Record<PriceUnit, string> = {
  kg: 'کیلوگرم',
  branch: 'شاخه',
  sheet: 'برگ',
  meter: 'متر',
  piece: 'عدد',
  sqm: 'متر مربع',
};

/**
 * The Persian noun for one unit of a price basis — «کیلوگرم», «شاخه», … —
 * without the «تومان /» prefix. One table, so the row caption, the page-wide
 * note, the spec sheet's «واحد فروش» row and the وزن‌سنج summary cannot drift
 * into three different words for the same thing.
 *
 * Deliberately NOT `PRICE_UNIT_LABEL` above, even though five of six entries
 * coincide: `meter` is a unit and never a basis, `coil` is a basis and never a
 * unit, and collapsing them would re-conflate the two facts the `price_basis`
 * column exists to separate.
 */
const PRICE_BASIS_NOUN: Record<PriceBasis, string> = {
  kg: 'کیلوگرم',
  branch: 'شاخه',
  coil: 'کلاف',
  sheet: 'برگ',
  piece: 'عدد',
  sqm: 'متر مربع',
};

/**
 * «کلاف ۱۵ متری» — the basis noun, qualified by the branch/coil length when
 * the catalog records one. A length is only ever appended to a basis that IS
 * a length of something; «کیلوگرم ۶ متری» is nonsense and cannot be produced
 * here even if a stray `branchLengthM` is set on a kg-priced row.
 */
export function priceBasisNoun(
  basis: PriceBasis | null | undefined,
  branchLengthM?: number | null,
): string {
  const b: PriceBasis = basis ?? 'kg';
  const noun = PRICE_BASIS_NOUN[b] ?? PRICE_BASIS_NOUN.kg;
  if ((b === 'branch' || b === 'coil') && branchLengthM) {
    return `${noun} ${toPersianDigits(branchLengthM)} متری`;
  }
  return noun;
}

/**
 * What a price on a catalog row is denominated in — «تومان / کیلوگرم».
 *
 * This used to key off `unit` and hard-code the invariant that everything
 * except `piece` is per kilogram. That was false for 55 live rows: a لوله مسی
 * whose price is for a whole 15-metre coil rendered «۱۶٬۴۹۲٬۳۸۰ تومان /
 * کیلوگرم», which to a real buyer reads as a broken site. The denomination is
 * now a stored column (`PriceBasis`), so this just reads it.
 */
export function priceUnitCaption(
  basis: PriceBasis | null | undefined,
  branchLengthM?: number | null,
): string {
  return `تومان / ${priceBasisNoun(basis, branchLengthM)}`;
}

/**
 * The one price basis every given row shares, or null when they disagree.
 *
 * Backs the page-wide «قیمت‌ها … برای هر کیلوگرم است» note: a table mixing
 * kg-priced and عدد-priced products has to drop that sentence and let each
 * row caption itself rather than print a blanket claim that is wrong for some
 * of its own rows. Rows agreeing on the basis but not on the length are still
 * "one basis" — the note then omits the length rather than picking one.
 */
export function singlePriceBasis(
  rows: readonly { priceBasis?: PriceBasis | null; branchLengthM?: number | null }[],
): { basis: PriceBasis; branchLengthM?: number } | null {
  if (rows.length === 0) return { basis: 'kg' };
  const bases = new Set(rows.map((r) => r.priceBasis ?? 'kg'));
  if (bases.size !== 1) return null;
  const basis = [...bases][0] as PriceBasis;
  const lengths = new Set(rows.map((r) => r.branchLengthM ?? null));
  const only = lengths.size === 1 ? [...lengths][0] : null;
  return only ? { basis, branchLengthM: only } : { basis };
}

/* --------------------------- محل تولید (region) --------------------------- */

/**
 * The label a region section is announced by.
 *
 * Rows whose region could not be established fall into `UNKNOWN_VALUE`
 * («نامشخص»), not `NOT_APPLICABLE`: unlike the attribute columns above, a
 * پروفیل IS rolled somewhere — we simply do not know where, so the honest
 * word is "unspecified", never a dash meaning "does not apply".
 */
export const REGION_LABEL = 'محل تولید';

/** Whole-token lookup set for `regionFromFactory`. */
const CITY_NAMES = new Set(CITIES.map((c) => c.name));

/**
 * Best-effort city extraction from a stored mill name.
 *
 * **This is a reconstruction from data we already had, not sourced regional
 * data.** Nothing in this catalog records where a پروفیل is actually rolled.
 * What it does record, for the sub-categories whose `skus.factory` is
 * fabricated, are strings that nevertheless embed a real Iranian city —
 * «پایا اصفهان», «تهران شرق», «فولاد مشهد» — because whoever seeded them
 * reached for plausible-sounding Iranian mill names. That embedded city is
 * the only regional signal the data contains, and ahanonline (the reference
 * these pages are benchmarked against) structures its پروفیل pages by exactly
 * that: «پروفیل اصفهان», «پروفیل تهران». So we recover it rather than
 * inventing one, and nothing downstream should be read as a verified claim
 * about a mill's location.
 *
 * A name with no city in it («نیکان پروفیل», «کیان پرشیا») resolves to
 * `undefined` and lands in the «نامشخص» bucket — never guessed at.
 *
 * Matching is on WHOLE tokens against the road-freight city list this repo
 * already maintains (`data/logistics.CITIES`), not on substrings: «قم» and
 * «ساری» both occur inside plenty of Persian words that are not those cities,
 * and a substring match would silently invent a region for them.
 */
export function regionFromFactory(factory: string | null | undefined): string | undefined {
  if (!factory) return undefined;
  // ZWNJ (U+200C) joins written-together words in Persian and is a token
  // boundary here exactly like a space, so «تهران\u200cشرق» still yields تهران.
  for (const token of factory.split(/[\s\u200c\u200f]+/)) {
    if (token && CITY_NAMES.has(token)) return token;
  }
  return undefined;
}

/**
 * How one price table groups its rows into sections.
 *
 * `factory` is the long-standing «بر اساس کارخانه» structure and stays the
 * default for every category that has real mill names. `region` is its
 * replacement on the پروفیل subs whose mill names are withheld — the
 * structural half of "make it like ahanonline", which groups پروفیل by
 * producing city rather than by brand. `none` is one flat table.
 */
export type GroupMode = 'factory' | 'region' | 'none';

/**
 * Fraction of a table's rows that must resolve to a real city before grouping
 * by region beats one flat list.
 *
 * Below this the page would be one large «نامشخص» section plus a couple of
 * one-row cities — a structure that advertises a regional story the data
 * cannot actually tell. Half is the line: at 50% the named sections carry as
 * many rows as the unknown bucket does.
 */
const REGION_COVERAGE_MIN = 0.5;

/**
 * Which grouping a set of visible rows supports — decided from the rows
 * themselves, never from a category/sub allow-list.
 *
 * Both inputs are already resolved at the DTO boundary
 * (`catalogRepo.toPriceRow` withholds the fabricated factories and derives
 * `region` from them there), so this needs no second opinion about which
 * products have mills. It also means the page heals itself: the day «پروفیل
 * ساختمانی» — the one sub that KEEPS its factory — gets priced stock, the
 * mixed «همه» view has mill names in it again and the factory sections come
 * back on their own.
 */
export function groupModeFor(rows: readonly { factory?: string; region?: string }[]): GroupMode {
  if (rows.some((r) => r.factory)) return 'factory';
  const resolved = rows.filter((r) => r.region).length;
  if (resolved === 0) return 'none';
  return resolved / rows.length >= REGION_COVERAGE_MIN ? 'region' : 'none';
}

/** The catch-all section name in `factory` mode — rows with no mill at all. */
export const OTHER_GROUP = 'سایر';

/**
 * The section a row belongs to under `mode`. Under `none` every row shares
 * the single unnamed section, so the key is the empty string.
 */
export function groupKeyFor(mode: GroupMode, row: { factory?: string; region?: string }): string {
  if (mode === 'factory') return row.factory ?? OTHER_GROUP;
  if (mode === 'region') return row.region ?? UNKNOWN_VALUE;
  return '';
}

/**
 * What a sub-category page is *about*, spelled once — «میلگرد آجدار», not
 * «میلگرد آجدار میلگرد».
 *
 * A sub-category page titles itself «قیمت روز {sub} {category}» so that the
 * category keyword is in the title even when the sub name alone would be
 * ambiguous («هاش سبک» → «قیمت روز هاش سبک تیرآهن»). But 29 of the live
 * sub-categories already carry the category word inside their own name, and
 * appending it a second time produced titles, H1s and meta descriptions
 * reading «قیمت روز میلگرد آجدار میلگرد», «قیمت روز لوله استیل استیل» and —
 * worst of all — «قیمت روز تیرآهن تیرآهن», where the sub is named exactly
 * after its category. A repeated word in the one line Google shows is a
 * quality signal in the wrong direction, and it is also just wrong Persian.
 *
 * The rule: append the category name only when the sub name does not already
 * contain it, comparing on a normalised form so a ZWNJ or an Arabic ي/ك — both
 * of which occur in admin-entered names — cannot make «لوله» fail to match
 * «لوله». Matching is on whole space-separated tokens, so a category name is
 * never found inside a longer word.
 *
 * Deliberately NOT handled: «نبشی و ناودانی», whose subs («نبشی», «ناودانی
 * سبک») each repeat one word of a two-word category without containing the
 * whole of it. Trimming per-token there produces «ناودانی سبک نبشی و»; that
 * category wants a shorter display name, which is an owner decision, not a
 * string rule.
 */
export function subCategorySubject(subName: string, categoryName: string): string {
  return subNameCoversCategory(subName, categoryName) ? subName : `${subName} ${categoryName}`;
}

/** Does `subName` already say `categoryName`, as a run of whole tokens? */
function subNameCoversCategory(subName: string, categoryName: string): boolean {
  const sub = normalizeForMatch(subName);
  const cat = normalizeForMatch(categoryName);
  if (!cat) return false;
  return ` ${sub} `.includes(` ${cat} `);
}

/**
 * Persian text as it should be compared, not as it is stored: ZWNJ removed
 * («لوله‌گوشت‌دار» and «لوله گوشت دار» are the same words), the Arabic ي and ك
 * folded onto the Persian ی and ک, and runs of whitespace collapsed.
 */
function normalizeForMatch(s: string): string {
  return s.replace(/‌/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim().replace(/\s+/g, ' ');
}
