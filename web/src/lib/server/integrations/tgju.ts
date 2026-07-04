/**
 * tgju.org fetcher — FX/gold/ounce for the نبض بازار ticker. The exact API
 * shape is configured via TGJU_BASE_URL (the deploy points it at tgju's JSON
 * endpoint or a relay). Boundary-validated; any failure returns null so the
 * market service can serve last-known values with isStale=true.
 */
import { z } from 'zod';
import { reportError } from '@/lib/errors/report';
import { withResilience } from '@/lib/server/utils/resilience';
import type { MarketKey } from '@/lib/types/domain';

/** HTTP errors this module throws internally, tagged with a status so the
 *  resilience layer can tell a transient 5xx/network blip (worth retrying)
 *  from a persistent 4xx (retrying won't fix a bad URL/expired key). */
class TgjuHttpError extends Error {
  constructor(public status: number) {
    super(`tgju HTTP ${status}`);
  }
}

function isRetryableTgjuError(err: unknown): boolean {
  if (err instanceof TgjuHttpError) return err.status >= 500;
  return true; // network errors, timeouts, DNS failures, etc.
}

/** tgju current-rates payload (api.tgju.org/v1/data/sana/json format is a
 *  key→{p: "price", ...} map; a relay may pre-shape it to {usd: number, ...}). */
const flatSchema = z.record(z.string(), z.union([z.number(), z.string()]));

const TGJU_KEYS: Record<Exclude<MarketKey, 'billet'>, string[]> = {
  // Accept both tgju's canonical item keys and pre-shaped relay keys.
  usd: ['usd', 'price_dollar_rl', 'price_dollar_dt'],
  eur: ['eur', 'price_eur'],
  gold18: ['gold18', 'geram18'],
  ounce: ['ounce', 'ons'],
};

function parseNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[,٬\s]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  if (v && typeof v === 'object' && 'p' in (v as Record<string, unknown>)) {
    return parseNumber((v as Record<string, unknown>).p);
  }
  return null;
}

/** Rial→Toman where needed: tgju quotes IRR for currency/gold items. */
function normalize(key: Exclude<MarketKey, 'billet'>, raw: number): number {
  if (key === 'ounce') return raw; // USD
  // Values already in Toman-scale (relay) pass through; IRR gets divided.
  return raw > 10_000_000 ? Math.round(raw / 10) : Math.round(raw);
}

/**
 * Only ever called from the background market-poll job (see
 * jobs/marketPoll.job.ts), never synchronously in a request path — so the
 * retry/backoff below adds no user-facing latency, just improves the odds
 * a single poll tick survives a momentary blip instead of serving stale
 * values for a full extra interval. 2 retries + a circuit breaker (opens
 * after 3 consecutive failed poll attempts) sit behind the existing
 * try/catch: any thrown error — including CircuitOpenError while the
 * breaker is open — still lands in the same `return null`, so callers'
 * last-known-value/isStale fallback is unchanged.
 */
export async function fetchTgju(): Promise<Partial<Record<MarketKey, number>> | null> {
  const base = process.env.TGJU_BASE_URL;
  if (!base) return null; // not configured — dev/seed values keep serving
  const apiKey = process.env.TGJU_API_KEY;
  try {
    const json: unknown = await withResilience(
      'tgju',
      async () => {
        const res = await fetch(base, {
          signal: AbortSignal.timeout(5000),
          // TGJU_API_KEY is optional — some relays front the public tgju feed
          // with their own auth; a bare tgju.org JSON endpoint needs none.
          headers: { accept: 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
          cache: 'no-store',
        });
        if (!res.ok) throw new TgjuHttpError(res.status);
        return res.json();
      },
      { retries: 2, baseDelayMs: 300, isRetryable: isRetryableTgjuError },
    );
    // Accept either a flat map or tgju's {current: {...}} envelope.
    const body = (json && typeof json === 'object' && 'current' in (json as Record<string, unknown>)
      ? (json as Record<string, unknown>).current
      : json) as unknown;
    const parsed = flatSchema.safeParse(body);
    const map = parsed.success ? parsed.data : (body as Record<string, unknown>);
    if (!map || typeof map !== 'object') return null;

    const out: Partial<Record<MarketKey, number>> = {};
    for (const [key, aliases] of Object.entries(TGJU_KEYS) as [Exclude<MarketKey, 'billet'>, string[]][]) {
      for (const alias of aliases) {
        const n = parseNumber((map as Record<string, unknown>)[alias]);
        if (n !== null) {
          out[key] = normalize(key, n);
          break;
        }
      }
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch (err) {
    reportError(err, { integration: 'tgju' });
    return null;
  }
}
