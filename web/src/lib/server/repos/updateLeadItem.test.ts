// @vitest-environment node
/**
 * updateLeadItem — the guards that protect an issued quote. The docstring
 * used to promise edits happen "before proforma issuance" while nothing
 * enforced it, and a cleared price box was stored as 0 (falsy → the line
 * vanished from the customer's proforma). These are the regressions.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { updateLeadItem, LeadItemLockedError, WholeUnitQtyError } from './leadsRepo';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
}, 120_000);
afterAll(async () => {
  await close();
});

const HOUR = 60 * 60 * 1000;

async function seedLead(unit: 'kg' | 'branch' | 'sheet' | 'meter' = 'kg') {
  const leadId = ulid();
  const itemId = ulid();
  const ref = `LD-${leadId}`;
  await db.insert(schema.leads).values({ id: leadId, ref, contactMobile: '09120000007', source: 'table' });
  await db.insert(schema.leadItems).values({
    id: itemId,
    leadId,
    name: 'میلگرد ۱۴ ذوب‌آهن',
    qty: 2,
    unit,
    unitPrice: 50_000,
    lineTotal: 100_000,
  });
  return { leadId, itemId, ref };
}

async function seedProforma(
  leadId: string,
  status: 'active' | 'expired' | 'cancelled',
  validUntil = new Date(Date.now() + 48 * HOUR),
) {
  const ref = `PF-${ulid()}`;
  await db.insert(schema.proformas).values({
    id: ulid(),
    leadId,
    ref,
    lines: [{ skuId: '', name: 'میلگرد ۱۴ ذوب‌آهن', qty: 2, unit: 'kg', unitPrice: 50_000, lineTotal: 100_000 }],
    subtotal: 100_000,
    vatRate: 0.1,
    vatAmount: 10_000,
    total: 110_000,
    validUntil,
    status,
  });
  return ref;
}

/** Reads the row straight from the DB — the point of several tests is that
 *  the refused edit wrote NOTHING, which the return value can't show. */
const itemRow = (itemId: string) =>
  db.select().from(schema.leadItems).where(eq(schema.leadItems.id, itemId)).limit(1).then((r) => r[0]!);

describe('updateLeadItem — active proforma locks the lines', () => {
  it('refuses the edit and names the blocking proforma', async () => {
    const { leadId, itemId } = await seedLead();
    const ref = await seedProforma(leadId, 'active');

    await expect(updateLeadItem(itemId, leadId, { unitPrice: 99_000 })).rejects.toBeInstanceOf(LeadItemLockedError);
    await expect(updateLeadItem(itemId, leadId, { unitPrice: 99_000 })).rejects.toMatchObject({ proformaRef: ref });
  });

  it('writes nothing when it refuses — the quote and the lead stay in agreement', async () => {
    const { leadId, itemId } = await seedLead();
    await seedProforma(leadId, 'active');

    await expect(updateLeadItem(itemId, leadId, { qty: 40, unitPrice: 99_000 })).rejects.toBeInstanceOf(
      LeadItemLockedError,
    );
    expect(await itemRow(itemId)).toMatchObject({ qty: 2, unitPrice: 50_000, lineTotal: 100_000 });
  });

  it('names the most recent active proforma when a lead has several', async () => {
    const { leadId, itemId } = await seedLead();
    await seedProforma(leadId, 'cancelled');
    const live = await seedProforma(leadId, 'active');

    await expect(updateLeadItem(itemId, leadId, { qty: 3 })).rejects.toMatchObject({ proformaRef: live });
  });

  it('lets an expired proforma through — that quote is dead, re-pricing is the point', async () => {
    const { leadId, itemId } = await seedLead();
    await seedProforma(leadId, 'expired', new Date(Date.now() - 24 * HOUR));

    const updated = await updateLeadItem(itemId, leadId, { unitPrice: 60_000 });
    expect(updated).toMatchObject({ qty: 2, unitPrice: 60_000, lineTotal: 120_000 });
  });

  it('lets a cancelled proforma through', async () => {
    const { leadId, itemId } = await seedLead();
    await seedProforma(leadId, 'cancelled');

    const updated = await updateLeadItem(itemId, leadId, { qty: 3 });
    expect(updated).toMatchObject({ qty: 3, lineTotal: 150_000 });
  });

  it('lets a still-"active" row through once validUntil has passed (the sweep job lags by up to 10 min)', async () => {
    const { leadId, itemId } = await seedLead();
    await seedProforma(leadId, 'active', new Date(Date.now() - 1 * HOUR));

    const updated = await updateLeadItem(itemId, leadId, { qty: 3 });
    expect(updated).toMatchObject({ qty: 3, unitPrice: 50_000, lineTotal: 150_000 });
  });

  it("ignores another lead's active proforma", async () => {
    const { leadId, itemId } = await seedLead();
    const other = await seedLead();
    await seedProforma(other.leadId, 'active');

    const updated = await updateLeadItem(itemId, leadId, { qty: 7 });
    expect(updated).toMatchObject({ qty: 7 });
  });
});

