// @vitest-environment node
/**
 * H-185 — 91 of 94 /api/admin/** routes had no independent rate limit of
 * their own; only a valid session+permission stood between a stolen/rogue
 * staff token and hammering something expensive at unlimited speed.
 * requireApiPermission() now applies a shared generous default. This test
 * deliberately does NOT mock rateLimit — it proves the real integration
 * (in-process fallback path, since Redis/DB aren't configured in this test
 * env, same as any other rate-limit test in this repo that exercises the
 * fallback tier), not just that the two modules are wired together.
 */
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

const SESSION_A = { id: 'admin-rl-test-a', mobile: '09120000010', role: 'admin' as const };
const SESSION_B = { id: 'admin-rl-test-b', mobile: '09120000011', role: 'admin' as const };
let currentSession: typeof SESSION_A | typeof SESSION_B = SESSION_A;

vi.mock('@/lib/auth/session', () => ({ getSessionVerified: async () => currentSession }));

import { requireApiPermission } from './apiGuard';

function get() {
  return new NextRequest('http://localhost/api/admin/whatever');
}

describe('requireApiPermission — shared admin default rate limit (H-185)', () => {
  it('allows ordinary admin traffic (well under the 120/min default) through', async () => {
    currentSession = SESSION_A;
    for (let i = 0; i < 5; i++) {
      const result = await requireApiPermission(get(), 'leads:read');
      expect('session' in result, `request ${i}`).toBe(true);
    }
  });

  it('caps ONE session at 120/min and returns a real 429, not a silent pass', async () => {
    currentSession = SESSION_B;
    let limited = false;
    for (let i = 0; i < 121; i++) {
      const result = await requireApiPermission(get(), 'leads:read');
      if ('response' in result) {
        expect(result.response.status).toBe(429);
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });

  it("a DIFFERENT session's quota is untouched by session B's exhaustion above", async () => {
    currentSession = SESSION_A;
    // Session A already made 5 requests in the first test; it should still
    // have most of its 120 left, proving the key is per-session, not global.
    const result = await requireApiPermission(get(), 'leads:read');
    expect('session' in result).toBe(true);
  });
});
