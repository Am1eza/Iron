/**
 * ahanonline.com — the competitor price source behind the automated mirror
 * (US-02.5). Fetches their public `/product-category/…` pages and parses the
 * priced rows out of them.
 *
 * This is a TypeScript port of the throwaway Python that produced
 * `.claude/audits/ahanonline-price-comparison-2026-08-19/` (scripts/fetch.py
 * and scripts/parse.py). The page list, the `data-price` / `data-name` /
 * `data-code` attribute extraction and the "nearest preceding bold heading is
 * the brand" rule all come from there and are unchanged — that run parsed
 * 1,541 rows off 32 pages and its per-category medians were checked against
 * two other sources, so it is known-good ground truth rather than a guess.
 *
 * What is NEW here, because that run only produced a report and this one
 * writes live prices:
 *
 * 1. `data-price` is in RIAL while the visible «قیمت (تومان)» cell is in
 *    TOMAN, rounded down to the nearest 10. Nothing on the page says so. The
 *    old script just divided by ten and moved on; here every row must satisfy
 *    BOTH readings within a tolerance or it is dropped. If they ever change
 *    `data-price` to Toman, this catches it as a disagreement instead of
 *    quietly writing every price on the site at one tenth of its value.
 * 2. Their own «تاریخ بروزرسانی» per row is captured, so the mirror can
 *    decline to copy a price the competitor themselves stopped maintaining.
 *
 * Politeness/robots: only `/product-category/*` is touched. `/PriceList/*`
 * and `*price-list*` are `Disallow`ed in their robots.txt and are NOT
 * requested — same boundary the audit respected. Requests are sequential
 * with a delay between them.
 */

/** One priced row parsed off a category page. */
export interface AhanonlineRow {
  /** The category page path this came from, e.g. `نبشی-و-ناودانی/نبشی`. */
  sourcePath: string;
  /** Bold heading above the table — usually the mill, sometimes a thickness
   *  class. `factory()` in the matcher decides which. */
  group: string;
  /** `data-name` — their full product title. */
  name: string;
  /** `data-code` — their product code, stable enough to cite in an audit row. */
  code: string;
  /** Toman per whatever `unit` says. Cross-validated (see file header). */
  priceToman: number;
  /** Raw `data-price`, in rial, kept for forensics. */
  priceRial: number;
  /** Cell values keyed by their column header («سایز», «واحد», …). */
  cells: Record<string, string>;
}

export interface AhanonlineTarget {
  /** Our category slug-ish label, only used for logging/coarse fallback. */
  ourCategory: string;
  /** Path under /product-category/. */
  path: string;
}

/**
 * The 32 category pages the audit covered — every page that carries a product
 * line we sell. Ordered by our category so a partial fetch degrades
 * predictably rather than at random.
 */
