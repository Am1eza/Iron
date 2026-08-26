/**
 * markazeahan.com — the mirror's SECOND price source (US-05.3), and the only
 * one that closes anything ahanonline cannot.
 *
 * Why a second source at all, when the survey's whole finding was that one was
 * enough: ahanonline sells aluminium and copper SHEET, and its
 * `آلومینیوم/میلگرد-آلومینیوم`, `آلومینیوم/لوله-آلومینیوم`,
 * `آلومینیوم/نبشی-آلومینیوم`, `آلومینیوم/سپری-آلومینیوم` and
 * `انواع-پروفیل/پروفیل-آلومینیوم` pages are SEO shells — they resolve, they
 * rank, and they parse to zero priced rows. Re-checked 1405/06/03. That is the
 * whole reason our 89 aluminium-extrusion SKUs have never had an automated
 * price, and no amount of further work on the ahanonline mirror reaches them.
 *
 * markazeahan does publish them, on `/product-category/` pages of the same
 * shape, and the corroboration is as strong as it gets: our stored price for
 * every one of these lines equals the number on their page today, to the
 * toman —
 *
 *     لوله آلومینیوم    13 SKUs   ours 640,000   theirs 640,000
 *     نبشی آلومینیوم     7 SKUs   ours 630,000   theirs 630,000
 *     ناودانی آلومینیوم  8 SKUs   ours 630,000   theirs 630,000
 *     پروفیل آلومینیوم   4 SKUs   ours 650,000   theirs 650,000
 *
 * — because the catalogue was hand-seeded from these pages and has not been
 * refreshed since. Each line carries ONE per-kg price across every size, which
 * is how aluminium extrusion is actually sold here (ingot price plus a
 * conversion charge), and it is why these families are `size-only` on the
 * matcher's side.
 *
 * NOT mapped, and this is the important negative: `aluminum-rebar`. It carries
 * the same flat 620,000 our 57 میلگرد آلومینیوم SKUs hold, but its own «به روز
 * رسانی» reads **1405/02/12** — about 110 days ago — and 30 of its 40 rows say
 * «تماس بگیرید». The agreement with our price is two stale numbers agreeing,
 * not a live quote. ahanyekta's equivalent page is staler still (1404/03/07).
 * The freshness gate would refuse every row anyway; it is left unmapped so the
 * job does not fetch a page twice a day to throw it away. Those 57 SKUs are
 * reported as unpriceable rather than given a number nobody stands behind.
 *
 * TWO DIFFERENCES FROM THE ahanonline PARSER, both of which cost a safety net:
 *
 * 1. **There is no `data-price`.** ahanonline publishes the price twice, in
 *    rial as an attribute and in toman as text, and `parseAhanonlinePage`
 *    refuses any row where the two disagree — which is what would catch them
 *    switching units. markazeahan publishes it once. `PRICE_BANDS` is
 *    therefore the ONLY thing standing between a units change on their side
 *    and a 10× write, so every family fed from here MUST have a band, and it
 *    must be tight. See the bands for `felezat-rangi/aluminum-*`.
 * 2. **The freshness date is per PAGE, not per row.** It is stamped onto every
 *    row's «تاریخ بروزرسانی» cell here, so `rowUpdatedAt` and the existing
 *    `maxSourceAgeDays` gate work on these rows unchanged — and so a page they
 *    stop maintaining stops being copied, which is exactly what makes leaving
 *    `aluminum-rebar` out a policy rather than a special case.
 *
 * Politeness/robots: their robots.txt disallows `/api/`, `/rest/`, `/shop/`,
 * `/category/`, `/productbox/` and every `*?*` query URL. `/product-category/`
 * is not disallowed and is the only thing requested here. Requests are
 * sequential with the same delay the ahanonline fetcher uses.
 */
import type { AhanonlineRow } from './ahanonline';

/**
 * A parsed source row.
 *
 * Structurally identical to `AhanonlineRow` and deliberately the same type:
 * the matcher reasons about rows, not about who published them, and `SOURCE_PATHS`
 * already keys every rule on the path. Aliased rather than duplicated so the
 * two sources cannot drift apart, and named for what the shape now is.
 */
export type SourceRow = AhanonlineRow;

