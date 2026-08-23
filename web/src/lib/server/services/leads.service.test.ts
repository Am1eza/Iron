// @vitest-environment node
/** issueProforma's discount math:
 *   - US-19.4  — the rep's flat Toman amount off subtotal, before VAT.
 *   - تخفیف پلکانی — the rule-based volume band from `config/pricingTiers`,
 *                    taken FIRST, with the manual figure clamped into what
 *                    is left. Both come off before VAT.
 *
 *  The LINES below carry no `weightKg`, so every pre-existing case resolves
 *  to the base band (0%) and pins the unchanged behaviour; the volume cases
 *  add their own weighted lines. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ulid } from 'ulid';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { issueProforma } from './leads.service';
import { findLead, type LeadRow } from '@/lib/server/repos/leadsRepo';
import { KG_PER_TON } from '@/lib/config/pricingTiers';
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

/** A lead owned by a real account, so the verified-business arm of the tier
 *  structure can be exercised end to end against the same `biz_verify_status`
 *  column the «حساب سازمانی تأییدشده» badge reads. */
async function seedLeadForUser(bizVerifyStatus: 'none' | 'pending' | 'approved'): Promise<LeadRow> {
  const userId = ulid();
  await db.insert(schema.users).values({
    id: userId,
    mobile: `0912${String(Date.now()).slice(-7)}`,
    bizVerifyStatus,
  });
  const id = ulid();
  await db.insert(schema.leads).values({
    id,
    ref: `PF-TEST-${id}`,
    userId,
    contactMobile: '09120000003',
    source: 'table',
  });
  return (await findLead(id))!;
}

/** 10,000,000 Toman of steel weighing `kg` — the shape every tier case uses,
 *  so only the tonnage varies between them. */
const weighedLines = (kg: number): LineItem[] => [
  { skuId: 's1', name: 'میلگرد ۱۴', qty: kg, unit: 'kg', weightKg: kg, lineTotal: 10_000_000 },
];

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

  // The customer-facing /proforma/[ref] sheet prints these fields verbatim, so
  // they must reconcile on paper. Before US-19.4's display fix the page showed
  // only subtotal/vat/total, which do NOT add up once a discount exists — a
  // buyer's accountant reading the sheet saw an arithmetic error. This pins the
  // exact identity the page now renders.
  it('keeps the printed identity subtotal − discount + vat === total', async () => {
    const lead = await seedLead();
    const proforma = await issueProforma(lead, LINES, undefined, 250_000);
    expect(proforma.subtotal - proforma.discountToman + proforma.vatAmount).toBe(proforma.total);
    // and the printed VAT percentage must be true of the printed taxable base,
    // not of the subtotal — that's why the sheet shows «مبلغ مشمول مالیات».
    const taxable = proforma.subtotal - proforma.discountToman;
    expect(proforma.vatAmount).toBe(Math.round(taxable * proforma.vatRate));
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

describe('issueProforma — تخفیف پلکانی (volume tiers)', () => {
  it('grants nothing under 5 tons: the published price is the price', async () => {
    const p = await issueProforma(await seedLead(), weighedLines(4_999));
    expect(p.volumeDiscountToman).toBe(0);
    expect(p.volumeTier).toBeNull();
    expect(p.volumeDiscountLabel).toBeNull();
    expect(p.total).toBe(10_000_000 + Math.round(10_000_000 * p.vatRate));
  });

  it('grants the bulk band at EXACTLY 5 tons', async () => {
    const p = await issueProforma(await seedLead(), weighedLines(5 * KG_PER_TON));
    expect(p.volumeTier).toBe('bulk');
    expect(p.volumeDiscountToman).toBe(150_000); // 1.5% of 10,000,000
    expect(p.quotedWeightKg).toBe(5_000);
    expect(p.volumeDiscountLabel).toBe('تخفیف عمده (۱٫۵٪)');
  });

  it('grants the enterprise band at EXACTLY 20 tons', async () => {
    const p = await issueProforma(await seedLead(), weighedLines(20 * KG_PER_TON));
    expect(p.volumeTier).toBe('enterprise');
    expect(p.volumeDiscountToman).toBe(250_000); // 2.5%
    expect(p.volumeDiscountLabel).toBe('تخفیف عمده (۲٫۵٪)');
  });

  it('stays in bulk one kilogram under 20 tons', async () => {
    const p = await issueProforma(await seedLead(), weighedLines(20 * KG_PER_TON - 1));
    expect(p.volumeTier).toBe('bulk');
  });

  it('applies the band BEFORE VAT — subtotal − discount + vat === total', async () => {
    const p = await issueProforma(await seedLead(), weighedLines(10 * KG_PER_TON));
    const taxable = p.subtotal - p.volumeDiscountToman - p.discountToman;
    expect(p.vatAmount).toBe(Math.round(taxable * p.vatRate));
    expect(taxable + p.vatAmount).toBe(p.total);
  });

  it('lifts a verified business account to the enterprise band on a SMALL order', async () => {
    const lead = await seedLeadForUser('approved');
    const p = await issueProforma(lead, weighedLines(100));
    expect(p.volumeTier).toBe('enterprise');
    expect(p.volumeDiscountToman).toBe(250_000);
    // The printed reason must name the account, not tonnage the order lacks.
    expect(p.volumeDiscountLabel).toBe('تخفیف حساب سازمانی (۲٫۵٪)');
  });

  it('does NOT lift a PENDING business verification', async () => {
    const lead = await seedLeadForUser('pending');
    const p = await issueProforma(lead, weighedLines(100));
    expect(p.volumeDiscountToman).toBe(0);
    expect(p.volumeTier).toBeNull();
  });

  it('gives an UNVERIFIED buyer the enterprise band on tonnage alone', async () => {
    const lead = await seedLeadForUser('none');
    const p = await issueProforma(lead, weighedLines(25 * KG_PER_TON));
    expect(p.volumeTier).toBe('enterprise');
    expect(p.volumeDiscountLabel).toBe('تخفیف عمده (۲٫۵٪)');
  });

  it('keeps the tier discount whole when the rep types an oversized manual one', async () => {
    const p = await issueProforma(await seedLead(), weighedLines(20 * KG_PER_TON), undefined, 99_000_000);
    expect(p.volumeDiscountToman).toBe(250_000);
    expect(p.discountToman).toBe(9_750_000);
    expect(p.total).toBe(0);
  });

  it('ignores the weight of lines that carry no weightKg (never invents tonnage)', async () => {
    const p = await issueProforma(await seedLead(), [
      { skuId: 's1', name: 'ورق توافقی', qty: 40, unit: 'kg', lineTotal: 10_000_000 },
    ]);
    expect(p.quotedWeightKg).toBeNull();
    expect(p.volumeDiscountToman).toBe(0);
  });
});
