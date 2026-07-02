// @vitest-environment node
/**
 * P3 integration — the conversion spine on pglite: lead → priced lines →
 * auto-issued پیش‌فاکتور (VAT, validity) → SMS dev-log → account-inbox mirror,
 * plus refs, cooperation leads, orders/tracking and the requests import.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '@/test/db';
import { seedDatabase } from '@/lib/server/db/seed';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { tableRows } from '@/lib/server/repos/catalogRepo';
import { createLead } from '@/lib/server/services/leads.service';
import { findProformaByRef } from '@/lib/server/repos/leadsRepo';
import { requestsForUser, insertRequest } from '@/lib/server/repos/requestsRepo';
import { createOrder, findOrderByRef, updateOrderStatus } from '@/lib/server/repos/ordersRepo';
import { nextRef } from '@/lib/server/utils/refs';
import { quoteValidUntil, jalaliStamp } from '@/lib/server/utils/jalali';
import type { AuthUser } from '@/lib/auth/types';

let db: Db;
let close: () => Promise<void>;
const user: AuthUser = {
  id: 'u-admin',
  mobile: '09120000000',
  name: 'مدیر سیستم',
  role: 'admin',
  createdAt: new Date(0).toISOString(),
};

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seedDatabase(db, { historyDays: 3 });
}, 120_000);
afterAll(async () => {
  await close();
});

describe('refs & validity', () => {
  it('generates PF-{jalali}-{seq}-{random} refs with an atomic per-day sequence', async () => {
    const a = await nextRef('PF');
    const b = await nextRef('PF');
    const stamp = jalaliStamp(new Date());
    // The trailing random suffix is the actual unguessability guarantee for
    // the public proforma/track lookup endpoints (see refs.ts) — assert the
    // sequence prefix deterministically, the suffix only by shape.
    expect(a).toMatch(new RegExp(`^PF-${stamp}-0001-[A-Z2-9]{6}$`));
    expect(b).toMatch(new RegExp(`^PF-${stamp}-0002-[A-Z2-9]{6}$`));
    expect(a).not.toBe(b);
  });

  it('quoteValidUntil lands on a business day at 11:00 Tehran', () => {
    // Thursday 2026-07-02 → next business day is Saturday (Friday skipped).
    const thu = new Date('2026-07-02T10:00:00.000Z');
    const until = quoteValidUntil(thu, new Set(), 11);
    expect(until.getTime()).toBeGreaterThan(thu.getTime());
    // 11:00 Tehran == 07:30 UTC
    expect(until.toISOString()).toContain('T07:30:00');
    expect(until.getUTCDay()).not.toBe(5); // not Friday
  });
});

describe('lead → proforma flow', () => {
  it('creates the lead, auto-issues the proforma, SMS-logs and mirrors the inbox', async () => {
    const rows = await tableRows('rebar');
    const items = rows.slice(0, 2).map((r) => ({ skuId: r.id, qty: 10, unit: r.unit }));

    const result = await createLead(
      { contact: { name: 'مدیر سیستم', mobile: user.mobile }, items, channel: 'sms', source: 'cart' },
      user,
    );

    expect(result.ref).toMatch(/^PF-\d{8}-\d{4}-[A-Z2-9]{6}$/);
    expect(result.proformaRef).toBe(result.ref); // first issue reuses the lead ref
    expect(result.total).toBeGreaterThan(0);

    // Proforma persisted with VAT math.
    const p = await findProformaByRef(result.ref);
    expect(p).not.toBeNull();
    expect(p!.total).toBe(p!.subtotal + p!.vatAmount);
    expect(p!.status).toBe('active');
    expect(p!.lines).toHaveLength(2);

    // SMS dev-logged.
    const sms = await db.select().from(schema.smsLog).where(eq(schema.smsLog.to, user.mobile));
    expect(sms.some((s) => s.kind === 'proforma' && s.status === 'dev_logged')).toBe(true);

    // Account inbox mirrored as quoted.
    const inbox = await requestsForUser(user.id);
    expect(inbox.some((r) => r.ref === result.ref && r.status === 'quoted')).toBe(true);

    // Lead row verified (session mobile match).
    const lead = await db.select().from(schema.leads).where(eq(schema.leads.ref, result.ref));
    expect(lead[0]!.contactVerified).toBe(true);
    expect(lead[0]!.source).toBe('cart');
  });

  it('skips the proforma when a line is unpriced (sales follows up)', async () => {
    const rows = await tableRows('rebar');
    const sku = rows[5]!;
    await db.delete(schema.currentPrices).where(eq(schema.currentPrices.skuId, sku.id));

    const result = await createLead(
      { contact: { mobile: '09121111111' }, items: [{ skuId: sku.id, qty: 5, unit: sku.unit }], source: 'table' },
      null,
    );
    expect(result.proformaRef).toBeUndefined();
    const p = await findProformaByRef(result.ref);
    expect(p).toBeNull();
  });
});

describe('orders & tracking', () => {
  it('creates an order and finds it by normalized ref (Persian digits ok)', async () => {
    const ref = await nextRef('OR');
    await createOrder({
      ref,
      userId: user.id,
      items: [{ skuId: '', name: 'میلگرد ۱۴', qty: 10, unit: 'branch' }],
    });
    const persianRef = ref.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!);
    const found = await findOrderByRef(persianRef);
    expect(found?.ref).toBe(ref);
    expect(found?.status).toBe('registered');

    const advanced = await updateOrderStatus(ref, 'in_transit');
    expect(advanced?.status).toBe('in_transit');
  });
});

describe('requests inbox', () => {
  it('imports legacy localStorage refs idempotently', async () => {
    const first = await insertRequest({ userId: user.id, ref: 'RQ-LEGACY-1', type: 'bulk', title: 'خرید عمده' });
    const dupe = await insertRequest({ userId: user.id, ref: 'RQ-LEGACY-1', type: 'bulk', title: 'خرید عمده' });
    expect(first).not.toBeNull();
    expect(dupe).toBeNull(); // ON CONFLICT DO NOTHING
  });
});
