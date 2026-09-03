/**
 * Live market-data fetcher for the نبض بازار ticker (usd/eur/gold18/ounce).
 * Two INDEPENDENT sources, each degrading gracefully to its own keys being
 * absent from the result — a global-ounce outage must not take down the
 * domestic currency/gold feed and vice versa; `market.service.ts` already
 * only upserts whatever keys come back non-null.
 *
 * - usd/eur/gold18 (Toman-denominated): BrsAPI (api.brsapi.ir) — a
 *   dedicated JSON API, not a website scrape. Replaced our self-hosted
 *   scraper of tgju.org (2026-08-26) after tgju.org itself was confirmed
 *   blocked at the network level from the production host: tgju.org AND
 *   its own api.tgju.org/api2.tgju.org subdomains all time out on both
 *   IPv4 and IPv6, while every other tested destination — including
 *   api.brsapi.ir — answers normally. That is a domain-level block, not a
 *   general outage, and it made the old scraper a structural single point
 *   of failure regardless of how reliable tgju.org's own uptime was.
 *   `BRSAPI_KEY` (free tier, 1500 req/day — this source uses one request
 *   per poll tick) gates this source; unset skips it entirely, same
 *   graceful-degradation contract as before.
 * - Global gold ounce (USD): gold-api.com — free, keyless, no published
 *   rate limit, independent of anything Iran-specific. `OUNCE_API_URL`
 *   overrides the default if that source ever needs to change.
 */
import { z } from 'zod';
import { reportError } from '@/lib/errors/report';
import { withResilience } from '@/lib/server/utils/resilience';
import { fetchJson, isRetryableHttpError } from '@/lib/server/utils/httpJson';
import type { MarketKey } from '@/lib/types/domain';

const DEFAULT_OUNCE_API_URL = 'https://api.gold-api.com/price/XAU';
const DEFAULT_BRSAPI_URL = 'https://api.brsapi.ir/Market/Gold_Currency.php';

const brsapiItemSchema = z.object({ symbol: z.string(), price: z.union([z.number(), z.string()]) });
const brsapiResponseSchema = z.object({
  gold: z.array(brsapiItemSchema),
  currency: z.array(brsapiItemSchema),
});
const ounceSchema = z.object({ price: z.number() });

function parsePrice(v: number | string): number | null {
  const n = typeof v === 'number' ? v : Number(v.replace(/[,٬\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const BRSAPI_TIMEOUT_MS = 8000;

async function fetchDomesticRates(out: Partial<Record<MarketKey, number>>): Promise<void> {
  const key = process.env.BRSAPI_KEY;
  if (!key) return;
  const base = process.env.BRSAPI_URL || DEFAULT_BRSAPI_URL;
  try {
    const body = await withResilience(
      'brsapi',
      () => fetchJson(`${base}?key=${encodeURIComponent(key)}`, BRSAPI_TIMEOUT_MS),
      { retries: 2, baseDelayMs: 300, isRetryable: isRetryableHttpError },
    );
    const parsed = brsapiResponseSchema.safeParse(body);
    if (!parsed.success) return;

    // Already Toman (BrsAPI's own `unit` field is always "تومان" for these
    // three) — unlike the old Rial-denominated scraper, no /10 conversion.
    const usd = parsed.data.currency.find((c) => c.symbol === 'USD');
    const eur = parsed.data.currency.find((c) => c.symbol === 'EUR');
    const gold18 = parsed.data.gold.find((g) => g.symbol === 'IR_GOLD_18K');
    const usdN = usd ? parsePrice(usd.price) : null;
    const eurN = eur ? parsePrice(eur.price) : null;
    const gold18N = gold18 ? parsePrice(gold18.price) : null;
    if (usdN !== null) out.usd = usdN;
    if (eurN !== null) out.eur = eurN;
    if (gold18N !== null) out.gold18 = gold18N;
  } catch (err) {
    reportError(err, { integration: 'brsapi' });
  }
}

async function fetchOunce(out: Partial<Record<MarketKey, number>>): Promise<void> {
  const url = process.env.OUNCE_API_URL || DEFAULT_OUNCE_API_URL;
  try {
    const body = await withResilience('gold-ounce', () => fetchJson(url), {
      retries: 2,
      baseDelayMs: 300,
      isRetryable: isRetryableHttpError,
    });
    const parsed = ounceSchema.safeParse(body);
    if (parsed.success && parsed.data.price > 0) out.ounce = Math.round(parsed.data.price * 100) / 100;
  } catch (err) {
    reportError(err, { integration: 'gold-ounce' });
  }
}

/**
 * Only ever called from the background market-poll job (see
 * jobs/marketPoll.job.ts), never synchronously in a request path — so the
 * retry/backoff above adds no user-facing latency, just improves the odds
 * a single poll tick survives a momentary blip instead of serving stale
 * values for a full extra interval.
 */
export async function fetchMarketRates(): Promise<Partial<Record<MarketKey, number>> | null> {
  const out: Partial<Record<MarketKey, number>> = {};
  await Promise.all([fetchOunce(out), fetchDomesticRates(out)]);
  return Object.keys(out).length > 0 ? out : null;
}
