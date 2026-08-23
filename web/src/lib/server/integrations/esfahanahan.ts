/**
 * Live شمش فولاد (steel billet) price for the نبض بازار ticker.
 *
 * Billet was the one ticker key with no feed: admin-entered only, via
 * `PUT /api/admin/market/billet`. In practice nobody remembered to enter it —
 * it sat at 60,800 تومان/kg from 1405/05/25 while the real market ran
 * 66,750–67,700, a ~10% error that stood for a week on a site whose entire
 * positioning is price transparency. Hence this source.
 *
 * There is no public billet feed in Iran (IME publishes auction results, not
 * a machine-readable spot price). What exists is esfahanahan.com — a real
 * Iranian steel retailer whose product pages render a price-history chart
 * from a JSON endpoint their own frontend calls:
 *
 *   GET /api/products/variations/prices/{productId}?source={from}&destination={to}
 *   → {"success":true,"data":[[unixSeconds, priceInRial], ...]}   (ascending)
 *
 * Product 626 is شمش فولاد ۱۵۰×۱۵۰ اصفهان (القایی، 5SP، ۱۲ متری) —
 * https://esfahanahan.com/product/شمش-فولاد/dimention-150*150/ — the same
 * grade/section the ticker's billet number has always referred to.
 *
 * Caveats worth knowing before trusting or changing this:
 * - It is NOT a documented/public API, just the endpoint behind their chart
 *   widget. No auth, no key, no published rate limit — which is exactly why
 *   we poll it gently (every 15 min, see jobs/billetPoll.job.ts) rather than
 *   at the 60s ticker cadence. It publishes a handful of points per day.
 * - `source`/`destination` are Tehran-local `YYYY-M-D H:MM:SS` (their own
 *   frontend sends unpadded components and a literal space); the response is
 *   whatever points fall in the window, so a wide window is safe and a too-
 *   narrow one silently returns `[]` on a day they haven't repriced yet.
 * - Values are RIAL. The ticker stores Toman (value / 10), matching every
 *   other Toman key and every billet value ever entered by hand.
 */
import { z } from 'zod';
import { reportError } from '@/lib/errors/report';
import { withResilience } from '@/lib/server/utils/resilience';
import { fetchJson, isRetryableHttpError } from '@/lib/server/utils/httpJson';

const DEFAULT_BASE_URL = 'https://esfahanahan.com';
/** شمش فولاد ۱۵۰×۱۵۰ اصفهان (القایی، 5SP، ۱۲ متری). */
const DEFAULT_PRODUCT_ID = '626';

/** Their upstream answers in well under a second from this host, but it is a
 *  retailer's CMS, not a dedicated price API — give it room before calling a
 *  poll tick failed. Nothing user-facing waits on this (background job only). */
const TIMEOUT_MS = 10_000;

/** How far back to ask for. They publish a few points a day, but a quiet
 *  weekend or a holiday can leave a 2–3 day gap; a week-wide window means a
 *  quiet stretch reads as "unchanged" (we take the newest point) instead of
 *  as an outage. Cost is a handful of extra array entries. */
const WINDOW_DAYS = 7;

/** `[unixSeconds, priceInRial]` pairs. `.catchall`-free and permissive about
 *  extra top-level fields — we only care about `data`. */
const responseSchema = z.object({
  success: z.boolean().optional(),
  data: z.array(z.tuple([z.number(), z.number()])),
});

/** Their frontend's format: Tehran-local, unpadded date components, a literal
 *  space before the time (URL-encoded by `encodeURIComponent` below). */
function formatWindowStamp(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  // Intl renders midnight as hour "24" under hour12:false in some ICU builds.
  const hour = get('hour') === '24' ? '0' : String(Number(get('hour')));
  return `${get('year')}-${Number(get('month'))}-${Number(get('day'))} ${hour}:${get('minute')}:${get('second')}`;
}

function rialToToman(raw: number): number {
  return Math.round(raw / 10);
}

/**
 * The most recent published billet price in تومان per kilogram, or `null` if
 * the source is unreachable / unparseable / empty.
 *
 * NEVER throws: `market.service.ts` treats `null` as "outage — keep the
 * last-known value and flag the row stale" (AC-A-2), the same contract
 * `fetchTgju()` has. A billet-source failure must not disturb the other four
 * keys, and vice versa.
 *
 * Only ever called from the background billet-poll job, never in a request
 * path, so the retry/backoff below costs no user-facing latency.
 */
export async function fetchBilletPrice(now = new Date()): Promise<number | null> {
  const base = (process.env.ESFAHANAHAN_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const productId = process.env.ESFAHANAHAN_BILLET_PRODUCT_ID || DEFAULT_PRODUCT_ID;
  const from = formatWindowStamp(new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000));
  const to = formatWindowStamp(now);
  const url =
    `${base}/api/products/variations/prices/${encodeURIComponent(productId)}` +
    `?source=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}`;

  try {
    const body = await withResilience('esfahanahan-billet', () => fetchJson(url, TIMEOUT_MS), {
      retries: 2,
      baseDelayMs: 300,
      isRetryable: isRetryableHttpError,
    });
    const parsed = responseSchema.safeParse(body);
    if (!parsed.success || parsed.data.data.length === 0) return null;
    // Documented as ascending, but sort rather than trust: taking the wrong
    // end here would silently pin the ticker to a week-old price — the exact
    // failure this whole module exists to end.
    const newest = parsed.data.data.reduce((a, b) => (b[0] > a[0] ? b : a));
    const toman = rialToToman(newest[1]);
    return Number.isFinite(toman) && toman > 0 ? toman : null;
  } catch (err) {
    reportError(err, { integration: 'esfahanahan-billet' });
    return null;
  }
}
