/** Worker half of scripts/rateLimitOutageProbe.ts — see that file's doc
 * comment for the full scenario. Runs as its OWN OS process (spawned by the
 * orchestrator via `tsx`), with its own module registry and its own
 * `windows` Map inside rateLimit.ts, exactly like a second replica/worker in
 * a real multi-instance deploy would. Talks to the SAME real Postgres as the
 * other worker via DATABASE_URL; REDIS_URL is deliberately left unset so
 * `redisRateCheck` returns null (Redis "unreachable"), forcing the fallback
 * tiers under test.
 *
 * argv: [scope, limit, windowMs, attempts, dbUrl]
 * stdout: one JSON line `{ allowed: number, limited: number }`.
 */
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { NextRequest } from 'next/server';
import { setDbForTesting } from '../src/lib/server/db/client';
import * as schema from '../src/lib/server/db/schema';
import { rateLimit } from '../src/lib/server/utils/rateLimit';

const [scope, limitStr, windowMsStr, attemptsStr, dbUrl] = process.argv.slice(2);
const limit = Number(limitStr);
const windowMs = Number(windowMsStr);
const attempts = Number(attemptsStr);

const pool = new pg.Pool({ connectionString: dbUrl });
setDbForTesting(drizzle(pool, { schema }));

function fakeRequest(): NextRequest {
  // No x-forwarded-for/cf-connecting-ip/x-real-ip → clientIp() falls back to
  // the literal 'local', which BOTH worker processes will produce — giving
  // them the same rate-limit key, exactly like two replicas behind the same
  // Caddy/Cloudflare edge serving the same client IP would.
  return new NextRequest('https://ahantime.com/api/auth/otp/request', { method: 'POST' });
}

async function main() {
  let allowed = 0;
  let limited = 0;
  // Fire concurrently (not one-at-a-time) so this worker's own requests race
  // each other too, not just the other process's.
  const results = await Promise.all(
    Array.from({ length: attempts }, () => rateLimit(fakeRequest(), scope!, { limit, windowMs })),
  );
  for (const r of results) {
    if (r) limited++;
    else allowed++;
  }
  process.stdout.write(JSON.stringify({ allowed, limited }) + '\n');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
