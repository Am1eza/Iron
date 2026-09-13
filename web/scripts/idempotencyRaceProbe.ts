/** H-188: proves `withIdempotency()` executes a financially-meaningful write
 *  EXACTLY ONCE when N genuinely concurrent requests arrive with the same
 *  key — under REAL, independent PostgreSQL connections, not PGlite (which
 *  has no connection-level concurrency at all, so a "concurrent" test there
 *  proves only that the code runs).
 *
 *  The audit's own words on why this was still open: «یک تست concurrency
 *  واقعی (دو درخواست هم‌زمان واقعی، نه شبیه‌سازی، با همان کلید idempotency)
 *  روی PostgreSQL واقعی در این نوبت اجرا نشد».
 *
 *  What is actually at stake: this guard is what stops an admin double-click
 *  or a client retry across a network blip from issuing a second پیش‌فاکتور
 *  or a second order — and, with them, a second SMS to a real customer. The
 *  claim is an `INSERT … ON CONFLICT DO NOTHING RETURNING`, which is atomic
 *  in PostgreSQL; this proves it, and proves the losers get 409 rather than
 *  silently running the side effect too.
 *
 *  Destructive fixtures only in a deliberately named, disposable LOCAL database.
 *  Apply migrations first, then TEST_DATABASE_URL=... pnpm exec tsx scripts/idempotencyRaceProbe.ts
 */
import assert from 'node:assert/strict';
import pg from 'pg';
import { NextRequest } from 'next/server';
import { drizzle } from 'drizzle-orm/node-postgres';
import { setDbForTesting } from '../src/lib/server/db/client';
import * as schema from '../src/lib/server/db/schema';
import { withIdempotency } from '../src/lib/server/utils/idempotency';

const url = new URL(process.env.TEST_DATABASE_URL ?? 'http://invalid');
assert(
  ['localhost', '127.0.0.1'].includes(url.hostname) && /^\/iron_audit_/.test(url.pathname),
  'Requires a disposable localhost database named iron_audit_*',
);
const pool = new pg.Pool({ connectionString: url.toString(), max: 40 });
const control = new pg.Client({ connectionString: url.toString() });
await control.connect();
setDbForTesting(drizzle(pool, { schema }));

const N = 20;

function request(headerKey?: string) {
  return new NextRequest('http://localhost/api/admin/leads/L1/proforma', {
    method: 'POST',
    headers: headerKey ? { 'idempotency-key': headerKey } : {},
  });
}

/** One race: `concurrency` requests, same key, all firing at once. */
async function runOnce(concurrency: number, label: string, headerKey?: string) {
  await control.query('DELETE FROM idempotency_keys');
  let sideEffects = 0;

  const responses = await Promise.all(
    Array.from({ length: concurrency }, () =>
      withIdempotency(request(headerKey), 'admin/leads/proforma', 'lead-1:staff-7', async () => {
        // The real side effect stands in for issuing a proforma + SMS: it
        // must happen once, and the `await` makes the window a real one
        // rather than a synchronous no-op the scheduler never interleaves.
        sideEffects += 1;
        await new Promise((r) => setTimeout(r, 15));
        return { status: 201, body: { ref: 'PF-0001' } };
      }),
    ),
  );

  assert.equal(
    sideEffects,
    1,
    `[${label}] the side effect ran ${sideEffects} times for ${concurrency} concurrent requests with one key — it must run exactly once`,
  );

  const statuses = responses.map((r) => r.status).sort((a, b) => a - b);
  const created = statuses.filter((s) => s === 201).length;
  const inProgress = statuses.filter((s) => s === 409).length;
  assert.equal(
    created,
    1,
    `[${label}] exactly one request may be told it created something, got ${created}`,
  );
  assert.equal(
    created + inProgress,
    concurrency,
    `[${label}] every other request must get 409 in_progress, saw statuses ${statuses.join(',')}`,
  );

  // Exactly one row, and it must end up `done` — a claim stuck at `pending`
  // would block every genuine retry until the cleanup job swept it.
  const rows = await control.query('SELECT key, status FROM idempotency_keys');
  assert.equal(rows.rowCount, 1, `[${label}] expected exactly one claim row, got ${rows.rowCount}`);
  assert.equal(rows.rows[0].status, 'done', `[${label}] the winning claim must be marked done`);

  // …and a LATER retry replays the stored response instead of re-running.
  const replay = await withIdempotency(
    request(headerKey),
    'admin/leads/proforma',
    'lead-1:staff-7',
    async () => {
      sideEffects += 1;
      return { status: 201, body: { ref: 'PF-SECOND' } };
    },
  );
  assert.equal(
    sideEffects,
    1,
    `[${label}] a retry after completion must not re-run the side effect`,
  );
  assert.equal(
    replay.headers.get('Idempotency-Replayed'),
    'true',
    `[${label}] the replay must be labelled`,
  );
  assert.equal(
    (await replay.json()).ref,
    'PF-0001',
    `[${label}] the replay must return the ORIGINAL response`,
  );

  console.log(
    `  ✓ ${label}: ${concurrency} concurrent, 1 execution, ${inProgress}×409, replay served`,
  );
}

