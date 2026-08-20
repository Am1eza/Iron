/**
 * Catalog fill, 2026-08-20: real products for empty sub-categories, plus the
 * two new چهارپهلو sub-categories under پروفیل و قوطی.
 *
 * ## Source
 *
 * `.claude/audits/catalog-gap-fix-2026-08-20/ahanonline_c.json` — 473 rows
 * scraped from 17 ahanonline `/product-category/*` pages on 2026-08-20 by
 * `fetch_c.py` / `fetch_d.py` (kept beside it), parsed with the SAME extractor
 * the 2026-08-19 passes used so the datasets have one shape. robots.txt was
 * re-read at the start of the run: `/PriceList/*` and `*price-list*` remain
 * `Disallow`ed and were not touched; `/product-category/*` is not. ~3.5 s
 * between requests, real browser UA.
 *
 * Every row carries `تاریخ بروزرسانی = 1405/5/29`, i.e. the day of the run.
 * Prices come from `data-price` attributes in the served HTML (rials, ÷10),
 * not from rendered text, so no thousands-separator parsing is involved.
 *
 * VAT: ahanonline's «احتساب ارزش افزوده» checkbox is NOT `checked` in the
 * served markup, so every figure is ex-VAT → `vat_included = false`, matching
 * all 543 rows the 2026-08-19 pass wrote.
 *
 * ## Two paths that did not match the obvious guess
 *
 * Worth recording because a later pass will look for them: ahanonline spells
 * pickled sheet «ورق-اسید-شوئی» (not اسیدشویی) and seamless pipe
 * «لوله-مانسمان» (not مانیسمان). Both were found by scraping the
 * sibling-category links off a page already fetched, after the obvious
 * spellings 404'd.
 *
 * ## چهارپهلو — the taxonomy call
 *
 * چهارپهلو is solid square/rectangular bar stock. ahanonline files it under
 * `/product-category/انواع-ورق/چهارپهلو/`, i.e. under ورق — which is simply
 * wrong for our taxonomy: it is not a flat sheet, it is a solid section. It
 * goes under `profile` (پروفیل و قوطی), which is where the rest of our solid
 * and hollow sections live. Their URL structure is not a signal here.
 *
 * Two sub-categories, not one and not three, following the repo's established
 * pattern of «SKU-level fields carry the variant, not a proliferation of
 * near-duplicate sub-categories»:
 *
 *  - `chaharpahlu` (چهارپهلو) — holds BOTH نرمال and ترانس, with the grade in
 *    `skus.grade`, which the پروفیل price table already renders as «گرید».
 *    ahanonline tables them separately but under one category page with حالت
 *    as a column, and they are the same product at two quality tiers.
 *  - `chaharpahlu-alloy` (چهارپهلو آلیاژی) — its own sub-category, because
 *    ahanonline treats it as a structurally separate line (its own URL, its own
 *    production route: continuous-cast alloy billet, rolled) and its alloy
 *    designation (CK 45) is a different axis, kept in `skus.grade`.
 *
 * Both carry `group_label = 'چهارپهلو'` so they render under one heading in the
 * nav and breadcrumbs without needing a third taxonomy level.
 *
 * A note on the sizes, because the prose on their page disagrees with their own
 * table: the page's description mentions «۵، ۶، ۸، ۹، ۱۰، ۱۲، ۱۴، ۱۶ سانتی‌متر»,
 * but the actual priced listings are in MILLIMETRES and run 16×16 … 120×120.
 * The listings are what got loaded.
 *
 * ## What was deliberately NOT loaded
 *
 *  - **ساندویچ پانل** — 6 real, today-dated rows exist, but every one is priced
 *    per «متر مربع». `PRICE_UNITS` has no square-metre member, and adding one
 *    is a schema decision for Amir (the «عدد» unit added for کوپلر was
 *    explicitly approved; this one has not been). Left empty and reported.
 *  - **تسمه فابریک** (25 rows) — 36,454–38,000 تومان/kg, against 73,636 for
 *    تسمه نوردی and 111,363 for ماشینکاری on the same page, same date, same
 *    product. Half the price of میلگرد for a rolled flat bar is not a market
 *    spread; it fails the 60,000–260,000 T/kg sanity band the 2026-08-19 pass
 *    used. Reported rather than published. نوردی and ماشینکاری are loaded.
 *  - **لوله مانیسمان خارجی — the whole line (42 imported rows).** Every one is
 *    priced per «شاخه», and `current_prices.price` in this codebase is per
 *    KILOGRAM for every unit (`leads.service.priceItems` computes
 *    `unitPrice × weightKg`; `unit` only says what `qty` counts in). Storing a
 *    per-branch figure there is the exact defect this pass found on the 19
 *    تیرآهن rows — see `scripts/fixBranchPricedTirahan.ts`. Converting instead
 *    needs an ASME B36.10M weight per (size, رده), and doing that arithmetic
 *    here reproduces the 2026-08-19 pass's §3b result: the implied per-kg runs
 *    175,369 → 299,529 تومان across neighbouring sizes of the SAME schedule
 *    from the same channel (۱½ اینچ at 299,529 against ۳ اینچ at 175,369). A
 *    1.7x swing inside one product line is not a price curve, so nothing was
 *    published. Left empty and reported.
 *  - **The 14 sub-categories ahanonline genuinely has no products for** — the
 *    7 آلومینیوم and 7 استنلس استیل lines. Both root pages were re-fetched and
 *    still parse to zero priced rows, confirming the 2026-08-19 finding. They
 *    need a different supplier, not another pass over ahanonline.
 *
 * ## Modelling
 *
 *  - `theoretical_weight_kg` is NULL on every row. None of these lines has both
 *    a published section table and a published branch length — see
 *    `CATALOG_WEIGHT_BASIS` in `lib/utils/catalogCompose.ts` for the rule.
 *  - `factory` is ahanonline's brand verbatim, per the 2026-08-19 convention,
 *    EXCEPT where the group tail is not a mill at all («روی اندود» is a zinc
 *    coating, «وارداتی» is an import channel) — those get a null factory and
 *    keep the descriptor in the name, so no price is attributed to a company
 *    that never quoted it.
 *  - Where ahanonline publishes several rows that differ only on an axis that
 *    does not move the price (a sheet width, a coil vs. branch form), one SKU
 *    is written at the MEDIAN, the same rule the 2026-08-19 pass used for لوله
 *    جدار چاه. Where the axis IS the product's identity (تسمه's عرض, which is
 *    how the trade names it) every combination is kept.
 *
 * ## Safety
 *
 *   · dry run by default — pass --apply to write
 *   · one transaction: the sub-categories and every SKU land together or not
 *     at all
 *   · idempotent — an existing slug is skipped, so a re-run is a no-op
 *   · every `current_prices` row gets a matching `price_points` row
 *   · aborts if a price falls outside the per-kg sanity band
 *
 *     ./node_modules/.bin/tsx scripts/fillCatalogGaps.ts
 *     # …review, then re-run with --apply
 */
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { ulid } from 'ulid';
import { toPersianDigits, normalizeDigits } from '../src/lib/utils/format';
import { slugify } from '../src/lib/utils/slugify';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[fill] DATABASE_URL is not set.');
  process.exit(1);
}