describe('updateLeadItem — "no price" is null, never 0', () => {
  it('clears the price to NULL (with a NULL lineTotal), not 0/0', async () => {
    const { leadId, itemId } = await seedLead();
    const updated = await updateLeadItem(itemId, leadId, { unitPrice: null });
    expect(updated).toMatchObject({ qty: 2, unitPrice: null, lineTotal: null });
  });

  it('keeps a real 0 distinguishable from "unpriced"', async () => {
    const zero = await seedLead();
    const none = await seedLead();
    const priced = await updateLeadItem(zero.itemId, zero.leadId, { unitPrice: 0 });
    const unpriced = await updateLeadItem(none.itemId, none.leadId, { unitPrice: null });

    expect(priced).toMatchObject({ unitPrice: 0, lineTotal: 0 });
    expect(unpriced).toMatchObject({ unitPrice: null, lineTotal: null });
    // The distinction only pays off with a `!= null` test — the truthiness
    // filter the proforma route still uses treats both as unpriced and drops
    // the 0-priced line from the customer's quote.
    expect([priced!.unitPrice, unpriced!.unitPrice].filter((p) => p != null)).toEqual([0]);
  });

  it('leaves the stored price alone when only qty is patched (undefined ≠ null)', async () => {
    const { leadId, itemId } = await seedLead();
    await updateLeadItem(itemId, leadId, { unitPrice: null });
    const updated = await updateLeadItem(itemId, leadId, { qty: 5 });
    expect(updated).toMatchObject({ qty: 5, unitPrice: null, lineTotal: null });
  });
});

describe('updateLeadItem — audit before-state', () => {
  it('returns the pre-edit row and the lead ref alongside the updated row', async () => {
    const { leadId, itemId, ref } = await seedLead();
    const updated = await updateLeadItem(itemId, leadId, { qty: 4, unitPrice: 61_000 });

    expect(updated).toMatchObject({ qty: 4, unitPrice: 61_000, lineTotal: 244_000, leadRef: ref });
    // What the audit row could never say before: the price WAS ۵۰٬۰۰۰.
    expect(updated!.before).toMatchObject({ qty: 2, unitPrice: 50_000, lineTotal: 100_000 });
  });

  it('reports the before-state of a price that was previously unset', async () => {
    const { leadId, itemId } = await seedLead();
    await updateLeadItem(itemId, leadId, { unitPrice: null });
    const updated = await updateLeadItem(itemId, leadId, { unitPrice: 70_000 });
    expect(updated!.before).toMatchObject({ unitPrice: null, lineTotal: null });
  });
});

describe('updateLeadItem — whole-piece units', () => {
  it('rejects ۳٫۷ شاخه and leaves the row untouched', async () => {
    const { leadId, itemId } = await seedLead('branch');
    await expect(updateLeadItem(itemId, leadId, { qty: 3.7 })).rejects.toBeInstanceOf(WholeUnitQtyError);
    await expect(updateLeadItem(itemId, leadId, { qty: 3.7 })).rejects.toMatchObject({ unit: 'branch' });
    expect(await itemRow(itemId)).toMatchObject({ qty: 2 });
  });

  it('rejects a fractional sheet count', async () => {
    const { leadId, itemId } = await seedLead('sheet');
    await expect(updateLeadItem(itemId, leadId, { qty: 1.5 })).rejects.toBeInstanceOf(WholeUnitQtyError);
  });

  it('allows fractional kg/meter — ۲٫۵ تن is a real quantity', async () => {
    const kg = await seedLead('kg');
    const meter = await seedLead('meter');
    await expect(updateLeadItem(kg.itemId, kg.leadId, { qty: 2500.5 })).resolves.toMatchObject({ qty: 2500.5 });
    await expect(updateLeadItem(meter.itemId, meter.leadId, { qty: 6.25 })).resolves.toMatchObject({ qty: 6.25 });
  });

  it('allows a whole شاخه count', async () => {
    const { leadId, itemId } = await seedLead('branch');
    await expect(updateLeadItem(itemId, leadId, { qty: 12 })).resolves.toMatchObject({ qty: 12, lineTotal: 600_000 });
  });
});
