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
