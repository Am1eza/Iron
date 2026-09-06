// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  get: vi.fn(),
  consume: vi.fn(),
  create: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({ getSessionVerified: mocks.session }));
vi.mock('@/lib/server/ai/leadDraft', () => ({ getDraft: mocks.get, consumeDraft: mocks.consume }));
vi.mock('@/lib/server/services/leads.service', () => ({ createLead: mocks.create }));
vi.mock('@/lib/server/ai/conversation', () => ({ conversationForSales: vi.fn() }));
vi.mock('@/lib/server/ai/memory', () => ({ getMemory: vi.fn() }));
vi.mock('@/lib/server/utils/rateLimit', () => ({ rateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/server/utils/apiGuard', () => ({
  requireDb: () => null,
  withApiErrorHandling: (fn: unknown) => fn,
}));
import { POST } from './route';
function request() {
  return new NextRequest('https://example.test/api/ai/lead/confirm', {
    method: 'POST',
    headers: { host: 'example.test', origin: 'https://example.test' },
    body: JSON.stringify({ draftId: 'draft-1' }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ id: 'owner', mobile: '09121112222' });
  mocks.get.mockResolvedValue({ id: 'draft-1', userId: 'owner', items: [] });
});
it('rejects revoked/missing sessions before consuming a draft', async () => {
  mocks.session.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(401);
  expect(mocks.session).toHaveBeenCalledWith({ strict: true });
  expect(mocks.consume).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});
it('does not consume another users draft', async () => {
  mocks.get.mockResolvedValue({ id: 'draft-1', userId: 'other', items: [] });
  expect((await POST(request())).status).toBe(403);
  expect(mocks.consume).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});
it('reports an expired draft without creating a lead', async () => {
  mocks.get.mockResolvedValue(null);
  mocks.consume.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(410);
  expect(mocks.create).not.toHaveBeenCalled();
});
