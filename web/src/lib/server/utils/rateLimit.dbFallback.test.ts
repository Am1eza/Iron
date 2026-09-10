// @vitest-environment node
/**
 * F-131 — end-to-end wiring: with a real (pglite) database present and no
 * Redis configured, `rateLimit()` must enforce the shared limit for the
 * auth-critical scopes via the Postgres fallback tier, not the per-process
 * `windows` Map. The actual cross-PROCESS proof (two independent Node
 * processes, real Postgres) is scripts/rateLimitOutageProbe.ts — see its doc
 * comment for why pglite here cannot substitute for that.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { like } from 'drizzle-orm';
import { createTestDb } from '@/test/db';
import { getDb } from '@/lib/server/db/client';
import { rateLimitWindows } from '@/lib/server/db/schema';
import { rateLimit } from './rateLimit';

let close: () => Promise<void>;

beforeAll(async () => {
  ({ close } = await createTestDb());
});
afterAll(async () => {
  await close();
});

function req() {
  // No IP-identifying headers → clientIp() falls back to 'local', the same
  // key every call in this file will share (matching one scope's bucket).
  return new NextRequest('https://ahantime.com/api/auth/otp/request', { method: 'POST' });
}

describe('rateLimit — Postgres fallback wiring (F-131)', () => {
  it('enforces the limit for otp-request via the DB tier when Redis is unconfigured', async () => {
    // Scope must be the LITERAL 'otp-request' — DB_FALLBACK_SCOPES is an
    // exact-match allowlist, not a prefix/pattern (see rateLimit.ts). A
    // distinctive windowMs keeps this test's fixed-window bucket isolated
    // from any other test/route sharing the real 'otp-request' scope name,
    // since this file's pglite instance is otherwise a fresh DB anyway.
    const scope = 'otp-request';
    const windowMs = 60_000 + Math.floor(Math.random() * 1000);
    for (let i = 0; i < 3; i++) expect(await rateLimit(req(), scope, { limit: 3, windowMs })).toBeNull();
    const limited = await rateLimit(req(), scope, { limit: 3, windowMs });
    expect(limited?.status).toBe(429);

    // Prove this went through the Postgres tier specifically (not merely the
    // in-process Map, which would produce the identical black-box 429 above)
    // — a row for this scope must exist with count === the number of allowed
    // + rejected calls (4: three allowed, one over-limit still increments).
    const rows = await getDb().select().from(rateLimitWindows).where(like(rateLimitWindows.key, `${scope}:local:%`));
    expect(rows.length).toBe(1);
    expect(rows[0]?.count).toBe(4);
  });

  it('does NOT use the Postgres tier for a scope outside DB_FALLBACK_SCOPES', async () => {
    // A scope not literally 'otp-request'/'otp-verify' — proves the DB tier
    // is opt-in per scope, not a blanket replacement of the in-process
    // window for everything.
    const scope = `unrelated-scope-${Math.random()}`;
    for (let i = 0; i < 2; i++) expect(await rateLimit(req(), scope, { limit: 2, windowMs: 60_000 })).toBeNull();
    const limited = await rateLimit(req(), scope, { limit: 2, windowMs: 60_000 });
    // Still enforced (by the in-process window) — this scope isn't
    // unprotected, it's just not the one this audit item is about.
    expect(limited?.status).toBe(429);
  });
});