export const AHANONLINE_TARGETS: readonly AhanonlineTarget[] = [
  { ourCategory: 'میلگرد', path: 'میلگرد/قیمت-میلگرد' },
  { ourCategory: 'میلگرد', path: 'میلگرد/میلگرد-ساده' },
  { ourCategory: 'کلاف و مفتول', path: 'میلگرد/قیمت-میلگرد/میلگرد-کلاف' },
  { ourCategory: 'کلاف و مفتول', path: 'محصولات-مفتولی/سیم-مفتول' },
  { ourCategory: 'کلاف و مفتول', path: 'محصولات-مفتولی/سیم-آرماتور' },
  { ourCategory: 'کلاف و مفتول', path: 'محصولات-مفتولی/مش' },
  { ourCategory: 'کلاف و مفتول', path: 'محصولات-مفتولی/توری' },
  { ourCategory: 'تیرآهن', path: 'تیرآهن-و-هاش/تیرآهن' },
  { ourCategory: 'تیرآهن', path: 'تیرآهن-و-هاش/هاش' },
  { ourCategory: 'نبشی و ناودانی', path: 'نبشی-و-ناودانی/نبشی' },
  { ourCategory: 'نبشی و ناودانی', path: 'نبشی-و-ناودانی/ناودانی' },
  { ourCategory: 'نبشی و ناودانی', path: 'نبشی-و-ناودانی/سپری' },
  { ourCategory: 'ورق', path: 'انواع-ورق/ورق-سیاه' },
  { ourCategory: 'ورق', path: 'انواع-ورق/ورق-گالوانیزه' },
  { ourCategory: 'ورق', path: 'انواع-ورق/ورق-رنگی' },
  { ourCategory: 'ورق', path: 'انواع-ورق/ورق-روغنی' },
  { ourCategory: 'ورق', path: 'انواع-ورق/ورق-آجدار' },
  { ourCategory: 'ورق', path: 'انواع-ورق/ورق-اسید-شوئی' },
  { ourCategory: 'ورق', path: 'انواع-ورق/عرشه-فولادی-گالوانیزه' },
  { ourCategory: 'ورق', path: 'انواع-ورق/ورق-st52' },
  { ourCategory: 'پروفیل و قوطی', path: 'انواع-پروفیل/پروفیل' },
  { ourCategory: 'پروفیل و قوطی', path: 'انواع-پروفیل/پروفیل-صنعتی' },
  { ourCategory: 'پروفیل و قوطی', path: 'انواع-پروفیل/پروفیل-مبلی' },
  { ourCategory: 'پروفیل و قوطی', path: 'انواع-پروفیل/پروفیل-گالوانیزه' },
  { ourCategory: 'پروفیل و قوطی', path: 'انواع-پروفیل/پروفیلz' },
  { ourCategory: 'لوله', path: 'انواع-لوله/لوله-آهنی-سیاه' },
  { ourCategory: 'لوله', path: 'انواع-لوله/لوله-اسپیرال' },
  { ourCategory: 'لوله', path: 'انواع-لوله/لوله-داربستی' },
  { ourCategory: 'لوله', path: 'انواع-لوله/لوله-درز-مستقیم' },
  { ourCategory: 'لوله', path: 'انواع-لوله/لوله-مانسمان' },
  { ourCategory: 'لوله', path: 'انواع-لوله/لوله-گالوانیزه' },
  { ourCategory: 'لوله', path: 'انواع-لوله/لوله-گوشتدار' },

  // ---- added by the multi-source survey (US-05.3) -------------------------
  // ahanonline publishes 352 `/product-category/` pages; the 32 above were the
  // ones the 1405/05/19 audit happened to cover, and everything the mirror
  // could never price — تسمه, کوپلر, stainless, non-ferrous — turned out to be
  // sitting on pages nobody had pointed it at. Each of these was fetched and
  // parsed with `parseAhanonlinePage` before being listed; the row counts are
  // in `docs/price-sync-source-survey.md`. Pages that resolve but publish no
  // priced rows are excluded there and here.
  { ourCategory: 'ورق', path: 'انواع-ورق/تسمه' },
  { ourCategory: 'ورق', path: 'انواع-ورق/ورق-استیل' },
  { ourCategory: 'ورق', path: 'انواع-ورق/ورق-شیروانی' },
  { ourCategory: 'ورق', path: 'انواع-ورق/آلوزینک' },
  { ourCategory: 'ورق', path: 'انواع-ورق/ورق-ضد-سایش' },
  { ourCategory: 'ورق', path: 'انواع-ورق/ورق-دریایی' },
  { ourCategory: 'ورق', path: 'انواع-ورق/چهارپهلو' },
  { ourCategory: 'ورق', path: 'انواع-ورق/چهارپهلو-آلیاژی' },
  { ourCategory: 'میلگرد', path: 'میلگرد/کوپلر' },
  { ourCategory: 'لوله', path: 'انواع-لوله/لوله-جدار-چاه' },
  { ourCategory: 'فلزات رنگی', path: 'انواع-ورق/ورق-آلومینیوم' },
  { ourCategory: 'فلزات رنگی', path: 'انواع-ورق/ورق-مسی' },
] as const;

const BASE = 'https://ahanonline.com/product-category/';
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** Their visible price cell is floored to the nearest 10 Toman while
 *  `data-price` is exact rial, so the two legitimately differ by up to 9.
 *  Anything past this is a unit change or a parse break, not rounding. */
const PRICE_AGREEMENT_TOLERANCE_TOMAN = 12;

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

function unescapeHtml(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)));
}

