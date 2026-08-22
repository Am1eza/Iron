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
  /** What the SKU's price is denominated in. Only `kg` can be mirrored. */
  priceBasis: string;
}

export interface MatchConfig {
  /** Plausibility band for a per-kg steel price, Toman. Guards against a
   *  wholesale unit change on their side (rial↔toman is a 10× move). */
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
    .replace(/ـ/g, '');
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
    'فولاد صنایع شرکت مجتمع گروه نورد کارخانه بنگاه آهن ساده آجدار صنعتی گالوانیزه رنگی روغنی سیاه'
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
];

export function rowFactory(row: AhanonlineRow): string {
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

export type RowUnit = 'kg' | 'branch' | 'sheet' | 'meter' | '';

export function rowUnit(row: AhanonlineRow): RowUnit {
  const u = norm(cell(row, 'واحد'));
  if (u.includes('شاخه')) return 'branch';
  if (u.includes('کیلو')) return 'kg';
  if (u.includes('برگ')) return 'sheet';
  if (u.includes('متر') && !u.includes('متری')) return 'meter';
  return '';
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
]);

export function rowSize(row: AhanonlineRow): string {
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
};

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
]);
/** نبشی: ours is the leg in cm («۶» = 60×60), theirs is mm («60*60»). */
const ANGLE_KEYS = new Set(['angle-channel/nabshi']);

export function sizeMatches(sku: MatchableSku, row: AhanonlineRow): boolean {
  const key = taxonomyKey(sku);
  const ourSize = sku.size ?? '';
  const theirSize = rowSize(row);

  if (INCH_CATEGORIES.has(sku.categorySlug)) {
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
  if (sku.priceBasis !== 'kg') {
    // A per-شاخه or per-برگ SKU could only be mirrored by multiplying through
    // `theoretical_weight_kg`, which the audit's §4 showed is unverified seed
    // data — converting would manufacture a number rather than measure one.
    return { ok: false, reason: SKIP_REASONS.notPerKgSku, ...NO_EVIDENCE };
  }
  const paths = sourcePathsForSku(sku);
  if (!paths) return { ok: false, reason: SKIP_REASONS.noMapping, ...NO_EVIDENCE };
  if (!norm(sku.factory)) {
    // With no mill of our own there is nothing to score against, so every
    // candidate would land as `uncertain` anyway. Named separately so the log
    // says "fix this SKU's factory" instead of "no confident match".
    return { ok: false, reason: SKIP_REASONS.noFactory, ...NO_EVIDENCE };
  }

  const pool = rows.filter((r) => paths.includes(r.sourcePath));
  const sized = pool.filter((r) => sizeMatches(sku, r));
  if (sized.length === 0) return { ok: false, reason: SKIP_REASONS.noSizeMatch, ...NO_EVIDENCE };

  const scored = sized.map((r) => ({ row: r, score: factoryScore(sku.factory, rowFactory(r)) }));
  const best = Math.max(...scored.map((s) => s.score));
  const tied = scored.filter((s) => s.score === best).map((s) => s.row);
  const confidence: MatchConfidence = best >= 0.999 ? 'exact' : best >= 0.5 ? 'fuzzy' : 'uncertain';

  const evidence = (row: AhanonlineRow, candidates: number): MatchEvidence => ({
    confidence,
    row,
    factory: rowFactory(row) || null,
    unit: rowUnit(row),
    sourceUpdatedAt: rowUpdatedAt(row) || null,
    candidates,
  });

  if (confidence !== 'exact') {
    return { ok: false, reason: SKIP_REASONS.lowConfidence, ...evidence(tied[0]!, tied.length) };
  }

  // Only per-kg rows are like-for-like against a per-kg SKU. Their per-شاخه
  // rows are not converted here for the same reason `notPerKgSku` exists.
  const perKg = tied.filter((r) => {
    const u = rowUnit(r);
    return u === 'kg' || u === '';
  });
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

  if (priceToman < config.minPriceToman || priceToman > config.maxPriceToman) {
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
