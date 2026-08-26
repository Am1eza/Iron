/**
 * Matching one of our SKUs to an ahanonline listing row — the hard half of the
 * automated price mirror (US-02.5), and the half most likely to be subtly
 * wrong, so everything here is pure and unit-tested.
 *
 * Ported from `.claude/audits/ahanonline-price-comparison-2026-08-19/
 * scripts/match.py`. That script's normalization, per-family size rules and
 * factory-token scoring are reproduced as-is — they were validated against
 * 426 SKUs and 1,541 competitor rows and produced 220 exact matches, so this
 * is adaptation of proven logic rather than a fresh derivation.
 *
 * TWO things are deliberately different, both because that run only wrote a
 * report and this one writes prices customers buy against:
 *
 * - **The mapping is keyed on SLUGS, not Persian names.** The audit's
 *   `SUB_MAP` keyed on `sub_categories.name`, which has since been reworded
 *   («پروفیل و قوطی» → «پروفیل», «هاش سبک (HEA)» → «هاش سبک»). A rename would
 *   have silently un-mapped a whole product line and the mirror would have
 *   reported "no source" forever. Slugs are stable and ASCII.
 * - **Only `exact` is written.** The audit classified a size-only match with a
 *   different mill as `uncertain` and its own §3 shows why that must never be
 *   copied: ahanonline's هاش rows are imported stock at ~200,000 T/kg against
 *   the Iranian-mill هاش our SKUs name, and its پروفیل گالوانیزه / مبلی / هاش
 *   pages group by thickness rather than by mill so no brand is published at
 *   all. Writing an `uncertain` match would have put a 4× price on a real
 *   product. `fuzzy` and `uncertain` are recorded as skips with their reason.
 */
import type { AhanonlineRow } from '@/lib/server/integrations/ahanonline';

export type MatchConfidence = 'exact' | 'fuzzy' | 'uncertain' | 'none';

/** Stable machine codes — persisted in `price_sync_entries.reason`. The
 *  Persian sentence for each lives in the admin UI. */
export const SKIP_REASONS = {
  excluded: 'skip:manual-override',
  noMapping: 'skip:no-source-mapping',
  notPerKgSku: 'skip:sku-not-per-kg',
  noFactory: 'skip:sku-has-no-factory',
  noSizeMatch: 'skip:no-size-match',
  notPerKgSource: 'skip:source-not-per-kg',
  /** The source separates its rows by an explicit variant (آلیاژ / نوع /
   *  حالت / رده) and OUR SKU does not say which one it is. Actionable on our
   *  side: name the alloy on the SKU and the next run matches it. */
  missingVariant: 'skip:sku-missing-variant',
  /** The source published no variant at all on any size-matching row, so its
   *  rows are only distinguishable by size — the one thing that is never
   *  enough. Actionable on nobody's side; it just means "not mirrorable". */
  sourceNoVariant: 'skip:source-has-no-variant',
  /** Both sides name their variant and they DISAGREE: they publish this size,
   *  just not in our alloy (میلگرد ۶ is 310S-only on their table, our SKU is
   *  304L). Actionable on nobody's side — it is a stocking difference, not a
   *  gap in our data — and kept apart from `missingVariant` because that one
   *  tells the operator to go and fill a field which is already filled. */
  variantNotStocked: 'skip:variant-not-stocked',
  lowConfidence: 'skip:low-confidence-match',
  ambiguous: 'skip:ambiguous-candidates',
  outOfBand: 'skip:price-out-of-band',
  sourceStale: 'skip:source-row-stale',
} as const;

export const WRITE_REASON = 'write:exact';

/** The minimum a SKU must expose for this module to reason about it. */
export interface MatchableSku {
  id: string;
  name: string;
  categorySlug: string;
  subCategorySlug: string;
  size: string | null;
  factory: string | null;
  /**
   * `skus.grade` — the alloy designation (304 / 304L / 310S / 316L) for the
   * stainless lines. A STRUCTURED column we already populate, which is the
   * whole reason the استیل families are mirrorable without renaming a single
   * SKU: ahanonline keys those tables on آلیاژ, and the answer was sitting in
   * this column the entire time (see `IDENTITY`'s `from: 'grade'`).
   */
  grade: string | null;
  /** What the SKU's price is denominated in. Mirrorable only where a source
   *  row publishes the SAME unit — `kg`, or `piece` for کوپلر. Never converted;
   *  see `unitMatchesBasis`. */
  priceBasis: string;
}

export interface MatchConfig {
  /** Plausibility band for a per-kg carbon-steel price, Toman. Guards against
   *  a wholesale unit change on their side (rial↔toman is a 10× move).
   *  Families that legitimately trade outside it — stainless, copper, per-عدد
   *  کوپلر — override it in `PRICE_BANDS`. */
  minPriceToman: number;
  maxPriceToman: number;
  /** Tied exact candidates whose prices spread wider than this are treated as
   *  "we cannot tell which product this is" and skipped. */
  maxCandidateSpreadPct: number;
  /** Refuse to mirror a competitor row they themselves last touched more than
   *  this many days ago. 0 disables the check. */
  maxSourceAgeDays: number;
  /** Today, for the source-age check. */
  now: Date;
}

export const DEFAULT_MATCH_CONFIG: Omit<MatchConfig, 'now'> = {
  minPriceToman: 10_000,
  maxPriceToman: 500_000,
  maxCandidateSpreadPct: 8,
  maxSourceAgeDays: 10,
};

// ---------------------------------------------------------------------------
// Normalization (match.py `norm`)
// ---------------------------------------------------------------------------

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const FRACTIONS: Record<string, string> = {
  '¼': ' 1/4',
  '½': ' 1/2',
  '¾': ' 3/4',
  '⅓': ' 1/3',
  '⅔': ' 2/3',
};

/** Persian/Arabic digits → ASCII, unify ی/ک, drop ZWNJ, harmonize ×/x/X → *. */
export function norm(input: string | null | undefined): string {
  if (!input) return '';
  let s = String(input);
  for (const [k, v] of Object.entries(FRACTIONS)) s = s.split(k).join(v);
  s = s.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)));
  s = s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
  s = s
    .replace(/ك/g, 'ک')
    .replace(/[يى]/g, 'ی')
    .replace(/ة/g, 'ه')
    .replace(/‌/g, ' ')
    .replace(/ /g, ' ')
    .replace(/ـ/g, '')
    // Arabic-Indic decimal (U+066B) and thousands (U+066C) separators. Our
    // catalogue writes thicknesses as «۱٫۵»; without this `nums()` reads that
    // as TWO numbers, 1 and 5, and «ورق آلومینیوم ۱٫۵» silently size-matches
    // the 1mm row. Only 12 SKUs carry it in `size` today, but they are exactly
    // the sub-millimetre sheet gauges the new pages are keyed on.
    .replace(/٫/g, '.')
    .replace(/٬/g, '');
  s = s.replace(/[ً-ٟ]/g, '');
  s = s.replace(/[×xX]/g, '*');
  return s.replace(/\s+/g, ' ').trim();
}

