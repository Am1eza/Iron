// @vitest-environment node
/**
 * Item 96 — the expiry sweep must also notify the customer the moment a
 * proforma actually expires, not just 24h before (proformaReminder, a
 * separate job). Before this, `expireDueProformas()` only flipped `status`;
 * nothing ever called sendNotification for the expiry itself.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { ulid } from 'ulid';
import { eq } from 'drizzle-orm';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { resetCircuitBreakers } from '@/lib/server/utils/resilience';
import { insertProforma } from '@/lib/server/repos/leadsRepo';
import { bustSettingsCache } from '@/lib/server/repos/settingsRepo';
import { proformaExpireJob } from './proformaExpire.job';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
}, 120_000);
afterAll(async () => {
  await close();
});

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetCircuitBreakers();
  bustSettingsCache(); // settingsRepo caches SMS_AUTOMATIONS for 60s in-process
});

let seq = 0;
const nextRef = (prefix: string) => `${prefix}-${(seq += 1).toString().padStart(5, '0')}`;

async function seedLead(mobile: string) {
  const id = ulid();
  await db.insert(schema.leads).values({ id, ref: nextRef('LD'), contactMobile: mobile, source: 'table' });
  return id;
}

async function seedActiveProforma(leadId: string, validUntil: Date) {
  return insertProforma(
    { leadId, ref: nextRef('PF'), lines: [], subtotal: 1000, vatRate: 0.1, vatAmount: 100, total: 1100, validUntil },
    db,
  );
}

describe('proformaExpireJob', () => {
  it('flips a due proforma to expired AND sends exactly one expiry SMS, in the same run', async () => {
    const mobile = '09121240001';
    const leadId = await seedLead(mobile);
    const proforma = await seedActiveProforma(leadId, new Date(Date.now() - 60_000));

    await proformaExpireJob.run();

    const [row] = await db.select().from(schema.proformas).where(eq(schema.proformas.id, proforma.id));
    expect(row!.status).toBe('expired');

    const sms = await db.select().from(schema.smsLog).where(eq(schema.smsLog.to, mobile));
    expect(sms.filter((s) => (s.payload as { auto?: string } | null)?.auto === `pf-expired:${proforma.ref}`)).toHaveLength(1);
  });

  it('never sends a second expiry SMS for the same proforma across repeated ticks', async () => {
    const mobile = '09121240002';
    const leadId = await seedLead(mobile);
    const proforma = await seedActiveProforma(leadId, new Date(Date.now() - 60_000));

    await proformaExpireJob.run();
    await proformaExpireJob.run(); // second tick — proforma is already 'expired', still matches the SMS query window

    const sms = await db
      .select()
      .from(schema.smsLog)
      .where(eq(schema.smsLog.to, mobile));
    expect(sms.filter((s) => (s.payload as { auto?: string } | null)?.auto === `pf-expired:${proforma.ref}`)).toHaveLength(1);
  });

  it('does not touch a still-active proforma', async () => {
    const mobile = '09121240003';
    const leadId = await seedLead(mobile);
    await seedActiveProforma(leadId, new Date(Date.now() + 60 * 60 * 1000));

    await proformaExpireJob.run();

    const sms = await db.select().from(schema.smsLog).where(eq(schema.smsLog.to, mobile));
    expect(sms).toHaveLength(0);
  });

  it('respects SMS_AUTOMATIONS.proformaExpired === false', async () => {
    const mobile = '09121240004';
    await db.insert(schema.settings).values({
      key: 'SMS_AUTOMATIONS',
      value: { welcome: true, proformaReminder: true, proformaExpired: false, callbackReminder: true, weeklyReport: true },
    });
    const leadId = await seedLead(mobile);
    await seedActiveProforma(leadId, new Date(Date.now() - 60_000));

    await proformaExpireJob.run();

    const sms = await db.select().from(schema.smsLog).where(eq(schema.smsLog.to, mobile));
    expect(sms).toHaveLength(0);
  });
});