/** Two DIFFERENT callers must never collide, even sending the same header. */
async function runIsolation() {
  await control.query('DELETE FROM idempotency_keys');
  let a = 0;
  let b = 0;
  const [ra, rb] = await Promise.all([
    withIdempotency(request('same-header'), 'admin/leads/proforma', 'lead-1:staff-7', async () => {
      a += 1;
      await new Promise((r) => setTimeout(r, 15));
      return { status: 201, body: { ref: 'PF-A' } };
    }),
    withIdempotency(request('same-header'), 'admin/leads/proforma', 'lead-2:staff-9', async () => {
      b += 1;
      await new Promise((r) => setTimeout(r, 15));
      return { status: 201, body: { ref: 'PF-B' } };
    }),
  ]);
  assert.equal(a, 1, 'caller A must execute');
  assert.equal(
    b,
    1,
    'caller B must execute — a shared header value must not merge two different leads',
  );
  assert.equal((await ra.json()).ref, 'PF-A');
  assert.equal((await rb.json()).ref, 'PF-B');
  console.log(
    '  ✓ isolation: two callers sending the SAME Idempotency-Key header never replay each other',
  );
}

/** A failing run must release its claim, or a real retry is stuck forever. */
async function runFailureRelease() {
  await control.query('DELETE FROM idempotency_keys');
  await assert.rejects(
    withIdempotency(request(), 'admin/leads/proforma', 'lead-3:staff-7', async () => {
      throw new Error('upstream blew up');
    }),
  );
  const rows = await control.query('SELECT key FROM idempotency_keys');
  assert.equal(rows.rowCount, 0, 'a failed run must leave no pending claim behind');

  let ran = 0;
  const retry = await withIdempotency(
    request(),
    'admin/leads/proforma',
    'lead-3:staff-7',
    async () => {
      ran += 1;
      return { status: 201, body: { ref: 'PF-RETRY' } };
    },
  );
  assert.equal(ran, 1, 'the genuine retry after a transient failure must be allowed through');
  assert.equal(retry.status, 201);
  console.log('  ✓ failure release: a thrown run frees its claim so a real retry still works');
}

try {
  for (let i = 0; i < N; i++) {
    await runOnce(12, `run ${i + 1}/${N} — 12-way race, no header`);
  }
  await runOnce(20, 'client-supplied Idempotency-Key, 20-way race', 'client-key-abc');
  await runIsolation();
  await runFailureRelease();

  console.log(
    `PASS (${N + 3}/${N + 3}): withIdempotency() executes a financially-meaningful write exactly once under ` +
      'real connection-level concurrency — the double-proforma/double-SMS the guard exists to prevent cannot occur.',
  );
} finally {
  await control.query('DELETE FROM idempotency_keys').catch(() => {});
  setDbForTesting(null);
  await control.end();
  await pool.end();
}
