// @vitest-environment node
/** issueProforma's discount math (US-19.4) — a flat Toman amount off
 *  subtotal, applied BEFORE VAT, clamped to [0, subtotal]. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ulid } from 'ulid';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { issueProforma } from './leads.service';
import { findLead, type LeadRow } from '@/lib/server/repos/leadsRepo';
import type { LineItem } from '@/lib/types/domain';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
}, 120_000);
afterAll(async () => {
  await close();
});

async function seedLead(): Promise<LeadRow> {
  const id = ulid();
  const ref = `PF-TEST-${id}`;
  await db.insert(schema.leads).values({ id, ref, contactMobile: '09120000002', source: 'table' });
  return (await findLead(id))!;
}

const LINES: LineItem[] = [
  { skuId: 's1', name: 'میلگرد ۱۴', qty: 10, unit: 'kg', lineTotal: 1_000_000 },
];

describe('issueProforma — discount (US-19.4)', () => {
  it('applies the discount before VAT: taxable = subtotal - discount', async () => {
    const lead = await seedLead();
    const proforma = await issueProforma(
      lead,
      LINES,
      undefined,
      100_000,
    );
    expect(proforma.subtotal).toBe(1_000_000);
    expect(proforma.discountToman).toBe(100_000);
    const expectedVat = Math.round(900_000 * proforma.vatRate);
    expect(proforma.vatAmount).toBe(expectedVat);
    expect(proforma.total).toBe(900_000 + expectedVat);
  });

  it('clamps a discount larger than the subtotal down to the subtotal (taxable never negative)', async () => {
    const lead = await seedLead();
    const proforma = await issueProforma(
      lead,
      LINES,
      undefined,
      5_000_000,
    );
    expect(proforma.discountToman).toBe(1_000_000);
    expect(proforma.vatAmount).toBe(0);
    expect(proforma.total).toBe(0);
  });

  it('clamps a negative discount up to zero', async () => {
    const lead = await seedLead();
    const proforma = await issueProforma(
      lead,
      LINES,
      undefined,
      -500,
    );
    expect(proforma.discountToman).toBe(0);
    expect(proforma.subtotal).toBe(1_000_000);
    expect(proforma.total).toBe(1_000_000 + Math.round(1_000_000 * proforma.vatRate));
  });

  it('defaults to zero discount when omitted (backward compatible)', async () => {
    const lead = await seedLead();
    const proforma = await issueProforma(
      lead,
      LINES,
    );
    expect(proforma.discountToman).toBe(0);
    expect(proforma.total).toBe(1_000_000 + Math.round(1_000_000 * proforma.vatRate));
  });
});