/** Every number in a string, in order. */
export function nums(s: string | null | undefined): number[] {
  return [...norm(s).matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}

/** «۱¼ اینچ» / «1 1/4» / «3/4"» → inches. */
export function inchValue(s: string | null | undefined): number | null {
  let t = norm(s).replace(/"/g, ' ').replace(/اینچ/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  let m = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = /^(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (m) return Number(m[1]) / Number(m[2]);
  m = /^(\d+(?:\.\d+)?)$/.exec(t);
  if (m) return Number(m[1]);
  return null;
}

function dimsKey(s: string | null | undefined): string | null {
  const n = nums(s);
  return n.length >= 2 ? [...n].sort((a, b) => a - b).join('*') : null;
}

// ---------------------------------------------------------------------------
// Factory similarity (match.py `fac_score`)
// ---------------------------------------------------------------------------

const FACTORY_STOPWORDS = new Set(
  (
    'میلگرد تیرآهن هاش نبشی ناودانی سپری پروفیل قوطی لوله ورق کلاف مفتول سیم مش توری ' +
    'فولاد صنایع شرکت مجتمع گروه نورد کارخانه بنگاه آهن ساده آجدار صنعتی گالوانیزه رنگی روغنی سیاه ' +
    // Material words, added with the non-ferrous / stainless pages. They are
    // nouns for the product, never a mill: ahanonline brands اراک's aluminium
    // sheet «نورد آلومینیوم اراک» against our factory «اراک», which without
    // this scores 0.5 (fuzzy) and is skipped even though the mill is identical.
    'آلومینیوم مسی مس استیل استنلس تسمه کوپلر شیروانی آلوزینک گالوالوم ' +
    // Third pass, same rule: a product noun, never a mill. ahanonline brands
    // its spiral pipe «لوله اسپیرال نورد لوله و پوشش نیزار» and «لوله اسپیرال
    // کالوپ» against our «نورد لوله و پوشش نیزار» / «کالوپ», which scores
    // 0.67 and 0.5 — fuzzy, therefore skipped, on a mill that is identical.
    // Adding this one word turns all 12 لوله اسپیرال SKUs into exact matches.
    'اسپیرال'
  ).split(' '),
);

const FACTORY_ALIAS: Record<string, string> = {
  'ذوب آهن اصفهان': 'ذوب آهن',
  'کویر کاشان': 'کاشان',
  'فولاد کویر کاشان': 'کاشان',
  'امیرکبیر خزر': 'امیرکبیر',
  'قائم اصفهان': 'قائم',
  'یزد احرامیان': 'یزد',
  'ظهوریان مشهد': 'ظهوریان',
  'شکفته مشهد': 'شکفته',
  'لوله سپاهان': 'سپاهان',
  'نورد لوله ساوه': 'ساوه',
  'لوله سازی اهواز': 'اهواز',
  'فولاد اهواز': 'اهواز',
  'لوله سمنان': 'سمنان',
  'جهان فولاد سیرجان': 'سیرجان',
  'فولاد نطنز': 'نطنز',
  'سیادن ابهر': 'ابهر',
  'فولاد گیلان': 'گیلان',
  'فولاد سبا': 'سبا',
  'ورق شهرکرد': 'شهرکرد',
  'کاویان اهواز': 'کاویان',
  'اکسین اهواز': 'اکسین',
  'قطعات اصفهان': 'قطعات',
  'فولاد مشهد': 'مشهد',
  'پروفیل صابری': 'صابری',
  'نیکان پروفیل': 'نیکان',
  'پروفیل یاران': 'یاران',
  'پایا اصفهان': 'پایا',
  'درپاد تهران': 'درپاد',
  'جهان فولاد غرب': 'غرب',
  'ماهان سپاهان': 'ماهان',
  'فولاد متین': 'متین',
  // ahanonline groups the Bonab beam mill as «تیرآهن بناب»; our SKUs name it
  // in full. Same shape as 'شکفته مشهد': 'شکفته' above.
  'ظفر بناب': 'بناب',
};

function factoryTokens(s: string | null | undefined): Set<string> {
  const n0 = norm(s);
  const n = FACTORY_ALIAS[n0] ?? n0;
  const toks = n.split(' ').filter((t) => t.length > 1 && !FACTORY_STOPWORDS.has(t));
  return new Set(toks.length > 0 ? toks : n.split(' ').filter(Boolean));
}

/** 0..1 similarity between two free-text mill names. 0 when either side is
 *  blank — which is exactly what makes the brandless competitor pages (هاش,
 *  پروفیل گالوانیزه, پروفیل مبلی) fall out as un-writable. */
export function factoryScore(a: string | null | undefined, b: string | null | undefined): number {
  const A = factoryTokens(a);
  const B = factoryTokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  const inter = [...A].filter((t) => B.has(t));
  if (inter.length === 0) return 0;
  if (A.size === B.size && inter.length === A.size) return 1;
  return inter.length / Math.max(A.size, B.size);
}

// ---------------------------------------------------------------------------
// Reading a competitor row
// ---------------------------------------------------------------------------

function cell(row: AhanonlineRow, ...keys: string[]): string {
  for (const k of keys) {
    const v = row.cells[k];
    if (v) return v;
  }
  return '';
}

/** Headings that are a thickness/class, not a mill — see match.py NOT_A_BRAND. */
const NOT_A_BRAND = /^(ضخامت|رده|HEA|HEB|W\d|ST\d|\d)/i;

const GROUP_PREFIXES = [
  'میلگرد ساده',
  'میلگرد',
  'تیرآهن',
  'نبشی',
  'ناودانی',
  'سپری',
  'پروفیل صنعتی',
  'پروفیل گالوانیزه',
  'پروفیل مبلی',
  'پروفیل',
  'لوله گالوانیزه',
  'لوله درز مستقیم',
  'لوله آهنی سیاه',
  'لوله مانسمان',
  'ورق گالوانیزه',
  'ورق روغنی',
  'ورق سیاه',
  'ورق رنگی',
  'هاش',
  'سیم مفتول',
  // Third pass: their group heading is «ورق کرکره تاراز» / «قلع اندود فولاد
  // مبارکه», so without these the product noun stays in the mill string and
  // an otherwise identical mill scores 0.5 (fuzzy) and is skipped.
  'ورق کرکره',
  'قلع اندود',
];

/**
 * Pages that publish the mill INSIDE «نام کالا» and nowhere else, mapped to
 * the word that ends the mill segment of that name.
 *
 * میلگرد حرارتی is the only one so far: its rows read «میلگرد ساده 6.5 ابهر
 * کلاف کارخانه», its «برند» column does not exist, and its group heading is
 * the bare category name. Cutting at «کلاف» is what separates the mill from
 * the delivery point — without it «میلگرد ساده 6.5 ملایر کلاف تهران» yields
 * {ملایر, تهران} against our {ملایر} and scores 0.5, and «تهران» cannot simply
 * be made a stopword because it is a real mill name on the پروفیل pages.
 *
 * The digits are stripped too: a size left in the token set is one more
 * element for `factoryScore`'s set-equality test to trip over.
 */
const NAME_FACTORY_PATHS: Readonly<Record<string, string>> = {
  'میلگرد/قیمت-میلگرد/میلگرد-ساده/میلگرد-حرارتی': 'کلاف',
};

export function rowFactory(row: AhanonlineRow): string {
  const cutAt = NAME_FACTORY_PATHS[row.sourcePath];
  if (cutAt !== undefined) {
    const n = norm(row.name);
    const head = n.includes(cutAt) ? n.slice(0, n.indexOf(cutAt)) : n;
    return head.replace(/[\d.]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const branded = cell(row, 'برند', 'کارخانه', 'کشور / کارخانه');
  if (branded) return branded;
  let g = norm(row.group);
  for (const w of GROUP_PREFIXES) {
    if (g.startsWith(w)) {
      g = g.slice(w.length).trim();
      break;
    }
  }
  return !g || NOT_A_BRAND.test(g) ? '' : g;
}

export type RowUnit = 'kg' | 'branch' | 'sheet' | 'meter' | 'sqm' | 'piece' | 'coil' | '';

/**
 * What a page's rows are denominated in when its table publishes **no**
 * «واحد» column at all.
 *
 * Most ahanonline tables omit the column and are per-kilogram throughout,
 * which is why `unitMatchesBasis` treats the empty unit as `kg`. That default
 * is wrong for the specialty pages this third pass added — وال پست is quoted
 * per شاخه and لوله مسی per کلاف, neither says so, and neither is remotely a
 * per-kg number (113,827 for a وال پست, 12.7 million for a copper coil).
 *
 * Each entry below is an assertion about a page, so each was checked against
 * the page rather than inferred from its title, and each is corroborated by
 * our own stored price for the same product sitting a few percent under the
 * row — which it could not do if the units disagreed:
 *
 *   وال پست    — «وال پست 2 10*20» at 113,827 against our per-شاخه 108,406.
 *   لوله مسی   — «لوله مسی 0.81 "1/2 بابک 15 متری» at 12,710,447 against our
 *                per-کلاف 10,881,300, which is that row's price before the
 *                +16.8% they applied today (10,881,300 × 1.168 = 12,709,358).
 *   ورق پانچ   — priced per برگ; a 2mm 1250×2500 sheet at 5,345,455.
 *
 * A page absent from this map keeps the per-kg default, unchanged.
 */
const PAGE_UNIT: Readonly<Record<string, RowUnit>> = {
  'نبشی-و-ناودانی/وال-پست': 'branch',
  'انواع-ورق/ورق-پانچ-سیاه': 'sheet',
};

/**
 * لوله مسی sells the same size and wall thickness two ways, and its «حالت»
 * cell is the only thing that says which: «15 متری» is a coil and «6 متری» is
 * a straight length. They are 3.5× apart at the same ضخامت and mill — «لوله
 * مسی 0.81 3/4 بابک 15 متری» at 19,264,749 against the 6-متری row at
 * 5,463,984 — so reading them as one product is the single way this family
 * could go badly wrong.
 *
 * Modelled as the row's UNIT rather than as an identity variant because that
 * is what it is, and because it then lines up with `skus.price_basis`, which
 * already records `coil` for all fifteen of our لوله مسی SKUs. The 6-متری rows
 * become simply un-mirrorable against a coil-priced SKU instead of needing a
 * rule to remember.
 */
const HALAT_UNIT: Readonly<Record<string, ReadonlyArray<[string, RowUnit]>>> = {
  'انواع-لوله/لوله-مسی': [
    ['15 متری', 'coil'],
    ['6 متری', 'branch'],
  ],
};

export function rowUnit(row: AhanonlineRow): RowUnit {
  const byHalat = HALAT_UNIT[row.sourcePath];
  if (byHalat) {
    const h = norm(cell(row, 'حالت'));
    // No «حالت» at all, or one nobody has seen before, is NOT a guess: it
    // falls through to '' and the row prices nothing.
    for (const [needle, unit] of byHalat) if (h.includes(needle)) return unit;
    return '';
  }
  // `unit` (ASCII) appears alongside «واحد» on the newer stainless pages —
  // ahanonline's own tables are inconsistent about which they emit.
  const u = norm(cell(row, 'واحد', 'unit'));
  if (u.includes('شاخه')) return 'branch';
  if (u.includes('کیلو')) return 'kg';
  if (u.includes('برگ')) return 'sheet';
  if (u.includes('عدد')) return 'piece';
  // «مترمربع» / «متر مربع» BEFORE the plain «متر» test: it contains it, and
  // reading a square-metre price as a linear-metre one would put a ساندویچ
  // پانل price on the wrong basis without anything looking wrong.
  if (u.includes('مربع')) return 'sqm';
  if (u.includes('متر') && !u.includes('متری')) return 'meter';
  return PAGE_UNIT[row.sourcePath] ?? '';
}

/**
 * Which of OUR `price_basis` values a source row's unit is like-for-like with.
 *
 * Only ever an identity mapping — there is deliberately no conversion here. A
 * per-شاخه row cannot price a per-kg SKU without multiplying through
 * `theoretical_weight_kg`, which is exactly the manufactured number the mirror
 * refuses to invent (see `notPerKgSku`). `''` means the source published no
 * unit, which the per-kg families tolerate (their tables are per-kg
 * throughout) and nothing else does.
 */
export function unitMatchesBasis(unit: RowUnit, priceBasis: string): boolean {
  if (unit === '') return priceBasis === 'kg';
  return unit === priceBasis;
}

/** Their pages where «سایز/ابعاد» is the sheet's width×length, so the
 *  comparable dimension is the thickness column (or the group heading). */
const SHEET_PATHS = new Set([
  'انواع-ورق/ورق-سیاه',
  'انواع-ورق/ورق-گالوانیزه',
  'انواع-ورق/ورق-رنگی',
  'انواع-ورق/ورق-روغنی',
  'انواع-ورق/ورق-آجدار',
  'انواع-ورق/ورق-اسید-شوئی',
  'انواع-ورق/عرشه-فولادی-گالوانیزه',
  'انواع-ورق/ورق-st52',
]);

/** Their pages that publish the size only inside the product name. */
const NAME_SIZE_PATHS = new Set([
  'میلگرد/قیمت-میلگرد/میلگرد-کلاف',
  'محصولات-مفتولی/سیم-مفتول',
  'محصولات-مفتولی/سیم-آرماتور',
  'محصولات-مفتولی/مش',
  // Third pass. «میلگرد ساده 5.5 ابهر کلاف کارخانه» — the 5.5 is the size and
  // the table has no column for it.
  'میلگرد/قیمت-میلگرد/میلگرد-ساده/میلگرد-حرارتی',
]);

/**
 * Pages whose comparable dimension is NOT in a «سایز»-ish column under that
 * name. Consulted before every other rule, so a page that needs an explicit
 * answer gets one instead of falling through to a lucky guess.
 *
 * Every entry was read off the live table (see
 * `docs/price-sync-source-survey.md`), not inferred from the page title:
 * - تسمه is priced by ضخامت×عرض, and its «عرض» cell reads «عرض 50 میلیمتر»
 *   rather than a bare number — both are kept and `nums()` picks the pair out.
 * - The stainless pages emit ASCII `size` / `standard` / `state` / `unit`
 *   headers instead of Persian ones.
 * - ساندویچ پانل's thickness column is «ضخامت(عایق)» (the insulation core),
 *   which is what our SKU's size means too.
 */
const SIZE_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  // Thickness ONLY, deliberately, even though the table also carries «عرض».
  // Our تسمه SKUs put the width in the name («تسمه ماشینکاری ۳×۵۵») and leave
  // `size` as the bare thickness, so a width comparison has nothing to compare
  // against. That is safe here and not a fudge: ahanonline prices تسمه by
  // حالت, and every width at a given حالت carries the same number (verified
  // 1405/06/01 — نوردی 0.0% spread, ماشینکاری 3.3%, فابریک 4.2%, all inside
  // the 8% `maxCandidateSpreadPct` gate). The day they start pricing widths
  // apart, those rows spread past the gate and the SKU skips instead of
  // guessing — which is exactly the behaviour we want to inherit rather than
  // a rule that has to be remembered.
  'انواع-ورق/تسمه': ['ضخامت'],
  // Sheet pages where «سایز» is the sheet's WIDTH and the comparable dimension
  // is the thickness. Without these, `cell()` returns «سایز» first and every
  // SKU size-matches against a 1000mm-wide coil instead of a 6mm plate.
  'انواع-ورق/ورق-مسی': ['ضخامت'],
  'انواع-ورق/ورق-ضد-سایش': ['ضخامت'],
  'انواع-ورق/ورق-دریایی': ['ضخامت'],
  'انواع-ورق/ورق-شیروانی': ['ضخامت'],
  'میلگرد/میلگرد-استیل': ['size'],
  'انواع-ورق/ساندویچ-پانل': ['ضخامت(عایق)'],
  'انواع-ورق/ورق-آلومینیوم-آجدار': ['ضخامت (میل)'],
  'انواع-ورق/ورق-پانچ-سیاه': ['ضخامت (mm)'],
  'استنلس-استیل/پروفیل-استیل': ['ابعاد'],
  // «نام کالا» comes first in this table and is a lone dash on every row, so
  // the generic `cell()` fallback order is fine — named explicitly anyway so
  // a future column reshuffle on their side cannot quietly repoint it.
  'استنلس-استیل/لوله-استیل/لوله-استیل-صنعتی': ['سایز'],
  'انواع-لوله/لوله-مسی': ['size'],
  // Third pass. «سایز» here is the SHEET's width×length (924*801), the same
  // trap `SHEET_PATHS` exists for; the comparable dimension is the thickness
  // our SKU records («قلع‌اندود ۰.۱۷ فولاد مبارکه»).
  'انواع-ورق/قلع-اندود': ['ضخامت'],
  // ورق کرکره publishes ضخامت and عرض and no «سایز» at all; naming it here
  // stops a future column reshuffle from repointing this at the 1250 width.
  'انواع-ورق/ورق-کرکره': ['ضخامت'],
};

/**
 * Families where NEITHER side publishes a size, so every row on the (declared
 * single-product) page is a candidate and the ambiguity gate alone decides.
 *
 * Both entries were verified on the live tables, and both are sizeless for the
 * same reason — the price does not depend on the dimension:
 *
 *   گریتینگ گالوانیزه — 4 rows, one per حالت (تسمه*تسمه، تسمه*میلگرد، …),
 *                       all at 200,847–200,848. Our single SKU records no
 *                       size either.
 *   تسمه مسی          — 18 rows spanning 15*3 to 100*100, every one at
 *                       2,520,000, because copper strip is sold by weight and
 *                       the section does not move the per-kg number. Our 18
 *                       SKUs carry the section in `size` and all 18 hold that
 *                       same 2,520,000 today.
 *
 * This only ever WIDENS the candidate pool of a `size-only` family; it does
 * not loosen the price agreement those rows still have to reach.
 */
const SIZELESS_KEYS = new Set(['sheet/grating', 'felezat-rangi/copper-strip']);

export function rowSize(row: AhanonlineRow): string {
  const explicit = SIZE_COLUMNS[row.sourcePath];
  if (explicit) {
    return explicit
      .map((c) => row.cells[c] ?? '')
      .filter(Boolean)
      .join(' ');
  }
  if (SHEET_PATHS.has(row.sourcePath)) {
    const v = cell(row, 'ضخامت (میل)', 'ضخامت');
    if (v) return v;
    const g = norm(row.group);
    const m =
      /ضخامت\s*(\d+(?:\.\d+)?)/.exec(g) ??
      /(\d+(?:\.\d+)?)\s*میل/.exec(g) ??
      /(\d+(?:\.\d+)?)\s*$/.exec(g);
    return m ? m[1]! : '';
  }
  if (NAME_SIZE_PATHS.has(row.sourcePath)) {
    const m = /(\d+(?:\.\d+)?)/.exec(norm(row.name));
    return m ? m[1]! : '';
  }
  return cell(row, 'سایز', 'ضخامت (میل)', 'ضخامت', 'ابعاد', 'ارتفاع', 'سایز(mm)');
}

export function rowDelivery(row: AhanonlineRow): string {
  return norm(cell(row, 'محل تحویل', 'تحویل', 'انبار'));
}

/** Their «تاریخ بروزرسانی», e.g. `1405/5/31`, as a Jalali y/m/d triple. */
export function rowUpdatedAt(row: AhanonlineRow): string {
  return norm(cell(row, 'تاریخ بروزرسانی', 'تاریخ به‌روزرسانی', 'تاریخ')).trim();
}

// ---------------------------------------------------------------------------
// Our taxonomy → their category pages
// ---------------------------------------------------------------------------

/**
 * `categorySlug/subCategorySlug` → the competitor pages that carry the same
 * product line. A sub-category absent from this map is never synced — that
 * covers استیل, فلزات رنگی and the specialty lines (وال پست، لوله جدار چاه،
 * کوپلر، گریتینگ، ساندویچ پانل…) that ahanonline simply does not publish a
 * like-for-like price for.
 */
export const SOURCE_PATHS: Readonly<Record<string, readonly string[]>> = {
  'rebar/deformed': ['میلگرد/قیمت-میلگرد'],
  'rebar/mylgrd-sadh': ['میلگرد/میلگرد-ساده'],

  'wire/coil': ['میلگرد/قیمت-میلگرد/میلگرد-کلاف', 'میلگرد/میلگرد-ساده'],
  'wire/coil-ribbed': ['میلگرد/قیمت-میلگرد/میلگرد-کلاف', 'میلگرد/قیمت-میلگرد'],
  'wire/wire': ['محصولات-مفتولی/سیم-مفتول'],
  'wire/wire-galvanized': ['محصولات-مفتولی/سیم-مفتول'],
  'wire/tie': ['محصولات-مفتولی/سیم-آرماتور'],
  // مش only: محصولات-مفتولی/توری resolves but publishes zero priced rows, so
  // keeping it here bought nothing except a 'page failed' line every run.
  'wire/mesh': ['محصولات-مفتولی/مش'],

  'ibeam/tirahan': ['تیرآهن-و-هاش/تیرآهن'],
  'ibeam/light': ['تیرآهن-و-هاش/تیرآهن'],
  // NOT ibeam/lane-zanburi. A castellated beam is a different product from the
  // plain IPE of the same nominal size, and ahanonline publishes no
  // لانه‌زنبوری row at all (checked: 0 of 45 rows on that page). Mapped here it
  // would have matched a plain تیرآهن of the same size and mill — every
  // confidence gate passing, on the wrong product.
  'ibeam/hash-sabok': ['تیرآهن-و-هاش/هاش'],
  'ibeam/hash-sangin': ['تیرآهن-و-هاش/هاش'],

  'angle-channel/nabshi': ['نبشی-و-ناودانی/نبشی'],
  // NOT angle-channel/angle-unequal and NOT angle-channel/spot, for the same
  // reason, both confirmed against the live page: it carries 82 rows, none
  // unequal-leg (no «نامساوی», no 100*75-style pair) and none لقمه. A
  // بال‌نامساوی SKU would have matched the equal-leg row sharing its first
  // dimension, and «نبشی لقمه ۱۰» actually DID get priced from «نبشی
  // 10*100*100 آریان فولاد» in the first live run — right mill, right leg,
  // wrong product, +121%. That write was rolled back and this is the fix.
  'angle-channel/channel-light': ['نبشی-و-ناودانی/ناودانی'],
  'angle-channel/channel-heavy': ['نبشی-و-ناودانی/ناودانی'],
  'angle-channel/separi': ['نبشی-و-ناودانی/سپری'],

  'sheet/black': ['انواع-ورق/ورق-سیاه'],
  'sheet/galvanized': ['انواع-ورق/ورق-گالوانیزه'],
  'sheet/colored': ['انواع-ورق/ورق-رنگی'],
  'sheet/oiled': ['انواع-ورق/ورق-روغنی'],
  'sheet/checkered': ['انواع-ورق/ورق-آجدار'],
  'sheet/pickled': ['انواع-ورق/ورق-اسید-شوئی'],
  'sheet/deck': ['انواع-ورق/عرشه-فولادی-گالوانیزه'],
  'sheet/alloy': ['انواع-ورق/ورق-st52'],

  'profile/box-square': ['انواع-پروفیل/پروفیل', 'انواع-پروفیل/پروفیل-صنعتی'],
  'profile/box-rect': ['انواع-پروفیل/پروفیل', 'انواع-پروفیل/پروفیل-صنعتی'],
  'profile/frame': ['انواع-پروفیل/پروفیل'],
  'profile/profil-sotuni': ['انواع-پروفیل/پروفیل-صنعتی', 'انواع-پروفیل/پروفیل'],
  'profile/prvfyl-snaty': ['انواع-پروفیل/پروفیل-صنعتی'],
  'profile/profil-mobli': ['انواع-پروفیل/پروفیل-مبلی'],
  'profile/profil-galvanizeh': ['انواع-پروفیل/پروفیل-گالوانیزه'],
  'profile/profil-z': ['انواع-پروفیل/پروفیلz'],

  'pipe/industrial': ['انواع-لوله/لوله-آهنی-سیاه', 'انواع-لوله/لوله-درز-مستقیم'],
  'pipe/gas': ['انواع-لوله/لوله-درز-مستقیم'],
  'pipe/scaffold': ['انواع-لوله/لوله-داربستی'],
  'pipe/spiral': ['انواع-لوله/لوله-اسپیرال'],
  'pipe/seamless-internal': ['انواع-لوله/لوله-مانسمان'],
  'pipe/furniture': ['انواع-لوله/لوله-گوشتدار'],
  'pipe/thick-walled': ['انواع-لوله/لوله-گوشتدار'],
  'pipe/galvanized': ['انواع-لوله/لوله-گالوانیزه'],

  // ---- added by the multi-source survey (US-05.3) -------------------------
  // ahanonline publishes 352 product-category pages; the mirror was pointed at
  // 32 of them, which is the whole reason the non-ferrous, stainless and
  // specialty lines never updated. Each page below was fetched and parsed
  // before being listed here — row counts and the identity column that makes
  // it matchable are in `docs/price-sync-source-survey.md`. Pages that exist
  // but publish NOTHING (آلومینیوم/میلگرد-آلومینیوم, آلومینیوم/لوله-آلومینیوم,
  // آلومینیوم/نبشی-آلومینیوم, انواع-پروفیل/پروفیل-آلومینیوم, مس, آلومینیوم,
  // استنلس-استیل/تسمه-استنلس-استیل — all 0 priced rows) are deliberately NOT
  // listed: mapping them would only manufacture a «page failed» line per run.
  'sheet/strip': ['انواع-ورق/تسمه'],
  'sheet/steel': ['انواع-ورق/ورق-استیل'],
  'sheet/roofing': ['انواع-ورق/ورق-شیروانی'],
  'sheet/aluzinc': ['انواع-ورق/آلوزینک'],
  'sheet/wear-resistant': ['انواع-ورق/ورق-ضد-سایش'],
  'sheet/marine': ['انواع-ورق/ورق-دریایی'],
  'rebar/coupler': ['میلگرد/کوپلر'],
  'profile/chaharpahlu': ['انواع-ورق/چهارپهلو'],
  'profile/chaharpahlu-alloy': ['انواع-ورق/چهارپهلو-آلیاژی'],
  'pipe/well-casing': ['انواع-لوله/لوله-جدار-چاه'],
  'felezat-rangi/aluminum-sheet': ['انواع-ورق/ورق-آلومینیوم'],
  'felezat-rangi/copper-sheet': ['انواع-ورق/ورق-مسی'],

  // ---- the استیل families, unlocked by `from: 'grade'` (US-05.3) ----------
  // These were reported as "deliberately left unmatched" by the source survey
  // on the grounds that «our SKU names carry a country (هند/تایوان/چین) and no
  // alloy». That was true of the NAMES and false of the catalogue: `skus.grade`
  // already holds 304 / 304L / 310S / 316L on all 55 of them, and the stored
  // price agrees with ahanonline's row for that alloy TO THE RIAL — 316L
  // میلگرد at 1,218,181 against their 1,218,182, 304L at 831,818, 310S at
  // 1,919,090. They were hand-seeded from these very pages. Nothing here
  // relaxes the identity bar; it reads the same explicit published token out
  // of a column instead of out of a name.
  //
  // Each page below was fetched and parsed with `parseAhanonlinePage` on
  // 1405/06/01 before being listed — row counts in the survey doc.
  'rebar/stainless': ['میلگرد/میلگرد-استیل'],
  // The CHILD page, not the parent `استنلس-استیل/لوله-استیل`. The parent
  // publishes سایز and رده but NO آلیاژ column, so its 80 rows interleave
  // 316L at 1,700,000 and 304 at 886,806 with nothing to tell them apart —
  // exactly the "distinguishable only by size" case `sourceNoVariant` exists
  // for. The child publishes the same rows WITH آلیاژ.
  'steel/pipe': ['استنلس-استیل/لوله-استیل/لوله-استیل-صنعتی'],
  'steel/angle': ['استنلس-استیل/نبشی-استیل'],
  'steel/channel': ['استنلس-استیل/ناودانی-استیل'],
  'steel/profile': ['استنلس-استیل/پروفیل-استیل'],
  'wire/welding-wire': ['میلگرد/سیم-جوش-استیل'],
  'wire/wire-rod': ['میلگرد/سیم-مفتول-استیل'],

  // ---- the specialty lines (US-05.3, third pass) --------------------------
  // Found by re-diffing the mirror's page list against ahanonline's own
  // sitemap — the follow-up the source survey asked for and nobody had run.
  // Every one of these sub-categories was reported as "no source exists" and
  // every one of them had a page. See `AHANONLINE_TARGETS` for what was
  // checked and rejected.
  //
  // Four of them are `from: 'size-only'` families below, which is a mode this
  // pass introduces; read the comment on `IdentitySpec` before adding a fifth.
  'angle-channel/val-post': ['نبشی-و-ناودانی/وال-پست'],
  'sheet/grating': ['انواع-ورق/گریتینگ/گریتینگ-گالوانیزه'],
  'sheet/sandwich-panel': ['انواع-ورق/ساندویچ-پانل'],
  'sheet/corrugated': ['انواع-ورق/ورق-کرکره'],
  'sheet/tin-coated': ['انواع-ورق/قلع-اندود'],
  'profile/congress': ['انواع-پروفیل/پروفیل-کنگره'],
  'rebar/heat-treated': ['میلگرد/قیمت-میلگرد/میلگرد-ساده/میلگرد-حرارتی'],
  'felezat-rangi/copper-pipe': ['انواع-لوله/لوله-مسی'],
  'felezat-rangi/copper-strip': ['انواع-ورق/تسمه-مسی'],
  // Mapped so the admin log says WHY rather than saying nothing: their two
  // rows are both ضخامت 2 فولاد مبارکه and differ only by ابعاد
  // (1000*2000 at 3,438,182 against 1250*2500 at 5,345,455, a 55% spread).
  // Our SKU records no ابعاد, so this lands on `ambiguous` every run — which
  // is the correct answer, and now a visible one.
  'sheet/perforated-black': ['انواع-ورق/ورق-پانچ-سیاه'],
};

// ---------------------------------------------------------------------------
// Product identity beyond the mill
// ---------------------------------------------------------------------------

/**
 * WHAT MAKES TWO ROWS DIFFERENT PRODUCTS, per family.
 *
 * The original mirror had exactly one answer: the mill. That works for the
 * ferrous lines, where ahanonline brands every row, and it is why the ferrous
 * half of the catalogue syncs. It does not work for the non-ferrous and
 * stainless pages, where the mill is often irrelevant and the price is set by
 * something else entirely:
 *
 *   ورق استیل    — آلیاژ 304L vs 316L is a 1.7× price difference; the mill is
 *                  not published at all.
 *   کوپلر        — نوع (انتهایی / بغل پیچ / میانی استاندارد / …) at one size
 *                  ranges 82,800 → 1,196,000 تومان.
 *   تسمه         — حالت (نوردی / فابریک / ماشینکاری) sets the price; within a
 *                  حالت every size carries the SAME number.
 *
 * Dropping to "same size wins" for these would be the exact failure the
 * ambiguity gates exist to prevent, so instead each family names the column
 * that carries its identity and where OUR copy of that identity lives. The bar
 * is unchanged — an explicit, published token has to agree on both sides — it
 * is only the *field* that varies.
 *
 * A family absent from this map keeps the original mill rule verbatim.
 */
/**
 * Pseudo-column naming the table's bold heading rather than a cell.
 *
 * ساندویچ پانل needs it: سقفی and دیواری are the same ضخامت at different
 * prices, and ahanonline puts that word ONLY in the heading above each table —
 * its «مدل» column reads «دو رو ورق» on all six rows and distinguishes
 * nothing. Kept as an explicit opt-in rather than a general "fall back to the
 * group" rule, because on most pages the heading is the mill and reading it as
 * a variant would compare two different things.
 */
export const GROUP_COLUMN = '*group';

export interface IdentitySpec {
  /** Source cell(s) whose value IS the identity for this family, in order. */
  columns: readonly string[];
  /**
   * `factory` — score against `sku.factory` with `factoryScore`, as before.
   * `name`    — every token of the source's value must appear in the SKU's
   *             name. Our catalogue writes these into the name («ورق استیل ۱۲
   *             304L», «کوپلر انتهایی ۱۸») rather than into a column, so the
   *             name is where the answer actually is.
   * `grade`   — the source's value must EQUAL `skus.grade` exactly. Used by
   *             the stainless families, where the identity is an alloy code
   *             we already store in a structured column.
   *
   *             Equality, not `includes`, and that is the whole point: «304»
   *             is a substring of «304L» but a different alloy at a different
   *             price (886,806 vs 831,818 T/kg on their own tables today), and
   *             the `name` mode's token-containment test would have silently
   *             conflated the two. Every one of our 55 stainless SKUs already
   *             carries a value that matches a published آلیاژ exactly, so
   *             nothing is lost by demanding it.
   * `grade-number`
   *           — as `grade`, but both sides are reduced to the NUMBERS they
   *             contain before comparing. For a dimensional grade the two
   *             sides spell the same fact differently — our «ضخامت ۰.۸۱»
   *             against their «0.81» — and demanding string equality would
   *             report a gap in our catalogue that is not there. Equality of
   *             the full number list, so 0.81 never satisfies a 0.8 row.
   *
   *             Use it ONLY where the grade is a measurement. An alloy code is
   *             not: reducing «316L» and «304L» to numbers keeps them distinct
   *             by luck, and «304» against «304L» would collapse — which is
   *             the exact conflation plain `grade` was written to prevent.
   * `size-only`
   *           — the mapped page sells ONE product and publishes no mill and no
   *             variant column on either side, so the size IS the identity.
   *             `columns` is ignored.
   *
   *             THIS IS THE DANGEROUS MODE and it is the one that priced
   *             «نبشی لقمه ۱۰» off a plain «نبشی 10*100*100» row at +121%, so
   *             read this before adding a family to it:
   *
   *             1. It is only ever valid when the mapped page carries exactly
   *                one product line. «نبشی» failed that — its page mixes plain
   *                and لقمه — and the fix was to unmap the family, not to
   *                identify it by size. Verify by parsing the page, not by
   *                reading its title.
   *             2. It does NOT skip the ambiguity gate. Every size-matching
   *                row still has to agree on the price within
   *                `maxCandidateSpreadPct`, so the day ahanonline adds a
   *                second variant to one of these tables — a second ضخامت on
   *                وال پست, a second حالت on تسمه مسی — the rows spread apart
   *                and the family starts SKIPPING instead of guessing. That
   *                automatic degradation is what makes the mode acceptable at
   *                all, and it is why the four families below were checked for
   *                their spread (0.0%–0.4% across every one of them) rather
   *                than merely for having a page.
   *             3. It is for families where NEITHER side publishes a mill. It
   *                is never a way around a mill that is published and
   *                disagrees — that case stays `low-confidence-match`.
   */
  from: 'factory' | 'name' | 'grade' | 'grade-number' | 'size-only';
  /**
   * Require the MILL to agree as well, on top of `from`.
   *
   * The variant families are variant-keyed *instead of* mill-keyed because on
   * their pages the mill does not move the price. لوله مسی is the one where
   * both matter: at a fixed size and ضخامت its three mills sit 12,710,447
   * (بابک) / 11,881,596 (مهر اصل) / 11,082,713 (باهنر) apart, a 15% spread
   * that our own catalogue reproduces almost exactly. Matching on ضخامت alone
   * would pick whichever of the three came first.
   */
  alsoFactory?: boolean;
}

export const IDENTITY: Readonly<Record<string, IdentitySpec>> = {
  'sheet/strip': { columns: ['حالت'], from: 'name' },
  'sheet/steel': { columns: ['آلیاژ'], from: 'name' },
  'rebar/coupler': { columns: ['نوع'], from: 'name' },
  'profile/chaharpahlu': { columns: ['حالت'], from: 'name' },
  'profile/chaharpahlu-alloy': { columns: ['آلیاژ'], from: 'name' },
  // برند is published here, but as «نورد آلومینیوم اراک» against our «اراک» —
  // see the material words added to FACTORY_STOPWORDS.
  'felezat-rangi/aluminum-sheet': { columns: ['برند'], from: 'factory' },
  'felezat-rangi/copper-sheet': { columns: ['برند'], from: 'factory' },
  'pipe/well-casing': { columns: ['برند'], from: 'factory' },
  'sheet/aluzinc': { columns: ['برند'], from: 'factory' },
  'sheet/wear-resistant': { columns: ['برند'], from: 'factory' },
  'sheet/marine': { columns: ['برند'], from: 'factory' },
  // ورق شیروانی: the mill AND the colour both move the price (هفت الماس ۰٫۴۸
  // is 170,000 in آبی and 170,909 in سفید یخچالی), so both must agree.
  'sheet/roofing': { columns: ['برند', 'رنگ'], from: 'name' },

  // The stainless families. Their tables publish the alloy under «آلیاژ»,
  // except میلگرد استیل, whose table emits the ASCII header `standard` for
  // the same thing (ahanonline is inconsistent about which alphabet a header
  // uses — `rowUnit` already carries the same note about `unit`/«واحد»).
  //
  // Note what is NOT here: the mill. Our میلگرد استیل SKUs name a COUNTRY
  // (هند / تایوان / چین) and ahanonline publishes no origin at all, but that
  // is not a gap — every size at a given alloy carries one price on their
  // table regardless of origin, which is the market saying origin does not
  // set the price for imported stainless bar. The alloy does, 2.3× across
  // 304L → 310S.
  'rebar/stainless': { columns: ['standard'], from: 'grade' },
  'steel/pipe': { columns: ['آلیاژ'], from: 'grade' },
  'steel/angle': { columns: ['آلیاژ'], from: 'grade' },
  'steel/channel': { columns: ['آلیاژ'], from: 'grade' },
  'steel/profile': { columns: ['آلیاژ'], from: 'grade' },
  'wire/welding-wire': { columns: ['آلیاژ'], from: 'grade' },
  'wire/wire-rod': { columns: ['آلیاژ'], from: 'grade' },

  // ---- the specialty lines (US-05.3, third pass) --------------------------
  // ساندویچ پانل: سقفی and دیواری are the same ضخامت at different prices
  // (4 سانتی‌متر is 3,832,000 سقفی against 3,709,091 دیواری), and both sides
  // put the word in the product name, so this is the ordinary `name` mode.
  'sheet/sandwich-panel': { columns: [GROUP_COLUMN], from: 'name' },
  // لوله مسی: the wall thickness is the identity, and we hold it in
  // `skus.grade` as «ضخامت ۰.۸۱» against their bare «0.81» — the same fact in
  // two spellings, which is what `grade-number` exists to compare. The other
  // half of this family's identity, 15-متری coil against 6-متری length, is
  // handled as a UNIT rather than as a variant; see `rowUnit`.
  'felezat-rangi/copper-pipe': { columns: ['ضخامت'], from: 'grade-number', alsoFactory: true },

  // The four `size-only` families. Each was parsed on 1405/06/03 and each
  // mapped page carries ONE product with no mill on either side:
  //
  //   وال پست    — 8 rows, all ضخامت 2, one per سایز. Our 8 SKUs are the same
  //                8 sizes, and our stored price sits 4.8% under theirs on
  //                every one of them, i.e. they were seeded from this page.
  //   گریتینگ    — the گالوانیزه CHILD page, 4 rows spanning 200,847–200,848
  //                (0.0005%). The parent is NOT mapped: it interleaves فلزی at
  //                185,455 and استنلس at 954,777 with no column to separate
  //                them, which is `size-only`'s failure case exactly.
  //   تسمه مسی   — 18 rows, every one at 2,520,000 (0.0% spread), matching our
  //                18 SKUs' stored price to the toman. One published price
  //                covers all 18 sections because copper strip is sold by
  //                weight; the section does not move the per-kg number.
  //   کنگره      — 6 rows, 117,273–117,727 (0.4%), the same six sections our
  //                six SKUs carry. Their «برند» heading reads «کنگره 2» — the
  //                THICKNESS, not a mill — which is why the mill rule cannot
  //                be used here even though our SKUs name one.
  'angle-channel/val-post': { columns: [], from: 'size-only' },
  'sheet/grating': { columns: [], from: 'size-only' },
  'felezat-rangi/copper-strip': { columns: [], from: 'size-only' },
  'profile/congress': { columns: [], from: 'size-only' },
};

export function identitySpecFor(sku: MatchableSku): IdentitySpec | undefined {
  return IDENTITY[taxonomyKey(sku)];
}

/**
 * Per-family plausibility bands, Toman.
 *
 * `DEFAULT_MATCH_CONFIG`'s 10,000–500,000 is a *carbon steel per kilogram*
 * band, and it is the right one for the families the mirror started with. It
 * is wrong for everything this survey added: 304L sheet trades at ~640,000
 * and 316L at ~1,109,000 تومان/kg, copper sheet at ~2,480,000, and a کوپلر is
 * priced per عدد at 69,000–1,196,000. Left on the global band, every one of
 * those correct matches would be thrown away as `price-out-of-band`.
 *
 * The band's job is unchanged — catch a wholesale unit change on their side,
 * which is a 10× move — so each of these is still far narrower than 10× around
 * the observed price. Widening one is a deliberate act with a number attached,
 * never a blanket raise of the global maximum.
 */
export const PRICE_BANDS: Readonly<Record<string, { min: number; max: number }>> = {
  'sheet/steel': { min: 200_000, max: 4_000_000 },
  'felezat-rangi/copper-sheet': { min: 800_000, max: 8_000_000 },
  'felezat-rangi/aluminum-sheet': { min: 200_000, max: 2_500_000 },
  'sheet/wear-resistant': { min: 100_000, max: 1_200_000 },
  // Per عدد, not per kg — the size range alone spans 17×, hence the width.
  'rebar/coupler': { min: 20_000, max: 5_000_000 },
  // Stainless, per kg. Observed on their tables 1405/06/01: میلگرد 831,818
  // (304L) → 1,939,090 (310S); لوله 886,806 → 1,854,545; سیم‌جوش 1,354,545 →
  // 2,000,000; the structural lines 840,000 → 909,090. Every one of these sits
  // ABOVE the global 500,000 ceiling, so without a band here each correct
  // match would be discarded as `price-out-of-band`. Each band below is still
  // far narrower than the 10× rial↔toman flip the band exists to catch.
  'rebar/stainless': { min: 300_000, max: 4_000_000 },
  'steel/pipe': { min: 300_000, max: 4_000_000 },
  'steel/angle': { min: 300_000, max: 2_000_000 },
  'steel/channel': { min: 300_000, max: 2_000_000 },
  'steel/profile': { min: 300_000, max: 2_000_000 },
  'wire/welding-wire': { min: 300_000, max: 4_000_000 },
  'wire/wire-rod': { min: 300_000, max: 4_000_000 },

  // ---- the specialty lines (US-05.3, third pass) --------------------------
  // The four families below are priced per شاخه / مترمربع / کلاف / برگ rather
  // than per kilogram, so the global carbon-steel-per-kg band rejects every
  // correct match. Observed on their tables 1405/06/03:
  //   وال پست     113,827 (10*20) → 2,490,260 (20*300) per شاخه — a 22× span
  //               across the sizes we stock, hence the width.
  //   پانل        3,709,091 → 5,665,455 per مترمربع.
  //   لوله مسی    4,351,813 → 19,264,749 per کلاف for the five sizes we carry
  //               (their table reaches 47.9M at 2⅝", which we do not stock).
  //   ورق پانچ    3,438,182 → 5,345,455 per برگ.
  // Each is still far tighter than the 10× rial↔toman flip the band exists to
  // catch, which is the only thing it is for.
  'angle-channel/val-post': { min: 50_000, max: 5_000_000 },
  'sheet/sandwich-panel': { min: 1_000_000, max: 12_000_000 },
  'felezat-rangi/copper-pipe': { min: 1_000_000, max: 60_000_000 },
  'sheet/perforated-black': { min: 1_000_000, max: 12_000_000 },
  // Per kg, but well above the global 500,000 ceiling: copper strip trades at
  // 2,520,000 and گریتینگ گالوانیزه at 200,847 (the latter is inside the
  // global band and is listed only so the pair reads as one decision).
  'felezat-rangi/copper-strip': { min: 800_000, max: 8_000_000 },
  'sheet/grating': { min: 50_000, max: 1_500_000 },
  // قلع‌اندود is per kg at ~327,000 — inside the global band, no override
  // needed — and so are کرکره (~163,000), کنگره (~117,000) and حرارتی
  // (~77,000). They are deliberately absent from this map.
};

/** The band to judge `sku`'s mirrored price against: its family's if it has
 *  one, otherwise the operator-configured global band. */
export function priceBandFor(
  sku: MatchableSku,
  config: Pick<MatchConfig, 'minPriceToman' | 'maxPriceToman'>,
): { min: number; max: number } {
  return (
    PRICE_BANDS[taxonomyKey(sku)] ?? { min: config.minPriceToman, max: config.maxPriceToman }
  );
}

/**
 * Words that appear inside a published variant but never distinguish one
 * variant from another — the `FACTORY_STOPWORDS` idea applied to `IDENTITY`.
 *
 * Kept deliberately tiny, and every entry has to earn its place by being
 * non-discriminating across the WHOLE page it appears on. «خدمات» qualifies:
 * ahanonline's کوپلر table lists seven نوع values and only one of them
 * («خدمات رزوه زنی میلگرد») carries it, so dropping it still leaves «رزوه زنی
 * میلگرد» — which no other نوع contains — to do the identifying. Without this
 * those 10 SKUs skip over a filler noun, and the fix would otherwise be to
 * rename our catalogue to match a competitor's phrasing.
 */
const VARIANT_STOPWORDS = new Set(['خدمات']);

/** The source's published identity for a row under `spec`, or `''` when it
 *  published none — which is never treated as agreement. */
export function rowIdentity(row: AhanonlineRow, spec: IdentitySpec): string {
  const raw = spec.columns
    .map((c) => (c === GROUP_COLUMN ? row.group : (row.cells[c] ?? '')))
    .filter(Boolean)
    .join(' ');
  const value = norm(raw);
  // ahanonline renders "not applicable" as a lone dash in several of these
  // tables; treating it as a value would make every such row look identical.
  return value === '-' || value === '_' ? '' : value;
}

/**
 * Does `sku` carry the same identity this row publishes?
 *
 * `null` means "this row published no identity", which callers must keep
 * distinct from `false` ("it published one and we disagree") — the first is a
 * dead source column, the second is a fixable gap in our catalogue.
 */
export function identityAgrees(
  sku: MatchableSku,
  row: AhanonlineRow,
  spec: IdentitySpec,
): boolean | null {
  // `size-only`: the caller has already established that this row matches on
  // size, and the family has been declared single-product, so there is nothing
  // further to agree about. The ambiguity gate downstream is what keeps this
  // honest — see the mode's comment on `IdentitySpec`.
  if (spec.from === 'size-only') return true;
  const theirs = rowIdentity(row, spec);
  if (!theirs) return null;
  if (spec.from === 'factory') return factoryScore(sku.factory, theirs) >= 0.999;
  if (spec.from === 'grade-number') {
    const ours = nums(sku.grade);
    if (ours.length === 0) return false;
    const t = nums(theirs);
    return t.length === ours.length && t.every((v, i) => Math.abs(v - ours[i]!) < 1e-9);
  }
  if (spec.from === 'grade') {
    const ours = norm(sku.grade);
    // No grade of our own is a MISSING variant, not a disagreement — the
    // caller separates the two, and this one is fixable by filling the column.
    if (!ours) return false;
    return ours === theirs;
  }
  // Every token, not any token: «304» must not satisfy a «304L» row, and a
  // two-word variant like «میانی استاندارد» must match in full.
  const haystack = norm(sku.name);
  const tokens = theirs.split(' ').filter((t) => t.length > 1 && !VARIANT_STOPWORDS.has(t));
  if (tokens.length === 0) return null;
  return tokens.every((t) => haystack.includes(t));
}

/**
 * Does `sku` carry its own value for `spec`'s identity, independent of whether
 * any row agrees with it?
 *
 * Only answerable for `grade`, where our side of the comparison is one column.
 * Under `name` the identity is embedded in free text — «لوله استیل ۲ اینچ»
 * neither states an alloy nor proves it lacks one — and under `factory` the
 * `noFactory` skip already covers the empty case before matching starts.
 */
export function skuCarriesOwnIdentity(sku: MatchableSku, spec: IdentitySpec): boolean {
  if (spec.from === 'grade') return norm(sku.grade) !== '';
  if (spec.from === 'grade-number') return nums(sku.grade).length > 0;
  return false;
}

export function taxonomyKey(sku: MatchableSku): string {
  return `${sku.categorySlug}/${sku.subCategorySlug}`;
}

export function sourcePathsForSku(sku: MatchableSku): readonly string[] | undefined {
  return SOURCE_PATHS[taxonomyKey(sku)];
}

/** Every competitor page in scope for at least one mapped sub-category. */
export function allMappedSourcePaths(): string[] {
  return [...new Set(Object.values(SOURCE_PATHS).flat())];
}

// ---------------------------------------------------------------------------
// Size matching (match.py `size_match`)
// ---------------------------------------------------------------------------

/** Families whose size is an inch figure on both sides. */
const INCH_CATEGORIES = new Set(['pipe']);
/**
 * Families quoted in inches whose CATEGORY is not «لوله».
 *
 * لوله استیل lives under the استیل category (`steel/pipe`), not under لوله, so
 * the category test above misses it and its «۲½ اینچ» would fall through to
 * the generic "first number agrees" rule — where 2½ and 2 are the same
 * product. Keyed on the full taxonomy key for that reason.
 */
const INCH_KEYS = new Set([
  'steel/pipe',
  // لوله مسی is quoted in inches on both sides («۳/۸ اینچ» against «"3/8»),
  // and it lives under فلزات رنگی rather than لوله. Without it the generic
  // "first number agrees" rule reads 1/4 and 1/2 as the same 1 and prices a
  // quarter-inch coil off a half-inch row — a 2.3× error.
  'felezat-rangi/copper-pipe',
]);
/** Families whose size is a `a×b` pair. */
const DIM_KEYS = new Set([
  'profile/box-square',
  'profile/box-rect',
  'profile/frame',
  'profile/profil-sotuni',
  'profile/prvfyl-snaty',
  'profile/profil-mobli',
  'profile/profil-galvanizeh',
  'profile/profil-z',
  // Third pass: both sides quote the two faces, and their table writes the
  // pair in the opposite order to ours («30*20» against «۲۰×۳۰») — which
  // `dimsKey` already sorts away.
  'profile/congress',
  // وال پست is «بال»×«سایز» on our side and a `a*b` سایز cell on theirs
  // («وال پست 2 10*20» against «وال پست ۱۰×۲۰»), matched the same way.
  'angle-channel/val-post',
]);
/** نبشی: ours is the leg in cm («۶» = 60×60), theirs is mm («60*60»). */
const ANGLE_KEYS = new Set(['angle-channel/nabshi']);

/**
 * چهارپهلو: a square bar quoted as its two faces («۲۰×۲۰») on both sides.
 *
 * Listed separately from `DIM_KEYS` so the profile comment there keeps meaning
 * what it says, and because unlike `DIM_KEYS` these do NOT fall back to "first
 * number agrees" — a ۱۲۰×۵۰ and a ۱۲۰×۱۲۰ bar are different products at
 * different prices (86,644 vs 86,752 تومان today) and sharing a first number
 * must not be enough.
 */
const STRICT_DIM_KEYS = new Set([
  'profile/chaharpahlu',
  'profile/chaharpahlu-alloy',
  // نبشی/پروفیل استیل: both sides quote the two faces («۴۰×۴۰» vs «40*40»),
  // and both tables carry sizes that share a first number but are different
  // products (30*20 and 30*30 at 840,175 vs 840,000). Strict, so a shared
  // first number is never enough — same reasoning as چهارپهلو above.
  'steel/angle',
  'steel/profile',
]);

export function sizeMatches(sku: MatchableSku, row: AhanonlineRow): boolean {
  const key = taxonomyKey(sku);
  const ourSize = sku.size ?? '';
  const theirSize = rowSize(row);

  if (SIZELESS_KEYS.has(key)) return true;

  if (INCH_CATEGORIES.has(sku.categorySlug) || INCH_KEYS.has(key)) {
    const a = inchValue(ourSize);
    const b = inchValue(theirSize);
    return a !== null && b !== null && Math.abs(a - b) < 1e-6;
  }

  if (ANGLE_KEYS.has(key)) {
    const on = nums(ourSize);
    const tn = nums(theirSize);
    if (on.length === 0 || tn.length === 0) return false;
    const t = tn[0]! >= 25 ? tn[0]! / 10 : tn[0]!;
    return Math.abs(on[0]! - t) < 1e-9;
  }

  if (STRICT_DIM_KEYS.has(key)) {
    const ok = dimsKey(ourSize);
    const tk = dimsKey(theirSize);
    return ok !== null && tk !== null && ok === tk;
  }

  if (DIM_KEYS.has(key)) {
    const ok = dimsKey(ourSize);
    const tk = dimsKey(theirSize);
    if (ok && tk) return ok === tk;
    const on = nums(ourSize);
    const tn = nums(theirSize);
    return on.length > 0 && tn.length > 0 && on[0] === tn[0];
  }

  const on = nums(ourSize);
  const tn = nums(theirSize);
  if (on.length === 0 || tn.length === 0) return false;
  return Math.abs(on[0]! - tn[0]!) < 1e-9;
}

// ---------------------------------------------------------------------------
// Source-row freshness
// ---------------------------------------------------------------------------

/**
 * Days between a competitor row's published Jalali date and today.
 *
 * Deliberately arithmetic on the Jalali *fields* rather than a real calendar
 * conversion: this only has to answer "is this roughly a week old?", the two
 * dates are always in the same Jalali year in practice, and pulling a
 * conversion library in here would make a pure module depend on one. Returns
 * null when the date is unparseable, which callers treat as "don't know" —
 * never as "stale".
 */
export function jalaliDaysAgo(published: string, todayJalali: [number, number, number]): number | null {
  const m = /^(\d{4})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})$/.exec(norm(published));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const toDays = (yy: number, mm: number, dd: number) =>
    yy * 365 + (mm <= 6 ? (mm - 1) * 31 : 186 + (mm - 7) * 30) + dd;
  return toDays(todayJalali[0], todayJalali[1], todayJalali[2]) - toDays(y, mo, d);
}

// ---------------------------------------------------------------------------
// The decision
// ---------------------------------------------------------------------------

export interface MatchEvidence {
  confidence: MatchConfidence;
  row: AhanonlineRow | null;
  factory: string | null;
  unit: RowUnit | null;
  sourceUpdatedAt: string | null;
  /** How many equally-good candidates backed this decision. */
  candidates: number;
}

export type MatchResult =
  | ({ ok: true; priceToman: number; reason: typeof WRITE_REASON } & MatchEvidence)
  | ({ ok: false; reason: string } & MatchEvidence);

const NO_EVIDENCE: MatchEvidence = {
  confidence: 'none',
  row: null,
  factory: null,
  unit: null,
  sourceUpdatedAt: null,
  candidates: 0,
};

/**
 * Decide whether `rows` confidently price `sku`, and at what.
 *
 * Every `ok: false` carries the reason it bailed, because the audit log has to
 * be able to answer "why didn't this SKU update?" as well as "why did it?".
 */
export function matchSku(
  sku: MatchableSku,
  rows: readonly AhanonlineRow[],
  config: MatchConfig,
  todayJalali: [number, number, number],
): MatchResult {
  const paths = sourcePathsForSku(sku);
  if (!paths) return { ok: false, reason: SKIP_REASONS.noMapping, ...NO_EVIDENCE };

  const identity = identitySpecFor(sku);

  // A non-kg SKU is mirrorable only where the source publishes the SAME unit
  // on the row — کوپلر is «عدد» on both sides, so 65 per-piece SKUs are
  // like-for-like. Everything else still needs `theoretical_weight_kg` to
  // convert, which the audit's §4 showed is unverified seed data, so it stays
  // a skip: converting would manufacture a number rather than measure one.
  // The per-row check is below; this only rejects bases no page prices at all.
  // `branch`, `sqm`, `coil` and `sheet` joined `kg`/`piece` with the specialty
  // pages: وال پست is per شاخه on both sides, ساندویچ پانل per مترمربع, لوله
  // مسی per کلاف, ورق پانچ per برگ. Every one of those is an IDENTITY mapping
  // — the row's own unit still has to equal the SKU's basis on the per-row
  // check below — so this widens WHICH units can be mirrored and never adds a
  // conversion between them.
  const MIRRORABLE_BASES = new Set(['kg', 'piece', 'branch', 'sqm', 'coil', 'sheet']);
  if (!MIRRORABLE_BASES.has(sku.priceBasis)) {
    return { ok: false, reason: SKIP_REASONS.notPerKgSku, ...NO_EVIDENCE };
  }

  if (!identity && !norm(sku.factory)) {
    // Mill-keyed family with no mill of our own: nothing to score against, so
    // every candidate would land as `uncertain` anyway. Named separately so
    // the log says "fix this SKU's factory" instead of "no confident match".
    return { ok: false, reason: SKIP_REASONS.noFactory, ...NO_EVIDENCE };
  }

  const pool = rows.filter((r) => paths.includes(r.sourcePath));
  const sized = pool.filter((r) => sizeMatches(sku, r));
  if (sized.length === 0) return { ok: false, reason: SKIP_REASONS.noSizeMatch, ...NO_EVIDENCE };

  let tied: AhanonlineRow[];
  let confidence: MatchConfidence;
  let identityFailure: string | null = null;

  if (identity) {
    // Variant-keyed family (آلیاژ / نوع / حالت / برند+رنگ). The bar is the same
    // as the mill rule's — an explicit published token has to agree — but the
    // two ways it can fail are reported separately, because one is fixable in
    // our catalogue and the other is not.
    // `alsoFactory` narrows the pool BEFORE the variant test, so a family that
    // needs both gets `low-confidence-match` when the mill is the thing that
    // failed rather than a variant reason that would send the operator to the
    // wrong column.
    const eligible = identity.alsoFactory
      ? sized.filter((r) => factoryScore(sku.factory, rowFactory(r)) >= 0.999)
      : sized;
    if (eligible.length === 0) {
      return { ok: false, reason: SKIP_REASONS.lowConfidence, ...NO_EVIDENCE };
    }
    const verdicts = eligible.map((r) => ({ row: r, agrees: identityAgrees(sku, r, identity) }));
    const agreeing = verdicts.filter((v) => v.agrees === true).map((v) => v.row);
    if (agreeing.length > 0) {
      tied = agreeing;
      confidence = 'exact';
    } else {
      tied = eligible;
      confidence = 'uncertain';
      identityFailure = verdicts.every((v) => v.agrees === null)
        ? SKIP_REASONS.sourceNoVariant
        : // A `grade` family is the one case where we can tell the two
          // remaining failures apart, because our side of the comparison is a
          // single column rather than a whole product name: if it is filled
          // then this is a disagreement about stock, not a hole in our data,
          // and telling the operator to «fill in the alloy» would send them
          // to a field that already has the right value in it.
          skuCarriesOwnIdentity(sku, identity)
          ? SKIP_REASONS.variantNotStocked
          : SKIP_REASONS.missingVariant;
    }
  } else {
    const scored = sized.map((r) => ({ row: r, score: factoryScore(sku.factory, rowFactory(r)) }));
    const best = Math.max(...scored.map((s) => s.score));
    tied = scored.filter((s) => s.score === best).map((s) => s.row);
    confidence = best >= 0.999 ? 'exact' : best >= 0.5 ? 'fuzzy' : 'uncertain';
  }

  const evidence = (row: AhanonlineRow, candidates: number): MatchEvidence => ({
    confidence,
    row,
    factory: (identity ? rowIdentity(row, identity) : rowFactory(row)) || null,
    unit: rowUnit(row),
    sourceUpdatedAt: rowUpdatedAt(row) || null,
    candidates,
  });

  if (identityFailure) {
    return { ok: false, reason: identityFailure, ...evidence(tied[0]!, tied.length) };
  }
  if (confidence !== 'exact') {
    return { ok: false, reason: SKIP_REASONS.lowConfidence, ...evidence(tied[0]!, tied.length) };
  }

  // The row's unit has to be the one our price is denominated in. Same
  // reasoning as `notPerKgSku`: no conversion happens here, ever.
  const perKg = tied.filter((r) => unitMatchesBasis(rowUnit(r), sku.priceBasis));
  if (perKg.length === 0) {
    return { ok: false, reason: SKIP_REASONS.notPerKgSource, ...evidence(tied[0]!, tied.length) };
  }

  // Prefer factory-gate delivery when they publish both — it is the price
  // closest to the mill, the same preference the audit script used.
  const atFactory = perKg.filter((r) => rowDelivery(r).includes('کارخانه'));
  const finalists = atFactory.length > 0 ? atFactory : perKg;

  const prices = finalists.map((r) => r.priceToman).sort((a, b) => a - b);
  const lo = prices[0]!;
  const hi = prices[prices.length - 1]!;
  const spreadPct = lo > 0 ? ((hi - lo) / lo) * 100 : Infinity;
  if (prices.length > 1 && spreadPct > config.maxCandidateSpreadPct) {
    // Several rows are equally good matches but disagree about the price —
    // typically because their table splits a size across thicknesses or
    // grades we cannot see. Picking one would be a coin flip.
    return {
      ok: false,
      reason: SKIP_REASONS.ambiguous,
      ...evidence(finalists[0]!, finalists.length),
    };
  }

  // Median over the tied finalists rather than "the first one", so a single
  // odd row cannot move the price on its own.
  const mid = Math.floor(prices.length / 2);
  const priceToman =
    prices.length % 2 === 1 ? prices[mid]! : Math.round((prices[mid - 1]! + prices[mid]!) / 2);
  const chosen = finalists.find((r) => r.priceToman === priceToman) ?? finalists[0]!;
  const ev = evidence(chosen, finalists.length);

  const band = priceBandFor(sku, config);
  if (priceToman < band.min || priceToman > band.max) {
    return { ok: false, reason: SKIP_REASONS.outOfBand, ...ev };
  }

  if (config.maxSourceAgeDays > 0 && ev.sourceUpdatedAt) {
    const age = jalaliDaysAgo(ev.sourceUpdatedAt, todayJalali);
    if (age !== null && age > config.maxSourceAgeDays) {
      return { ok: false, reason: SKIP_REASONS.sourceStale, ...ev };
    }
  }

  return { ok: true, priceToman, reason: WRITE_REASON, ...ev };
}
