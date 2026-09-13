// @vitest-environment node
/**
 * J-228: there was no user-facing way to delete an AI conversation — only
 * `cleanup.job.ts`'s 90-day auto-purge. This drives the real DELETE handler
 * against a real (pglite) DB, seeding rows directly, so "the row is actually
 * gone" is a real assertion rather than a mocked one, and pins the same
 * ownership rule the GET on this route already has: someone else's id 404s,
 * it is never leaked as a 403.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { createTestDb } from '@/test/db';
import { getDb } from '@/lib/server/db/client';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';

const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getSessionVerified: mocks.session }));

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(async () => {
  await close();
});

async function seedUser(id: string, mobile: string) {
  await db.insert(schema.users).values({ id, mobile, role: 'customer' });
}

async function seedConversation(id: string, userId: string) {
  await db.insert(schema.aiConversations).values({ id, userId });
  await db.insert(schema.aiMessages).values({
    id: ulid(),
    conversationId: id,
    role: 'user',
    content: 'سلام',
  });
}

function deleteRequest(id: string) {
  return new NextRequest(`https://example.test/api/ai/conversations/${id}`, {
    method: 'DELETE',
    headers: { host: 'example.test', origin: 'https://example.test' },
  });
}

function getRequest(id: string) {
  return new NextRequest(`https://example.test/api/ai/conversations/${id}`, {
    method: 'GET',
    headers: { host: 'example.test' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * J-226. The DELETE tests below say they "pin the same ownership rule the GET
 * on this route already has" — but nothing was actually driving GET, so that
 * rule was asserted only by assertion. Reading someone else's thread is the
 * more serious of the two failures (DELETE at worst destroys your own data;
 * GET hands over a stranger's conversation, mobile-number context and all),
 * so it gets its own tests rather than riding on DELETE's.
 */
describe('GET /api/ai/conversations/[id]', () => {
  it("404s (never 403) another user's conversation, and returns none of its content", async () => {
    await seedUser('g-owner', '09121112001');
    await seedUser('g-other', '09121112002');
    await seedConversation('conv-get-cross', 'g-other');
    mocks.session.mockResolvedValue({ id: 'g-owner', mobile: '09121112001' });

    const { GET } = await import('./route');
    const res = await GET(getRequest('conv-get-cross'), {
      params: Promise.resolve({ id: 'conv-get-cross' }),
    });
    // 403 would confirm the id exists — an enumeration oracle over other
    // people's threads. 404 is indistinguishable from "never existed".
    expect(res.status).toBe(404);

    const body = await res.text();
    expect(body).not.toContain('سلام'); // the seeded message content
    expect(body).not.toContain('g-other');
  });

  it('404s an id that never existed, identically to the cross-user case', async () => {
    mocks.session.mockResolvedValue({ id: 'g-owner', mobile: '09121112001' });
    const { GET } = await import('./route');
    const res = await GET(getRequest('conv-get-missing'), {
      params: Promise.resolve({ id: 'conv-get-missing' }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found', message: 'این گفتگو پیدا نشد.' });
  });

  it('rejects an unauthenticated read', async () => {
    mocks.session.mockResolvedValue(null);
    const { GET } = await import('./route');
    const res = await GET(getRequest('conv-get-cross'), {
      params: Promise.resolve({ id: 'conv-get-cross' }),
    });
    expect(res.status).toBe(401);
  });

  it("returns the caller's own thread, and keeps it out of every cache", async () => {
    await seedConversation('conv-get-mine', 'g-owner');
    mocks.session.mockResolvedValue({ id: 'g-owner', mobile: '09121112001' });

    const { GET } = await import('./route');
    const res = await GET(getRequest('conv-get-mine'), {
      params: Promise.resolve({ id: 'conv-get-mine' }),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { id: string; messages: Array<{ content: string }> };
    expect(body.id).toBe('conv-get-mine');
    expect(body.messages.map((m) => m.content)).toContain('سلام');
    // Cloudflare fronts this origin; a shared cache holding one customer's
    // conversation would serve it to the next person on the same edge.
    expect(res.headers.get('Cache-Control')).toContain('private');
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });
});

describe('DELETE /api/ai/conversations/[id]', () => {
  it('404s (never 403) a conversation belonging to another user, and leaves it in the DB', async () => {
    await seedUser('owner-1', '09121110001');
    await seedUser('other-1', '09121110002');
    await seedConversation('conv-cross', 'other-1');
    mocks.session.mockResolvedValue({ id: 'owner-1', mobile: '09121110001' });

    const { DELETE } = await import('./route');
    const res = await DELETE(deleteRequest('conv-cross'), {
      params: Promise.resolve({ id: 'conv-cross' }),
    });
    expect(res.status).toBe(404);

    const [row] = await getDb()
      .select()
      .from(schema.aiConversations)
      .where(eq(schema.aiConversations.id, 'conv-cross'));
    expect(row).toBeDefined();
  });

  it('404s an id that never existed at all', async () => {
    mocks.session.mockResolvedValue({ id: 'owner-1', mobile: '09121110001' });
    const { DELETE } = await import('./route');
    const res = await DELETE(deleteRequest('never-existed'), {
      params: Promise.resolve({ id: 'never-existed' }),
    });
    expect(res.status).toBe(404);
  });

  it('rejects an unauthenticated request before touching the DB', async () => {
    mocks.session.mockResolvedValue(null);
    const { DELETE } = await import('./route');
    const res = await DELETE(deleteRequest('conv-cross'), {
      params: Promise.resolve({ id: 'conv-cross' }),
    });
    expect(res.status).toBe(401);
  });

  it('deletes the caller’s own conversation — the row and its messages are actually gone', async () => {
    await seedConversation('conv-mine', 'owner-1');
    mocks.session.mockResolvedValue({ id: 'owner-1', mobile: '09121110001' });

    const { DELETE } = await import('./route');
    const res = await DELETE(deleteRequest('conv-mine'), {
      params: Promise.resolve({ id: 'conv-mine' }),
    });
    expect(res.status).toBe(204);

    const [convRow] = await getDb()
      .select()
      .from(schema.aiConversations)
      .where(eq(schema.aiConversations.id, 'conv-mine'));
    expect(convRow).toBeUndefined();

    const messageRows = await getDb()
      .select()
      .from(schema.aiMessages)
      .where(eq(schema.aiMessages.conversationId, 'conv-mine'));
    expect(messageRows).toHaveLength(0);
  });
});