/** Strip tags, unescape, collapse whitespace — the `txt()` of the audit script. */
function txt(s: string): string {
  return unescapeHtml(s.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Digits out of a rendered price cell («۷۵٬۴۱۰» / «75,410 تومان»). */
function cellToman(s: string): number | null {
  const ascii = s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  const digits = ascii.replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Parse one category page into priced rows.
 *
 * Exported (and pure) so the matcher's tests can feed it a saved fixture —
 * the fetch half needs the network, this half must not.
 */
export function parseAhanonlinePage(html: string, sourcePath: string): AhanonlineRow[] {
  const out: AhanonlineRow[] = [];
  const tableRe = /<table[\s\S]*?<\/table>/g;
  let tm: RegExpExecArray | null;
  while ((tm = tableRe.exec(html)) !== null) {
    const table = tm[0];
    const headers = [...table.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => txt(m[1]!));
    if (headers.length === 0) continue;

    // The brand is the last bold heading before this table. Falling back to a
    // plain <h1..h4> matches the audit script; the trailing «آخرین بروزرسانی…»
    // some headings carry is trimmed off the same way.
    const pre = html.slice(Math.max(0, tm.index - 4000), tm.index);
    const bold = [...pre.matchAll(/font-Bold text-\[18px\][^>]*>([\s\S]*?)<\/div>/g)];
    let group = bold.length > 0 ? txt(bold[bold.length - 1]![1]!) : '';
    if (!group) {
      const heads = [...pre.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/g)];
      group = heads.length > 0 ? txt(heads[heads.length - 1]![1]!) : '';
    }
    group = group.replace(/آخرین بروزرسانی[\s\S]*$/, '').trim();

    for (const rm of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const row = rm[1]!;
      if (row.includes('<th')) continue;
      const priceAttr = /data-price="(\d+)"/.exec(row);
      if (!priceAttr) continue;
      const priceRial = Number(priceAttr[1]);
      if (!Number.isFinite(priceRial) || priceRial <= 0) continue;

      const cellValues = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => txt(m[1]!));
      const cells: Record<string, string> = {};
      headers.forEach((h, i) => {
        if (i < cellValues.length) cells[h] = cellValues[i]!;
      });

      // The cross-check that makes this safe to write from — see file header.
      const derivedToman = Math.round(priceRial / 10);
      const shownKey = Object.keys(cells).find((k) => k.includes('قیمت'));
      const shown = shownKey ? cellToman(cells[shownKey]!) : null;
      if (shown !== null && Math.abs(shown - derivedToman) > PRICE_AGREEMENT_TOLERANCE_TOMAN) {
        continue; // rial/toman disagreement — drop rather than guess
      }

      const nameAttr = /data-name="([^"]*)"/.exec(row);
      const codeAttr = /data-code="([^"]*)"/.exec(row);
      out.push({
        sourcePath,
        group,
        name: nameAttr ? unescapeHtml(nameAttr[1]!).replace(/\s+/g, ' ').trim() : '',
        code: codeAttr ? codeAttr[1]! : '',
        priceToman: derivedToman,
        priceRial,
        cells,
      });
    }
  }
  return out;
}

export interface FetchOptions {
  /** Delay between page requests, ms. Matches the audit's ~3.5s. */
  delayMs?: number;
  /** Per-request timeout, ms. */
  timeoutMs?: number;
  /** Restrict to these paths (used by the category-scope setting). */
  paths?: readonly string[];
  /** Injected in tests so nothing here touches the network. */
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
}

export interface FetchResult {
  rows: AhanonlineRow[];
  /** Paths that could not be fetched or parsed, with the reason. */
  failures: Array<{ path: string; error: string }>;
  pagesFetched: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Fetch every in-scope category page and parse it. Never throws for a single
 * bad page — a page that 500s or comes back empty is reported in `failures`
 * and the run continues on what it did get, because a partial mirror is
 * strictly better than none and the audit log records exactly which SKUs were
 * therefore left alone.
 */
export async function fetchAhanonlinePrices(opts: FetchOptions = {}): Promise<FetchResult> {
  const {
    delayMs = 3500,
    timeoutMs = 60_000,
    paths,
    fetchImpl = fetch,
    sleepImpl = defaultSleep,
  } = opts;
  const targets = paths
    ? AHANONLINE_TARGETS.filter((t) => paths.includes(t.path))
    : AHANONLINE_TARGETS;

  const rows: AhanonlineRow[] = [];
  const failures: FetchResult['failures'] = [];
  let pagesFetched = 0;

  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i]!;
    if (i > 0) await sleepImpl(delayMs);
    const url = BASE + encodeURIComponent(target.path).replace(/%2F/g, '/') + '/';
    try {
      const res = await fetchImpl(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'fa-IR,fa;q=0.9' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        failures.push({ path: target.path, error: `HTTP ${res.status}` });
        continue;
      }
      const body = await res.text();
      // A "success" that is really a block page or an empty shell would
      // otherwise look like "this category has no products" and silently
      // leave every SKU in it unmatched.
      if (body.length < 5000) {
        failures.push({ path: target.path, error: `body too short (${body.length} bytes)` });
        continue;
      }
      const parsed = parseAhanonlinePage(body, target.path);
      if (parsed.length === 0) {
        failures.push({ path: target.path, error: 'no priced rows parsed' });
        continue;
      }
      pagesFetched += 1;
      rows.push(...parsed);
    } catch (err) {
      failures.push({ path: target.path, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { rows, failures, pagesFetched };
}
