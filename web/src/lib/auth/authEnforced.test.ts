import { describe, it, expect } from 'vitest';
import { resolveAuthEnforced } from './authEnforced';

describe('resolveAuthEnforced', () => {
  it('enforces when AUTH_ENFORCED is missing entirely', () => {
    // The Cloudflare Workers regression: the variable was never set there, and
    // the old `=== 'true'` check answered false, exposing the admin shell.
    expect(resolveAuthEnforced({ NODE_ENV: 'production' })).toBe(true);
    expect(resolveAuthEnforced({})).toBe(true);
  });

  it('enforces on an explicit true', () => {
    expect(resolveAuthEnforced({ AUTH_ENFORCED: 'true', NODE_ENV: 'production' })).toBe(true);
  });

  it('lets local dev opt out with an explicit false', () => {
    expect(resolveAuthEnforced({ AUTH_ENFORCED: 'false', NODE_ENV: 'development' })).toBe(false);
    expect(resolveAuthEnforced({ AUTH_ENFORCED: 'false' })).toBe(false);
  });

  it('refuses to open the gate in production even when told to', () => {
    expect(resolveAuthEnforced({ AUTH_ENFORCED: 'false', NODE_ENV: 'production' })).toBe(true);
  });

  it.each(['', 'FALSE', 'False', '0', 'no', 'off', 'undefined', ' false'])(
    'enforces for the unexpected value %j rather than failing open',
    (value) => {
      expect(resolveAuthEnforced({ AUTH_ENFORCED: value, NODE_ENV: 'production' })).toBe(true);
      expect(resolveAuthEnforced({ AUTH_ENFORCED: value, NODE_ENV: 'development' })).toBe(true);
    },
  );
});
