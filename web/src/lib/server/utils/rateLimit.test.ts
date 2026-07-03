// @vitest-environment node
/**
 * Client-IP bucketing regression: verified live that on the deployed
 * Cloudflare Worker, X-Forwarded-For is absent during Worker execution
 * (Cloudflare only appends it in a later backend-proxy phase this app
 * never reaches), so CF-Connecting-IP must be checked first — locking that
 * precedence in here since it silently collapses every visitor into one
 * shared bucket if it regresses.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { rateLimit } from './rateLimit';

function req(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/api/leads', { headers });
}

describe('rateLimit — client IP bucketing', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('buckets by CF-Connecting-IP when present (Cloudflare Workers topology)', () => {
    const scope = `cf-${Math.random()}`;
    const a = () => req({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '9.9.9.9' });
    const b = () => req({ 'cf-connecting-ip': '2.2.2.2', 'x-forwarded-for': '9.9.9.9' });
    // Same shared 9.9.9.9 XFF value would collide if XFF took precedence —
    // distinct cf-connecting-ip values must stay in independent buckets.
    for (let i = 0; i < 3; i++) expect(rateLimit(a(), scope, { limit: 3 })).toBeNull();
    expect(rateLimit(a(), scope, { limit: 3 })?.status).toBe(429);
    expect(rateLimit(b(), scope, { limit: 3 })).toBeNull();
  });

  it('falls back to the rightmost X-Forwarded-For hop when CF-Connecting-IP is absent (Docker/Caddy topology)', () => {
    const scope = `xff-${Math.random()}`;
    const spoofed = () => req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });
    for (let i = 0; i < 3; i++) expect(rateLimit(spoofed(), scope, { limit: 3 })).toBeNull();
    expect(rateLimit(spoofed(), scope, { limit: 3 })?.status).toBe(429);
    // An attacker-chosen leftmost entry must not evade the bucket.
    const stillSpoofed = () => req({ 'x-forwarded-for': '9.9.9.9, 5.6.7.8' });
    expect(rateLimit(stillSpoofed(), scope, { limit: 3 })?.status).toBe(429);
  });

  it('TRUST_PROXY=false collapses to a single untrusted bucket regardless of headers', () => {
    vi.stubEnv('TRUST_PROXY', 'false');
    const scope = `untrusted-${Math.random()}`;
    const a = () => req({ 'cf-connecting-ip': '1.1.1.1' });
    const b = () => req({ 'cf-connecting-ip': '2.2.2.2' });
    for (let i = 0; i < 3; i++) expect(rateLimit(a(), scope, { limit: 3 })).toBeNull();
    expect(rateLimit(b(), scope, { limit: 3 })?.status).toBe(429);
  });
});
