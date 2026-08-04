// @vitest-environment node
/**
 * End-to-end proof (real Postgres via pglite) that the repo search filters
 * treat `%` and `_` as LITERAL characters rather than ILIKE wildcards.
 *
 * The unit tests in utils/likeEscape.test.ts prove the escaping function; this
 * proves the escaping is actually WIRED INTO the query — the failure mode that
 * matters, since a repo that forgets `likeContains` still passes every
 * happy-path search test. Both assertions below fail on the pre-fix code:
 * `q: '%'` returned every row, and `q: 'L-1_3'` matched `L-123`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ulid } from 'ulid';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { adminListLeads } from './leadsRepo';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(schema.leads).values([
    { id: ulid(), ref: 'L-123', contactMobile: '09120000001', contactName: 'علی', source: 'table', channelPref: 'sms' },
    { id: ulid(), ref: 'L-1_3', contactMobile: '09120000002', contactName: 'رضا', source: 'table', channelPref: 'sms' },
    { id: ulid(), ref: 'L-999', contactMobile: '09120000003', contactName: 'تخفیف ۵۰%', source: 'table', channelPref: 'sms' },
  ]);
}, 120_000);
afterAll(async () => {
  await close();
});

describe('adminListLeads — LIKE metacharacters in `q`', () => {
  it('a bare % matches nothing instead of the whole table', async () => {
    // Pre-fix: `%%%` → every lead. That is both a wrong answer and an
    // unbounded scan an attacker can trigger at will.
    const { leads: rows } = await adminListLeads({ q: '%' });
    expect(rows.map((r) => r.ref)).toEqual(['L-999']); // only the row literally containing «%»
  });

  it('_ matches only a literal underscore, not any single character', async () => {
    const { leads: rows } = await adminListLeads({ q: 'L-1_3' });
    expect(rows.map((r) => r.ref)).toEqual(['L-1_3']); // NOT L-123
  });

  it('ordinary substring search is unaffected', async () => {
    const { leads: rows } = await adminListLeads({ q: 'L-1' });
    expect(rows.map((r) => r.ref).sort()).toEqual(['L-123', 'L-1_3']);
  });
});