export interface MarkazeahanTarget {
  /** Our category label — logging only. */
  ourCategory: string;
  /** Slug under /product-category/. */
  slug: string;
}

/**
 * The four aluminium-extrusion pages, and only those.
 *
 * This source exists to reach what ahanonline does not publish. Adding one of
 * their ferrous pages here would mean a second opinion on a price the mirror
 * already gets exactly, plus a precedence rule to decide between them, plus a
 * new way for the two to disagree — for zero additional SKUs. Every page below
 * was fetched and parsed on 1405/06/03 before being listed; row counts and the
 * matching stored prices are in `docs/price-sync-source-survey.md`.
 */
export const MARKAZEAHAN_TARGETS: readonly MarkazeahanTarget[] = [
  { ourCategory: 'فلزات رنگی', slug: 'aluminium-pipe' },
  { ourCategory: 'فلزات رنگی', slug: 'aluminum-studs' },
  { ourCategory: 'فلزات رنگی', slug: 'aluminum-channel-beam' },
  { ourCategory: 'فلزات رنگی', slug: 'پروفیل-آلومینیم' },
];

/** `markazeahan/<slug>`, the value that lands in `sourcePath` and in
 *  `SOURCE_PATHS`. Prefixed so a rule can never be ambiguous about which site
 *  it is talking about — ahanonline's paths are Persian category names and
 *  none of them begins with this. */
export function markazeahanPath(slug: string): string {
  return `markazeahan/${slug}`;
}

const BASE = 'https://www.markazeahan.com/product-category/';
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

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

