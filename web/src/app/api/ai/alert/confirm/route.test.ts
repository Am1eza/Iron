// @vitest-environment node
/**
 * J-223, the other half: the confirm route is now the ONLY writer of an
 * AI-originated price alert. It has to enforce what `setPriceAlert` no
 * longer can — sign-in, ownership of the draft, and single use (an alert
 * sends real SMS; a replayed confirmation must not arm it twice).
 *
 * Mirrors the shape of the lead-confirm route's own tests, for the same
 * reasons documented there.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ulid } from 'ulid';

let sessionUser: { id: string; mobile: string; clubTier?: string } | null = null;
vi.mock('@/lib/auth/session', () => ({
  getSessionVerified: async () => sessionUser,
}));
vi.mock('@/lib/auth/origin', () => ({ assertSameOrigin: () => null }));
vi.mock('@/lib/server/utils/rateLimit', () => ({ rateLimit: async () => null }));

import { POST } from './route';
import { createTestDb } from '@/test/db';
import { seedDatabase } from '@/lib/server/db/seed';
import { getDb } from '@/lib/server/db/client';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { tableRows } from '@/lib/server/repos/catalogRepo';
import { putAlertDraft } from '@/lib/server/ai/alertDraft';
import type { PriceRow } from '@/lib/types/domain';

let db: Db;
let close: () => Promise<void>;
let priced: PriceRow;
let ownerId: string;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seedDatabase(db, { historyDays: 1 });
  priced = (await tableRows('rebar')).find((r) => !r.current.priceHidden && r.current.price > 0)!;
  ownerId = ulid();
  await db.insert(schema.users).values({ id: ownerId, mobile: '09121110001', name: 'مالک' });
}, 120_000);
afterAll(async () => {
  await close();
});
beforeEach(async () => {
  sessionUser = { id: ownerId, mobile: '09121110001' };
  await getDb().delete(schema.alerts);
});

function confirmReq(draftId: string) {
  return new NextRequest('http://localhost/api/ai/alert/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ draftId }),
  });
}

async function draftFor(userId: string) {
  return putAlertDraft({
    skuId: priced.id,
    productName: priced.name,
    op: 'below',
    threshold: priced.current.price,
    userId,
  });
}

describe('POST /api/ai/alert/confirm (J-223)', () => {
  it('arms the alert — THIS is the only path that writes one', async () => {
    const draft = await draftFor(ownerId);
    const res = await POST(confirmReq(draft.id));
    expect(res.status).toBe(200);

    const rows = await getDb().select().from(schema.alerts);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(ownerId);
    expect(rows[0]!.threshold).toBe(priced.current.price);
  });

  it('is single-use — a replayed confirmation cannot arm a second alert', async () => {
    const draft = await draftFor(ownerId);
    expect((await POST(confirmReq(draft.id))).status).toBe(200);

    const replay = await POST(confirmReq(draft.id));
    expect(replay.status).toBe(410);
    expect((await replay.json()).error).toBe('draft_expired');
    expect(await getDb().select().from(schema.alerts)).toHaveLength(1);
  });

  it('refuses an anonymous confirm without consuming the draft', async () => {
    const draft = await draftFor(ownerId);
    sessionUser = null;

    const res = await POST(confirmReq(draft.id));
    expect(res.status).toBe(401);
    expect(await getDb().select().from(schema.alerts)).toHaveLength(0);

    // The draft survived, so the visitor can sign in and press the button
    // again — the same login-then-continue flow the lead card has.
    sessionUser = { id: ownerId, mobile: '09121110001' };
    expect((await POST(confirmReq(draft.id))).status).toBe(200);
  });

  it("refuses another account's draft, and does not consume it", async () => {
    const strangerId = ulid();
    await db.insert(schema.users).values({ id: strangerId, mobile: '09121110002' });
    const draft = await draftFor(strangerId);

    const res = await POST(confirmReq(draft.id));
    expect(res.status).toBe(403);
    expect(await getDb().select().from(schema.alerts)).toHaveLength(0);

    // Still confirmable by its real owner — a stranger's attempt must not
    // destroy someone else's pending draft.
    sessionUser = { id: strangerId, mobile: '09121110002' };
    expect((await POST(confirmReq(draft.id))).status).toBe(200);
  });

  it('410s on an unknown draft id rather than writing anything', async () => {
    const res = await POST(confirmReq(ulid()));
    expect(res.status).toBe(410);
    expect(await getDb().select().from(schema.alerts)).toHaveLength(0);
  });
});
