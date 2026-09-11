// @vitest-environment node
/**
 * H-186 honeypot: a real visitor never sees/fills `website` (hidden
 * off-screen in ContactForm.tsx); a scripted submitter that autofills every
 * input often does. A filled honeypot must look like success to the caller
 * (no error a bot could learn from) while writing nothing.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { createTestDb } from '@/test/db';
import { contactMessages } from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';

vi.mock('@/lib/auth/origin', () => ({ assertSameOrigin: () => null }));
vi.mock('@/lib/server/utils/rateLimit', () => ({ rateLimit: async () => null }));

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(async () => {
  await close();
});

import { POST } from './route';

function req(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = { name: 'علی', mobile: '09121234567', message: 'سلام، یک سوال دارم.' };

describe('POST /api/contact — honeypot (H-186)', () => {
  it('a normal submission (empty honeypot) succeeds and writes a row', async () => {
    const res = await POST(req(validBody));
    expect(res.status).toBe(201);
    const rows = await db.select().from(contactMessages).where(eq(contactMessages.mobile, '09121234567'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.message).toBe(validBody.message);
  });

  it('a filled honeypot returns success but writes nothing', async () => {
    const res = await POST(req({ ...validBody, mobile: '09121234568', website: 'https://spam.example' }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    const rows = await db.select().from(contactMessages).where(eq(contactMessages.mobile, '09121234568'));
    expect(rows).toHaveLength(0);
  });
});