function txt(s: string): string {
  return unescapeHtml(s.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function toAscii(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

/**
 * The toman figure out of a «قیمت تومان» cell.
 *
 * The cell carries the day's movement in front of the number — «بدون تغییر
 * 620,000», «+ 2.4% 630,000», «-1.1% 618,000» — so the FIRST number in the
 * cell can be the percentage. Take the last thousands-grouped run instead, and
 * require the grouping: an ungrouped run is the movement's digits, not a
 * price, and reading «2.4» as 2 توман is the kind of quiet nonsense the price
 * band would not even catch.
 */
export function priceFromCell(raw: string): number | null {
  const s = toAscii(unescapeHtml(raw));
  const groups = [...s.matchAll(/\d{1,3}(?:,\d{3})+/g)].map((m) => Number(m[0]!.replace(/,/g, '')));
  const n = groups.length > 0 ? groups[groups.length - 1]! : null;
  return n !== null && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The page's «به روز رسانی: ۱۴۰۵/۰۶/۰۳ ۰۲:۰۶» stamp, as a bare Jalali
 * `y/m/d` — the form `rowUpdatedAt` and `jalaliDaysAgo` already read.
 *
 * Returns `''` when the page does not carry one, and every row then has an
 * empty «تاریخ بروزرسانی». That is deliberately treated as "don't know"
 * downstream rather than as "fresh"... which is a hole: an undated page from
 * this source would be copied. It is closed at the other end instead — a page
 * has to be listed in `MARKAZEAHAN_TARGETS` by hand, and all four carry the
 * stamp today. `parseMarkazeahanPage` returns no rows for a page that loses
 * it, so the fetcher reports the page as failed rather than mirroring it
 * undated.
 */
export function pageUpdatedAt(html: string): string {
  const plain = txt(html);
  const m = /به\s*روز\s*رسانی\s*:?\s*([۰-۹0-9]{4}\s*\/\s*[۰-۹0-9]{1,2}\s*\/\s*[۰-۹0-9]{1,2})/.exec(plain);
  if (!m) return '';
  return toAscii(m[1]!).replace(/\s+/g, '');
}

/**
 * Parse one category page into priced rows.
 *
 * Pure and exported so the tests can feed it a saved fixture, the same split
 * `parseAhanonlinePage` uses.
 *
 * Rows reading «تماس بگیرید» are dropped rather than treated as zero — on
 * `aluminum-rebar` they are three quarters of the table, and a page can carry
 * both. Dropping them is what makes "how many priced rows does this page
 * actually have" an honest number.
 */
export function parseMarkazeahanPage(html: string, sourcePath: string): SourceRow[] {
  const updatedAt = pageUpdatedAt(html);
  // An undated page cannot be freshness-checked, and this source's whole
  // freshness story is that stamp — see `pageUpdatedAt`.
  if (!updatedAt) return [];

  const out: SourceRow[] = [];
  for (const tm of html.matchAll(/<table[\s\S]*?<\/table>/g)) {
    const table = tm[0];
    const headers = [...table.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => txt(m[1]!));
    if (headers.length === 0) continue;
    const priceIdx = headers.findIndex((h) => h.includes('قیمت'));
    if (priceIdx < 0) continue;

    for (const rm of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const rowHtml = rm[1]!;
      if (rowHtml.includes('<th')) continue;
      const values = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => txt(m[1]!));
      if (values.length === 0) continue;
      const priceCell = values[priceIdx] ?? '';
      if (priceCell.includes('تماس')) continue;
      const priceToman = priceFromCell(priceCell);
      if (priceToman === null) continue;

      const cells: Record<string, string> = {};
      headers.forEach((h, i) => {
        if (i < values.length && values[i]) cells[h] = values[i]!;
      });
      // Their date is a property of the page; give every row a copy so the
      // matcher's per-row freshness gate works without knowing that.
      cells['تاریخ بروزرسانی'] = updatedAt;

      const name = cells['نام محصول'] ?? values.filter(Boolean).slice(0, 2).join(' ');
      out.push({
        sourcePath,
        // Their tables carry no per-mill grouping heading; the mill, where
        // they publish one at all, is a «کارخانه» column.
        group: '',
        name,
        // No product code on these tables. Empty rather than invented — the
        // audit trail says «—» instead of asserting an id that does not exist.
        code: '',
        priceToman,
        // No rial reading published, so nothing to cross-validate against;
        // see the file header. Recorded as the toman figure ×10 would be a
        // lie, so it is recorded as 0 and the forensics column reads empty.
        priceRial: 0,
        cells,
      });
    }
  }
  return out;
}

export interface MarkazeahanFetchOptions {
  delayMs?: number;
  timeoutMs?: number;
  /** Restrict to these `markazeahan/<slug>` paths. */
  paths?: readonly string[];
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
}

export interface MarkazeahanFetchResult {
  rows: SourceRow[];
  failures: Array<{ path: string; error: string }>;
  pagesFetched: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Fetch the in-scope pages and parse them. Never throws for one bad page, for
 * the reason `fetchAhanonlinePrices` gives: a partial mirror beats none, and
 * the run log records exactly which SKUs were therefore left alone.
 */
export async function fetchMarkazeahanPrices(
  opts: MarkazeahanFetchOptions = {},
): Promise<MarkazeahanFetchResult> {
  const {
    delayMs = 3500,
    timeoutMs = 60_000,
    paths,
    fetchImpl = fetch,
    sleepImpl = defaultSleep,
  } = opts;
  const targets = paths
    ? MARKAZEAHAN_TARGETS.filter((t) => paths.includes(markazeahanPath(t.slug)))
    : MARKAZEAHAN_TARGETS;

  const rows: SourceRow[] = [];
  const failures: MarkazeahanFetchResult['failures'] = [];
  let pagesFetched = 0;

  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i]!;
    const path = markazeahanPath(target.slug);
    if (i > 0) await sleepImpl(delayMs);
    const url = `${BASE}${encodeURIComponent(target.slug)}/`;
    try {
      const res = await fetchImpl(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'fa-IR,fa;q=0.9' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        failures.push({ path, error: `HTTP ${res.status}` });
        continue;
      }
      const body = await res.text();
      if (body.length < 5000) {
        failures.push({ path, error: `body too short (${body.length} bytes)` });
        continue;
      }
      const parsed = parseMarkazeahanPage(body, path);
      if (parsed.length === 0) {
        // Also the "they dropped the «به روز رسانی» stamp" case — see
        // `pageUpdatedAt`. Reported as a failure so it is visible in the run
        // log instead of looking like an empty category.
        failures.push({ path, error: 'no priced rows parsed' });
        continue;
      }
      pagesFetched += 1;
      rows.push(...parsed);
    } catch (err) {
      failures.push({ path, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { rows, failures, pagesFetched };
}