const SOURCE = '/opt/ahantime/.claude/audits/catalog-gap-fix-2026-08-20/ahanonline_c.json';
const DELIVERY_TIME = '۲۴ ساعت';
/** The band the 2026-08-19 pass asserted every per-kg write against. */
const KG_BAND: readonly [number, number] = [60_000, 2_600_000];

type Row = Record<string, string | number | undefined> & {
  key: string;
  group: string;
  code: string;
  price_toman: number;
};

const raw: Row[] = JSON.parse(await readFile(SOURCE, 'utf8'));

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

const fa = (s: string | number | undefined): string => toPersianDigits(String(s ?? '').trim());

function median(ns: number[]): number {
  const s = [...ns].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
}

/**
 * ahanonline writes fractional inches several ways on the same site: «1/2 1
 * اینچ» for 1½, «1/4 1 اینچ» for 1¼, and «"3/4» with a stray quote for ¾. Our
 * catalog already stores «۱½ اینچ» / «۳/۴ اینچ» (see the existing لوله SKUs),
 * so normalise into that rather than inventing a third convention.
 */
function inchSize(src: string): string {
  const t = normalizeDigits(src).replace(/"/g, '').trim();
  const mixed = t.match(/^(\d)\/(\d)\s+(\d+)\s*اینچ$/);
  if (mixed) {
    const frac = `${mixed[1]}/${mixed[2]}`;
    const glyph = frac === '1/2' ? '½' : frac === '1/4' ? '¼' : frac === '3/4' ? '¾' : `-${frac}`;
    return `${toPersianDigits(mixed[3]!)}${glyph} اینچ`;
  }
  const bare = t.match(/^(\d)\/(\d)$/);
  if (bare) return `${toPersianDigits(bare[0])} اینچ`;
  const plain = t.match(/^(\d+(?:\.\d+)?)\s*اینچ$/);
  if (plain) return `${toPersianDigits(plain[1]!)} اینچ`;
  const fracInch = t.match(/^(\d)\/(\d)\s*اینچ$/);
  if (fracInch) return `${toPersianDigits(`${fracInch[1]}/${fracInch[2]}`)} اینچ`;
  return fa(t);
}

/** «عرض 55 میلیمتر» / «عرض 30 میلی متر» → «۵۵». */
function widthMm(src: string): string {
  const m = normalizeDigits(src).match(/(\d+(?:\.\d+)?)/);
  return m ? toPersianDigits(m[1]!) : fa(src);
}

/** «20*20» → «۲۰×۲۰», matching every other stored profile size. */
function boxSize(src: string): string {
  return toPersianDigits(normalizeDigits(src).replace(/\s*\*\s*/g, '×'));
}

/**
 * ahanonline's `data-name` attribute, whitespace-collapsed.
 *
 * This is the AUTHORITATIVE brand source where the two disagree. The parser
 * derives `group` from the nearest preceding bold heading, which can be off by
 * one table: on the میلگرد ساده page one row's group reads «مازندران» while its
 * own `data-name` reads «امیرآباد». Lines whose brand can only come from the
 * group heading (اسپیرال, کرکره) were cross-checked row-by-row against
 * `data-name` and agree; میلگرد ساده parses the name instead.
 */
const nameOf = (r: Row): string => String(r.name ?? '').replace(/\s+/g, ' ').trim();

/**
 * «میلگرد ساده 6.5 ابهر کلاف کارخانه» to { brand: 'ابهر', form: 'کلاف' }.
 * The brand is whatever sits between the size and the first form keyword, so a
 * two-word mill («فولاد متین») survives without being enumerated.
 */
function plainRebarParts(r: Row): { brand: string | null; form: string; grade: string | null } {
  const m = nameOf(r).match(
    // No `\b` anywhere: JS word boundaries are ASCII-only, so `\b` after
    // «متری» never matches and the whole expression silently fails on every
    // row (it did, until this comment existed).
    /^میلگرد ساده\s+[\d.]+\s+(.*?)\s*(کلاف|شاخه|\d+\s*تا\s*\d+\s*متر)(.*)$/,
  );
  if (!m) return { brand: null, form: '', grade: null };
  return {
    brand: m[1]!.trim() || null,
    form: m[2]!.trim(),
    grade: /\bA1\b/i.test(m[3] ?? '') ? 'A1' : null,
  };
}

/* ------------------------------------------------------------------ */
/* per-line configuration                                             */
/* ------------------------------------------------------------------ */

type Planned = {
  line: string;
  catSlug: string;
  subSlug: string;
  name: string;
  slug: string;
  size: string | null;
  dimensions: string | null;
  grade: string | null;
  standard: string | null;
  factory: string | null;
  unit: 'kg' | 'branch';
  price: number;
  /** ahanonline product codes that fed this row, for the audit trail. */
  codes: string[];
};

type Line = {
  /** Human label for the report. */
  label: string;
  key: string;
  catSlug: string;
  subSlug: string;
  unit: 'kg' | 'branch';
  /** Rows to ignore, with the reason stated in the header above. */
  skip?: (r: Row) => boolean;
  /** Identity of one SKU. Rows sharing it collapse to one row at the median. */
  identity: (r: Row) => string;
  build: (r: Row, price: number, codes: string[]) => Omit<Planned, 'line' | 'catSlug' | 'subSlug' | 'unit' | 'price' | 'codes'>;
};

/** Group tails that are not a mill and must not become a `factory`. */
const NOT_A_MILL = new Set(['روی اندود', 'وارداتی']);

/** «ورق رنگی فولاد مبارکه» → «فولاد مبارکه» (null when it is not a mill). */
function brandFromGroup(group: string, prefix: string): string | null {
  const tail = group.startsWith(prefix) ? group.slice(prefix.length).trim() : group.trim();
  if (!tail || NOT_A_MILL.has(tail)) return null;
  return tail;
}

function skuSlug(parts: Array<string | number | null | undefined>): string {
  return parts
    .filter(Boolean)
    .map((p) => normalizeDigits(String(p)).replace(/×/g, 'x'))
    .join('-')
    .replace(/[^a-z0-9-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

const LINES: Line[] = [
  /* ---------------- ورق رنگی (refill after the impossible-spec retirement) */
  {
    label: 'ورق رنگی',
    key: 'sheet/colored',
    catSlug: 'sheet',
    subSlug: 'colored',
    unit: 'kg',
    identity: (r) => `${r.group}|${r['c_ضخامت']}|${r['c_رنگ']}`,
    build: (r) => {
      const brand = brandFromGroup(r.group, 'ورق رنگی');
      const colour = String(r['c_رنگ'] ?? '').trim();
      return {
        name: ['ورق رنگی', fa(r['c_ضخامت']), colour, brand].filter(Boolean).join(' '),
        slug: skuSlug(['sheet-colored', r['c_ضخامت'], slugify(colour), brand ? slugify(brand) : null]),
        size: fa(r['c_ضخامت']),
        // عرض is 1250 on every single row, so it differentiates nothing and
        // `dimensions` (which means width×length) would be half-filled.
        dimensions: null,
        grade: colour || null,
        standard: null,
        factory: brand,
      };
    },
  },
  /* ---------------- ورق اسید شوئی */
  {
    label: 'ورق اسیدشویی',
    key: 'sheet/pickled',
    catSlug: 'sheet',
    subSlug: 'pickled',
    unit: 'kg',
    // Their two widths (1000 / 1250) price within 1.4% of each other, so the
    // width is not a price axis — one SKU per thickness at the median.
    identity: (r) => `${r['c_برند']}|${r['c_ضخامت']}`,
    build: (r) => ({
      name: ['ورق اسیدشویی', fa(r['c_ضخامت']), String(r['c_برند'] ?? '').trim()].filter(Boolean).join(' '),
      slug: skuSlug(['sheet-pickled', r['c_ضخامت'], slugify(String(r['c_برند'] ?? ''))]),
      size: fa(r['c_ضخامت']),
      dimensions: null,
      grade: null,
      standard: String(r['c_استاندارد'] ?? '').trim() || null,
      factory: String(r['c_برند'] ?? '').trim() || null,
    }),
  },
  /* ---------------- لوله اسپیرال (refill) */
  {
    label: 'لوله اسپیرال',
    key: 'pipe/spiral',
    catSlug: 'pipe',
    subSlug: 'spiral',
    unit: 'kg',
    identity: (r) => `${r.group}|${r['c_سایز']}|${r['c_ضخامت']}`,
    build: (r) => {
      const brand = brandFromGroup(r.group, 'لوله اسپیرال');
      const size = inchSize(String(r['c_سایز'] ?? ''));
      const th = fa(r['c_ضخامت']);
      return {
        // The wall thickness IS part of a spiral pipe's identity and the price
        // axis here (5/6/8 mm), so it belongs in the name.
        name: ['لوله اسپیرال', size, `ضخامت ${th}`, brand].filter(Boolean).join(' '),
        slug: skuSlug(['pipe-spiral', normalizeDigits(size).replace(/[½¼¾]/g, (c) => ({ '½': '-1-2', '¼': '-1-4', '¾': '-3-4' })[c] ?? c), `t${normalizeDigits(th)}`, brand ? slugify(brand) : null]),
        size,
        dimensions: null,
        // Every spiral row's own name carries «st37 12 متری» — the grade is a
        // real published attribute here, so it goes in the column rather than
        // being dropped.
        grade: 'ST37',
        standard: null,
        factory: brand,
      };
    },
  },
  /* ---------------- میلگرد ساده */
  {
    label: 'میلگرد ساده',
    key: 'rebar/mylgrd-sadh',
    catSlug: 'rebar',
    subSlug: 'mylgrd-sadh',
    unit: 'kg',
    // «2 تا 4 متر» is a short-cut length carrying a premium (متین 10 is 72,090
    // cut against 67,545 as a full 6 m branch) — a different product, not
    // another quote for the same one. Rows whose name will not parse are
    // skipped too, rather than having a brand guessed for them.
    skip: (r) => {
      const p = plainRebarParts(r);
      return !p.brand || /تا/.test(p.form);
    },
    identity: (r) => {
      const p = plainRebarParts(r);
      return `${p.brand}|${r['c_سایز']}|${p.form.startsWith('کلاف') ? 'coil' : 'bar'}`;
    },
    build: (r) => {
      const p = plainRebarParts(r);
      const isCoil = p.form.startsWith('کلاف');
      return {
        // «کلاف» (coil) against «شاخه» is the form the product ships in and the
        // trade names it that way, so it belongs in the display name. It is not
        // a grade — میلگرد ساده's grade is A1, which is.
        name: ['میلگرد ساده', fa(r['c_سایز']), isCoil ? 'کلاف' : null, p.brand]
          .filter(Boolean)
          .join(' '),
        slug: skuSlug(['rebar-plain', r['c_سایز'], isCoil ? 'coil' : null, slugify(p.brand as string)]),
        size: fa(r['c_سایز']),
        dimensions: null,
        grade: p.grade,
        standard: null,
        factory: p.brand,
      };
    },
  },
  /* ---------------- ورق شیروانی */
  {
    label: 'ورق شیروانی',
    key: 'sheet/roofing',
    catSlug: 'sheet',
    subSlug: 'roofing',
    unit: 'kg',
    identity: (r) => `${r.group}|${r['c_ضخامت']}|${r['c_رنگ']}`,
    build: (r) => {
      const brand = brandFromGroup(r.group, 'ورق شیروانی');
      const colour = String(r['c_رنگ'] ?? '').trim();
      return {
        name: ['ورق شیروانی', fa(r['c_ضخامت']), colour, brand].filter(Boolean).join(' '),
        slug: skuSlug(['sheet-roofing', r['c_ضخامت'], slugify(colour), brand ? slugify(brand) : null]),
        size: fa(r['c_ضخامت']),
        dimensions: null,
        grade: colour || null,
        standard: null,
        factory: brand,
      };
    },
  },
  /* ---------------- ورق کرکره */
  {
    label: 'ورق کرکره',
    key: 'sheet/corrugated',
    catSlug: 'sheet',
    subSlug: 'corrugated',
    unit: 'kg',
    // ahanonline's کرکره page carries BOTH «کرکره ای گالوانیزه» and «کرکره ای
    // رنگی» rows, and its شیروانی page carries only the رنگی ones — the same
    // three هفت‌الماس 0.48 rows appear on both, at identical prices. Splitting
    // by coating keeps the two sub-categories from holding duplicates of one
    // product: گالوانیزه to «ورق کرکره», رنگی to «ورق شیروانی». That is also
    // how the trade uses the two words (شیروانی is the coloured roofing
    // profile).
    skip: (r) => !nameOf(r).includes('گالوانیزه'),
    identity: (r) => `${r.group}|${r['c_ضخامت']}`,
    build: (r) => {
      const tail = r.group.startsWith('ورق کرکره') ? r.group.slice('ورق کرکره'.length).trim() : r.group;
      const brand = brandFromGroup(r.group, 'ورق کرکره');
      return {
        // «روی اندود» is a coating, not a mill — it stays in the name and the
        // factory column is left empty rather than crediting a company.
        name: ['ورق کرکره', fa(r['c_ضخامت']), brand ? brand : tail].filter(Boolean).join(' '),
        slug: skuSlug(['sheet-corrugated', r['c_ضخامت'], slugify(tail)]),
        size: fa(r['c_ضخامت']),
        dimensions: null,
        grade: null,
        standard: null,
        factory: brand,
      };
    },
  },
  /* ---------------- ورق استیل */
  {
    label: 'ورق استیل',
    key: 'sheet/steel',
    catSlug: 'sheet',
    subSlug: 'steel',
    unit: 'kg',
    // 188 rows are (alloy × thickness × width × رول/شیت). Schedule and width
    // move the price by ~2%, so one SKU per (alloy, thickness) at the median —
    // the same rule the 2026-08-19 pass used for لوله استیل.
    identity: (r) => `${r['c_آلیاژ']}|${r['c_ضخامت']}`,
    build: (r) => {
      const alloy = String(r['c_آلیاژ'] ?? '').trim();
      return {
        name: ['ورق استیل', fa(r['c_ضخامت']), alloy].filter(Boolean).join(' '),
        slug: skuSlug(['sheet-steel', r['c_ضخامت'], alloy]),
        size: fa(r['c_ضخامت']),
        dimensions: null,
        grade: alloy || null,
        standard: null,
        // Their ورق استیل table publishes an alloy, not a mill.
        factory: null,
      };
    },
  },
  /* ---------------- تسمه */
  {
    label: 'تسمه',
    key: 'sheet/strip',
    catSlug: 'sheet',
    subSlug: 'strip',
    unit: 'kg',
    // See the header: تسمه فابریک's 36–38k/kg fails the sanity band against
    // نوردی's 73,636 and ماشینکاری's 111,363 for the same product on the same
    // page and date.
    skip: (r) => r.group === 'تسمه فابریک',
    // عرض is kept as its own SKU rather than medianed away: «تسمه ۵×۵۰» is how
    // the trade names the product, so the width is its identity, not just a
    // price axis.
    identity: (r) => `${r['c_حالت']}|${r['c_ضخامت']}|${r['c_عرض']}`,
    build: (r) => {
      const form = String(r['c_حالت'] ?? '').trim();
      const w = widthMm(String(r['c_عرض'] ?? ''));
      return {
        name: ['تسمه', form, `${fa(r['c_ضخامت'])}×${w}`].filter(Boolean).join(' '),
        slug: skuSlug(['sheet-strip', slugify(form), r['c_ضخامت'], normalizeDigits(w)]),
        size: fa(r['c_ضخامت']),
        dimensions: w,
        grade: form || null,
        standard: null,
        factory: null,
      };
    },
  },
  /* ---------------- چهارپهلو */
  {
    label: 'چهارپهلو',
    key: 'profile/chaharpahlu',
    catSlug: 'profile',
    subSlug: 'chaharpahlu',
    unit: 'kg',
    identity: (r) => `${r['c_حالت']}|${r['c_سایز']}`,
    build: (r) => {
      const tier = String(r['c_حالت'] ?? '').trim(); // نرمال | ترانس
      const size = boxSize(String(r['c_سایز'] ?? ''));
      return {
        name: ['چهارپهلو', tier, size].filter(Boolean).join(' '),
        slug: skuSlug(['profile-chaharpahlu', slugify(tier), size]),
        size,
        dimensions: null,
        // نرمال / ترانس is the quality tier — the پروفیل table already renders
        // `grade` as «گرید», which is exactly what this is.
        grade: tier || null,
        standard: null,
        // Their چهارپهلو table publishes a delivery point («بنگاه تهران»), not
        // a mill.
        factory: null,
      };
    },
  },
  /* ---------------- چهارپهلو آلیاژی */
  {
    label: 'چهارپهلو آلیاژی',
    key: 'profile/chaharpahlu-alloy',
    catSlug: 'profile',
    subSlug: 'chaharpahlu-alloy',
    unit: 'kg',
    identity: (r) => `${r['c_آلیاژ']}|${r['c_حالت']}|${r['c_سایز']}`,
    build: (r) => {
      const alloy = String(r['c_آلیاژ'] ?? '').trim(); // CK 45
      const size = boxSize(String(r['c_سایز'] ?? ''));
      return {
        name: ['چهارپهلو آلیاژی', size, alloy].filter(Boolean).join(' '),
        slug: skuSlug(['profile-chaharpahlu-alloy', size, alloy]),
        size,
        dimensions: null,
        grade: alloy || null,
        standard: null,
        factory: null,
      };
    },
  },
];

/** Sub-categories this script has to create before it can fill them. */
const NEW_SUBS = [
  {
    catSlug: 'profile',
    slug: 'chaharpahlu',
    name: 'چهارپهلو',
    groupLabel: 'چهارپهلو',
    order: 90,
  },
  {
    catSlug: 'profile',
    slug: 'chaharpahlu-alloy',
    name: 'چهارپهلو آلیاژی',
    groupLabel: 'چهارپهلو',
    order: 91,
  },
];

/* ------------------------------------------------------------------ */
/* plan                                                               */
/* ------------------------------------------------------------------ */

const pool = new pg.Pool({ connectionString: url, max: 1 });

const { rows: cats } = await pool.query<{ id: string; slug: string }>(
  `SELECT id, slug FROM categories`,
);
const catBySlug = new Map(cats.map((c) => [c.slug, c.id]));
const { rows: subs } = await pool.query<{ id: string; cat: string; slug: string }>(
  `SELECT sc.id, c.slug AS cat, sc.slug FROM sub_categories sc JOIN categories c ON c.id = sc.category_id`,
);
const subById = new Map(subs.map((s) => [`${s.cat}/${s.slug}`, s.id]));
const { rows: existing } = await pool.query<{ slug: string }>(`SELECT slug FROM skus`);
const haveSlug = new Set(existing.map((r) => r.slug));

const planned: Planned[] = [];
const skippedExisting: string[] = [];
const report: Array<{ line: string; sourceRows: number; skipped: number; created: number; band: [number, number] }> = [];

for (const line of LINES) {
  const all = raw.filter((r) => r.key === line.key);
  const kept = line.skip ? all.filter((r) => !line.skip!(r)) : all;
  const groups = new Map<string, Row[]>();
  for (const r of kept) {
    const id = line.identity(r);
    groups.set(id, [...(groups.get(id) ?? []), r]);
  }
  let created = 0;
  const prices: number[] = [];
  for (const rows of groups.values()) {
    const price = median(rows.map((r) => r.price_toman));
    const built = line.build(rows[0]!, price, rows.map((r) => r.code));
    if (haveSlug.has(built.slug)) {
      skippedExisting.push(built.slug);
      continue;
    }
    haveSlug.add(built.slug);
    planned.push({
      ...built,
      line: line.label,
      catSlug: line.catSlug,
      subSlug: line.subSlug,
      unit: line.unit,
      price,
      codes: rows.map((r) => r.code).filter(Boolean),
    });
    prices.push(price);
    created++;
  }
  report.push({
    line: line.label,
    sourceRows: all.length,
    skipped: all.length - kept.length,
    created,
    band: prices.length ? [Math.min(...prices), Math.max(...prices)] : [0, 0],
  });
}

/* --- sanity gates -------------------------------------------------- */
const outOfBand = planned.filter(
  (p) => p.unit === 'kg' && (p.price < KG_BAND[0] || p.price > KG_BAND[1]),
);
if (outOfBand.length) {
  console.error(`[fill] ABORT — ${outOfBand.length} per-kg price(s) outside ${KG_BAND[0]}–${KG_BAND[1]}:`);
  for (const p of outOfBand) console.error(`   ${p.slug} ${p.price}`);
  process.exit(1);
}
const dupSlugs = planned.map((p) => p.slug).filter((s, i, a) => a.indexOf(s) !== i);
if (dupSlugs.length) {
  console.error(`[fill] ABORT — duplicate slug(s) generated: ${[...new Set(dupSlugs)].join(', ')}`);
  process.exit(1);
}
const badSlug = planned.filter((p) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug));
if (badSlug.length) {
  console.error(`[fill] ABORT — slug(s) the server schema would reject: ${badSlug.map((p) => p.slug).join(', ')}`);
  process.exit(1);
}
for (const s of NEW_SUBS) {
  if (!catBySlug.has(s.catSlug)) {
    console.error(`[fill] ABORT — category «${s.catSlug}» not found for new sub «${s.slug}».`);
    process.exit(1);
  }
}
const missingSub = [...new Set(planned.map((p) => `${p.catSlug}/${p.subSlug}`))].filter(
  (k) => !subById.has(k) && !NEW_SUBS.some((s) => `${s.catSlug}/${s.slug}` === k),
);
if (missingSub.length) {
  console.error(`[fill] ABORT — sub-category not found and not being created: ${missingSub.join(', ')}`);
  process.exit(1);
}

/* --- report -------------------------------------------------------- */
const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));

console.log(`[fill] sub-categories to create: ${NEW_SUBS.length}`);
for (const s of NEW_SUBS) {
  const exists = subById.has(`${s.catSlug}/${s.slug}`);
  console.log(`   ${pad(`${s.catSlug}/${s.slug}`, 34)} ${pad(s.name, 20)} group=${s.groupLabel}  ${exists ? '(already exists)' : ''}`);
}

console.log(`\n[fill] ${planned.length} sku(s) to create, ${skippedExisting.length} already present.\n`);
console.log(`${pad('line', 24)} ${pad('src', 5)} ${pad('skip', 5)} ${pad('new', 5)} price band (تومان)`);
for (const r of report) {
  console.log(
    `${pad(r.line, 24)} ${pad(String(r.sourceRows), 5)} ${pad(String(r.skipped), 5)} ${pad(String(r.created), 5)} ${r.band[0].toLocaleString()} – ${r.band[1].toLocaleString()}`,
  );
}

console.log('\n--- every planned row ---');
for (const p of planned) {
  console.log(
    `  ${pad(p.subSlug, 22)} ${pad(p.slug, 42)} ${pad(p.name, 40)} ${pad(p.size ?? '', 12)} ${pad(p.grade ?? '', 14)} ${pad(p.factory ?? '-', 16)} ${pad(p.unit, 7)} ${String(p.price).padStart(10)}`,
  );
}

if (!APPLY) {
  console.log('\n[fill] DRY RUN — nothing written. Re-run with --apply.');
  await pool.end();
  process.exit(0);
}

/* --- apply --------------------------------------------------------- */
const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const s of NEW_SUBS) {
    const key = `${s.catSlug}/${s.slug}`;
    if (subById.has(key)) continue;
    const id = ulid();
    await client.query(
      `INSERT INTO sub_categories (id, category_id, slug, name, group_label, "order", is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)`,
      [id, catBySlug.get(s.catSlug), s.slug, s.name, s.groupLabel, s.order],
    );
    subById.set(key, id);
  }
  for (const p of planned) {
    const subId = subById.get(`${p.catSlug}/${p.subSlug}`)!;
    const id = ulid();
    await client.query(
      `INSERT INTO skus (id, sub_category_id, category_id, slug, name, size, dimensions, grade,
                         standard, factory, theoretical_weight_kg, unit, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, $11, true, now(), now())`,
      [
        id,
        subId,
        catBySlug.get(p.catSlug),
        p.slug,
        p.name,
        p.size,
        p.dimensions,
        p.grade,
        p.standard,
        p.factory,
        p.unit,
      ],
    );
    await client.query(
      `INSERT INTO current_prices (sku_id, price, unit, delivery_time, vat_included,
                                   movement_pct, movement_dir, updated_at, updated_by, is_stale)
       VALUES ($1, $2, $3, $4, false, NULL, 'flat', now(), NULL, false)`,
      [id, p.price, p.unit, DELIVERY_TIME],
    );
    await client.query(
      `INSERT INTO price_points (id, sku_id, price, unit, at) VALUES ($1, $2, $3, $4, now())`,
      [ulid(), id, p.price, p.unit],
    );
  }
  await client.query('COMMIT');
  console.log(`\n[fill] APPLIED — ${NEW_SUBS.length} sub-category slot(s) ensured, ${planned.length} sku(s) + prices + history points.`);
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
  await pool.end();
}
