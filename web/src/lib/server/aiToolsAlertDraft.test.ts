// @vitest-environment node
/**
 * J-223: `setPriceAlert` was the ONE model tool that wrote a real row — and
 * therefore armed real future SMS — straight from a tool call, with no human
 * confirmation anywhere in the path. A visitor who merely ASKED about a price
 * could end up subscribed to messages they never agreed to.
 *
 * The audit's acceptance criteria, exactly: asking alone must create no
 * `alerts` row; only the confirm step (the card's own button →
 * POST /api/ai/alert/confirm) may write one.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { ulid } from 'ulid';
import { createTestDb } from '@/test/db';
import { seedDatabase } from '@/lib/server/db/seed';
import { getDb } from '@/lib/server/db/client';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { tableRows } from '@/lib/server/repos/catalogRepo';
import { runTool } from '@/lib/server/services/aiTools';
import { getAlertDraft } from '@/lib/server/ai/alertDraft';
import type { AuthUser } from '@/lib/auth/types';
import type { PriceRow } from '@/lib/types/domain';

let db: Db;
let close: () => Promise<void>;
let priced: PriceRow;
let user: AuthUser;

type AlertToolResult = {
  status?: string;
  draftId?: string;
  product?: string;
  threshold?: number;
  error?: string;
  note?: string;
};

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seedDatabase(db, { historyDays: 1 });
  const rows = await tableRows('rebar');
  priced = rows.find((r) => !r.current.priceHidden && r.current.price > 0)!;
  expect(priced).toBeTruthy();

  const userId = ulid();
  await db.insert(schema.users).values({ id: userId, mobile: '09121110000', name: 'مشتری آزمایشی' });
  user = { id: userId, mobile: '09121110000', role: 'customer' } as AuthUser;
}, 120_000);
afterAll(async () => {
  await close();
});
beforeEach(async () => {
  await getDb().delete(schema.alerts);
});

describe('setPriceAlert — asking alone arms NOTHING (J-223)', () => {
  it('writes no alerts row, and returns a draft awaiting the visitor\'s confirmation', async () => {
    const onAlertDraft = vi.fn();
    const result = (await runTool(
      'setPriceAlert',
      { query: priced.slug },
      user,
      { onAlertDraft },
    )) as AlertToolResult;

    // THE GUARANTEE: nothing was armed by the tool call itself.
    expect(await getDb().select().from(schema.alerts)).toHaveLength(0);

    expect(result.status).toBe('awaiting_user_confirmation');
    expect(result.draftId).toBeTruthy();
    // The model is told explicitly NOT to claim it was set.
    expect(result.note).toContain('هنوز هیچ هشداری ثبت نشده');

    // The card the visitor actually presses was emitted, with the real
    // product and threshold on it — not an opaque id.
    expect(onAlertDraft).toHaveBeenCalledTimes(1);
    const card = onAlertDraft.mock.calls[0]![0] as Record<string, unknown>;
    expect(card.draftId).toBe(result.draftId);
    expect(card.product).toBe(priced.name);
    expect(card.threshold).toBe(priced.current.price);

    // And the draft is genuinely retrievable server-side for the confirm
    // route — the client only ever holds the id.
    const stored = await getAlertDraft(result.draftId!);
    expect(stored?.skuId).toBe(priced.id);
    expect(stored?.userId).toBe(user.id);
  });

  it('still refuses outright for an anonymous visitor — an alert needs an account', async () => {
    const result = (await runTool('setPriceAlert', { query: priced.slug }, null)) as AlertToolResult;
    expect(result.status).toBe('needs_login');
    expect(await getDb().select().from(schema.alerts)).toHaveLength(0);
  });

  it('drafts nothing for a product with no published price', async () => {
    const hidden = (await tableRows('rebar')).find((r) => r.current.priceHidden || r.current.price <= 0);
    if (!hidden) return; // seed has none today — nothing to assert against
    const result = (await runTool('setPriceAlert', { query: hidden.slug }, user)) as AlertToolResult;
    expect(result.error).toBeTruthy();
    expect(await getDb().select().from(schema.alerts)).toHaveLength(0);
  });
});
