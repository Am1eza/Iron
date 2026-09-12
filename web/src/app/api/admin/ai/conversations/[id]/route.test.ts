// @vitest-environment node
/**
 * J-227: `ai:review` is admin-only already, but the endpoint itself only ever
 * checked that the conversation id resolved to a real row — not that it was
 * actually reached through real customer feedback (👍/👎), which is the ONLY
 * path the review UI itself uses. An admin who knew/guessed a conversation
 * ULID could read any customer's full thread with no audit trail besides
 * their own admin access. This pins the fix: conversationHasFeedback is now
 * required alongside conversationExists, with the same non-disclosure shape
 * (404 either way — "doesn't exist" and "exists but never flagged" must
 * look identical from outside).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  conversationExists: vi.fn(),
  conversationHasFeedback: vi.fn(),
  conversationThread: vi.fn(),
}));
vi.mock('@/lib/server/utils/apiGuard', () => ({
  requireDb: () => null,
  requireApiPermission: async () => ({ session: { id: 'admin-1', role: 'admin' } }),
  withApiErrorHandling: (handler: unknown) => handler,
}));
vi.mock('@/lib/server/repos/aiReviewRepo', () => ({
  conversationExists: mocks.conversationExists,
  conversationHasFeedback: mocks.conversationHasFeedback,
  conversationThread: mocks.conversationThread,
}));

function request(id: string) {
  return new NextRequest(`https://example.test/api/admin/ai/conversations/${id}`, {
    headers: { host: 'example.test', origin: 'https://example.test' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/admin/ai/conversations/[id]', () => {
  it('404s a conversation id that does not exist at all', async () => {
    const { GET } = await import('./route');
    mocks.conversationExists.mockResolvedValue(false);
    mocks.conversationHasFeedback.mockResolvedValue(false);
    const res = await GET(request('missing'), { params: Promise.resolve({ id: 'missing' }) });
    expect(res.status).toBe(404);
    expect(mocks.conversationThread).not.toHaveBeenCalled();
  });

  it('404s a REAL conversation that was never flagged via feedback — the actual gap', async () => {
    const { GET } = await import('./route');
    mocks.conversationExists.mockResolvedValue(true);
    mocks.conversationHasFeedback.mockResolvedValue(false);
    const res = await GET(request('conv-1'), { params: Promise.resolve({ id: 'conv-1' }) });
    expect(res.status).toBe(404);
    expect(mocks.conversationThread).not.toHaveBeenCalled();
  });

  it('serves the thread for a real conversation that IS linked to feedback', async () => {
    const { GET } = await import('./route');
    mocks.conversationExists.mockResolvedValue(true);
    mocks.conversationHasFeedback.mockResolvedValue(true);
    mocks.conversationThread.mockResolvedValue([
      { id: 'm1', role: 'user', content: 'سلام', createdAt: new Date() },
    ]);
    const res = await GET(request('conv-1'), { params: Promise.resolve({ id: 'conv-1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toHaveLength(1);
    expect(mocks.conversationThread).toHaveBeenCalledWith('conv-1');
  });
});
