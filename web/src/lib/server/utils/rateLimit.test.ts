// @vitest-environment node
/**
 * Client-IP bucketing regression, covering BOTH deployment topologies.
 *
 * Workers: verified live that on the deployed Cloudflare Worker,
 * X-Forwarded-For is absent during Worker execution (Cloudflare only appends
 * it in a later backend-proxy phase this app never reaches), so
 * CF-Connecting-IP must be checked first — locking that precedence in here
 * since it silently collapses every visitor into one shared bucket if it
 * regresses.
 *
 * Docker/Caddy: the same header must be IGNORED. The Caddyfile has no
 * `header_up -CF-Connecting-IP`, so a client-supplied value reaches the app
 * verbatim; trusting it there gave any caller a fresh bucket per request just
 * by varying one header, nullifying every per-IP limit — including the ones
 * metering paid SMS.ir sends and DeepSeek calls. The second test pins that down.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { rateLimit } from './rateLimit';

// `getCloudflareContext()` throws outside a Worker, and that throw is exactly
// how both `nativeLimited` and `clientIp` detect the runtime. Simulate each
// topology by toggling whether it resolves.
const { cfContext } = vi.hoisted(() => ({
  cfContext: { value: null as null | { env: Record<string, unknown> } },
}));

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => {
    if (!cfContext.value) throw new Error('no cloudflare context (not on Workers)');
    return cfContext.value;
  },
}));

function req(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/api/leads', { headers });
}

describe('rateLimit — client IP bucketing', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    cfContext.value = null; // default to Docker/Caddy — the production topology
  });

  it('buckets by CF-Connecting-IP when running on Workers', async () => {
    // Empty env → no RL_* binding for this scope, so `nativeLimited` returns
    // null and defers to the in-process window we are asserting on.
    cfContext.value = { env: {} };
    const scope = `cf-${Math.random()}`;
    const a = () => req({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '9.9.9.9' });
    const b = () => req({ 'cf-connecting-ip': '2.2.2.2', 'x-forwarded-for': '9.9.9.9' });
    // Same shared 9.9.9.9 XFF value would collide if XFF took precedence —
    // distinct cf-connecting-ip values must stay in independent buckets.
    for (let i = 0; i < 3; i++) expect(await rateLimit(a(), scope, { limit: 3 })).toBeNull();
    expect((await rateLimit(a(), scope, { limit: 3 }))?.status).toBe(429);
    expect(await rateLimit(b(), scope, { limit: 3 })).toBeNull();
  });

  it('ignores a spoofed CF-Connecting-IP off Workers (Docker/Caddy)', async () => {
    const scope = `cf-spoof-${Math.random()}`;
    // One real client behind Caddy, rotating the header on every request.
    const spoof = (n: number) =>
      req({ 'cf-connecting-ip': `10.0.0.${n}`, 'x-forwarded-for': '203.0.113.7' });
    for (let i = 1; i <= 3; i++) expect(await rateLimit(spoof(i), scope, { limit: 3 })).toBeNull();
    // A fourth distinct header value must NOT buy a fresh bucket — the
    // rightmost XFF hop (the one Caddy appended) is the real identity.
    expect((await rateLimit(spoof(4), scope, { limit: 3 }))?.status).toBe(429);
  });

  it('falls back to the rightmost X-Forwarded-For hop when CF-Connecting-IP is absent (Docker/Caddy topology)', async () => {
    const scope = `xff-${Math.random()}`;
    const spoofed = () => req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });
    for (let i = 0; i < 3; i++) expect(await rateLimit(spoofed(), scope, { limit: 3 })).toBeNull();
    expect((await rateLimit(spoofed(), scope, { limit: 3 }))?.status).toBe(429);
    // An attacker-chosen leftmost entry must not evade the bucket.
    const stillSpoofed = () => req({ 'x-forwarded-for': '9.9.9.9, 5.6.7.8' });
    expect((await rateLimit(stillSpoofed(), scope, { limit: 3 }))?.status).toBe(429);
  });

  it('TRUST_PROXY=false collapses to a single untrusted bucket regardless of headers', async () => {
    vi.stubEnv('TRUST_PROXY', 'false');
    const scope = `untrusted-${Math.random()}`;
    const a = () => req({ 'cf-connecting-ip': '1.1.1.1' });
    const b = () => req({ 'cf-connecting-ip': '2.2.2.2' });
    for (let i = 0; i < 3; i++) expect(await rateLimit(a(), scope, { limit: 3 })).toBeNull();
    expect((await rateLimit(b(), scope, { limit: 3 }))?.status).toBe(429);
  });

  it('DISABLE_RATE_LIMIT_FOR_TESTS is ignored when NODE_ENV=production', async () => {
    vi.stubEnv('DISABLE_RATE_LIMIT_FOR_TESTS', 'true');
    vi.stubEnv('NODE_ENV', 'production');
    const scope = `prod-bypass-${Math.random()}`;
    const c = () => req({ 'x-forwarded-for': '198.51.100.5' });
    for (let i = 0; i < 3; i++) expect(await rateLimit(c(), scope, { limit: 3 })).toBeNull();
    expect((await rateLimit(c(), scope, { limit: 3 }))?.status).toBe(429);
  });
});
