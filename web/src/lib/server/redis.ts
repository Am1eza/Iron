/**
 * Redis client — Node/Docker deploy only.
 *
 * Returns null whenever REDIS_URL is unset (local dev, or the Cloudflare
 * Workers target which has no raw-TCP sockets), so every caller degrades
 * gracefully to its own non-Redis fallback (in-process rate window, direct DB
 * read, etc.). The lazy dynamic import keeps `ioredis` out of any bundle where
 * it isn't used and never throws on import.
 *
 * Used for: distributed rate limiting (survives container restarts, shared
 * across replicas) and read-through caching of hot, non-personalized data.
 */
import type IORedisType from 'ioredis';

let clientPromise: Promise<IORedisType | null> | null = null;

async function connect(): Promise<IORedisType | null> {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    const mod = await import('ioredis');
    const IORedis = (mod.default ?? mod) as unknown as typeof IORedisType;
    const client = new IORedis(url, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      connectTimeout: 1500,
    });
    // Never let a transient Redis blip crash a request — callers fall back.
    client.on('error', () => {});
    return client;
  } catch {
    return null;
  }
}

/** Shared singleton (or null when Redis isn't configured/available). */
export function getRedis(): Promise<IORedisType | null> {
  if (!clientPromise) clientPromise = connect();
  return clientPromise;
}

/** Liveness probe for /api/health. 'not_configured' when there is no Redis
 *  URL at all (mock/dev), 'up' on a successful PING, 'down' on anything else.
 *
 *  Reported, never fatal. Redis is the authority for rate limiting, so when it
 *  dies after boot every redisRateCheck returns null and the code silently
 *  falls back to a per-process window — rate limiting gets much weaker with
 *  nothing anywhere saying so. This makes that visible. It must NOT turn into
 *  a 503: the app is deliberately built to survive a cache outage, and failing
 *  the healthcheck would have an orchestrator kill a container that is working. */
export async function redisHealth(): Promise<'up' | 'down' | 'not_configured'> {
  if (!process.env.REDIS_URL) return 'not_configured';
  try {
    const r = await getRedis();
    if (!r) return 'down';
    return (await r.ping()) === 'PONG' ? 'up' : 'down';
  } catch {
    return 'down';
  }
}

/**
 * Atomic fixed-window rate check. Returns true (over limit) / false (under),
 * or null when Redis is unavailable so the caller uses its own fallback.
 */
export async function redisRateCheck(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean | null> {
  const r = await getRedis();
  if (!r) return null;
  try {
    const bucket = Math.floor(Date.now() / windowMs);
    const k = `rl:${key}:${bucket}`;
    const n = await r.incr(k);
    if (n === 1) await r.pexpire(k, windowMs);
    return n > limit;
  } catch {
    return null;
  }
}

/** Read-through JSON cache get. Returns null on miss / no Redis / any error. */
export async function cacheGetJson<T>(key: string): Promise<T | null> {
  const r = await getRedis();
  if (!r) return null;
  try {
    const raw = await r.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Spread a cache TTL so synchronised expiries can't stampede the DB.
 *
 * Every read-through cache here is populated by whichever request happens to
 * miss first, which means all the traffic that arrives in that same instant
 * gets an IDENTICAL expiry timestamp. They then all expire together, and the
 * whole burst misses together and hits Postgres together — a thundering herd
 * that repeats on a fixed period forever. The sitewide 60s ticker poll is the
 * worst case: it is genuinely synchronised across every open tab, so its 30s
 * cache expires for everyone at once, twice a minute.
 *
 * Jitter is DOWNWARD ONLY (`[base·(1−spread), base]`). Each of these caches
 * documents a staleness bound that other code reasons about ("bounded 30s
 * staleness is fine", "categories change rarely"); jittering upward would
 * quietly exceed the bound the comment promises, while jittering downward
 * only ever makes the data fresher. The cost is a slightly lower hit rate,
 * which is exactly what buys the de-synchronisation.
 *
 * Never returns less than 1 second — a sub-second TTL on a 1s base would make
 * the cache useless rather than merely less effective.
 */
export function jitterTtl(baseSeconds: number, spread = 0.2): number {
  const jittered = baseSeconds * (1 - Math.random() * spread);
  return Math.max(1, Math.round(jittered));
}

/** Cache set with a TTL (seconds). No-op without Redis. */
export async function cacheSetJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const r = await getRedis();
  if (!r) return;
  try {
    await r.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    /* noop — cache is best-effort */
  }
}

/** Explicit invalidation (e.g. after an admin price edit). No-op without Redis. */
export async function cacheDel(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const r = await getRedis();
  if (!r) return;
  try {
    await r.del(...keys);
  } catch {
    /* noop */
  }
}
