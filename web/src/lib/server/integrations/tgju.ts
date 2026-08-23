/**
 * Live market-data fetcher for the نبض بازار ticker (usd/eur/gold18/ounce).
 * Two INDEPENDENT sources, each degrading gracefully to its own keys being
 * absent from the result — a global-ounce outage must not take down the
 * domestic currency/gold feed and vice versa; `market.service.ts` already
 * only upserts whatever keys come back non-null.
 *
 * - usd/eur/gold18 (Rial-denominated): our own self-hosted scraper —
 *   docker-compose service `tgju` (github.com/BlackIQ/tgju-api, pinned to a
 *   known commit — see docker-compose.yml) fronting tgju.org, the only
 *   Iranian market-data source with a public (if unofficial) feed — there is
 *   no official public API. `TGJU_BASE_URL` points at it; unset (e.g. a
 *   local dev box without the extra container) skips this source entirely.
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

/** tgju-api's shapes, confirmed against its actual source (routers/price.py
 *  + schemas/price.py) — /currency is a flat array of items; /gold is an
 *  array of CATEGORIES (one per table on tgju.org's gold-chart page), each
 *  with its own `prices[]` — geram18 lives in whichever category the page
 *  currently groups it under, so every category has to be searched. */
const tgjuItemSchema = z.object({ key: z.string(), price: z.union([z.number(), z.string()]) });
const currencySchema = z.array(tgjuItemSchema);
const goldSchema = z.array(z.object({ prices: z.array(tgjuItemSchema) }));
const ounceSchema = z.object({ price: z.number() });

function parsePrice(v: number | string): number | null {
  const n = typeof v === 'number' ? v : Number(v.replace(/[,٬\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** tgju-api's currency/gold values are always Rial — Toman is always
 *  Rial / 10, never a magnitude guess: real IRR/USD rial values run around
 *  1-2 million (comfortably "small"), while gold-per-gram rial values run
 *  in the hundreds of millions ("large") — a size-based cutoff silently
 *  breaks on one or the other depending on where the threshold sits. */
function rialToToman(raw: number): number {
  return Math.round(raw / 10);
}

// tgju-api live-scrapes tgju.org on every single request (no caching — see
// its scrap/tgju.py), so a 5s budget that's plenty for gold-api.com's
// dedicated endpoint is occasionally too tight here; give this source more
// room before calling it a failure.
const TGJU_TIMEOUT_MS = 8000;

async function fetchCurrencyAndGold(base: string, out: Partial<Record<MarketKey, number>>): Promise<void> {
  try {
    const body = await withResilience('tgju-currency', () => fetchJson(`${base}/api/price/currency`, TGJU_TIMEOUT_MS), {
      retries: 2,
      baseDelayMs: 300,
      isRetryable: isRetryableHttpError,
    });
    const parsed = currencySchema.safeParse(body);
    if (parsed.success) {
      for (const item of parsed.data) {
        const n = parsePrice(item.price);
        if (n === null) continue;
        if (item.key === 'price_dollar_rl') out.usd = rialToToman(n);
        else if (item.key === 'price_eur') out.eur = rialToToman(n);
      }
    }
  } catch (err) {
    reportError(err, { integration: 'tgju-currency' });
  }

  try {
    const body = await withResilience('tgju-gold', () => fetchJson(`${base}/api/price/gold`, TGJU_TIMEOUT_MS), {
      retries: 2,
      baseDelayMs: 300,
      isRetryable: isRetryableHttpError,
    });
    const parsed = goldSchema.safeParse(body);
    if (parsed.success) {
      const item = parsed.data.flatMap((category) => category.prices).find((p) => p.key === 'geram18');
      const n = item ? parsePrice(item.price) : null;
      if (n !== null) out.gold18 = rialToToman(n);
    }
  } catch (err) {
    reportError(err, { integration: 'tgju-gold' });
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
export async function fetchTgju(): Promise<Partial<Record<MarketKey, number>> | null> {
  const out: Partial<Record<MarketKey, number>> = {};
  const base = process.env.TGJU_BASE_URL;
  const tasks: Promise<void>[] = [fetchOunce(out)];
  if (base) tasks.push(fetchCurrencyAndGold(base, out));
  await Promise.all(tasks);
  return Object.keys(out).length > 0 ? out : null;
}
