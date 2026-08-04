import { describe, it, expect } from 'vitest';
import { resolvePanelRouting, normalizeHost, isPanelHost, PANEL_HOSTNAME } from './panelHost';

/**
 * The host comparison gets its own suite because it is the single predicate the
 * admin area's "hidden, not redirected" contract rests on. Every case below is
 * a DIFFERENT SPELLING OF THE SAME HOST — if any of them disagreed with the
 * others, the panel would either be invisible to legitimate staff (the W29 e2e
 * blocker: `panel.ahantime.com:3100` never matched) or visible where it must
 * not be.
 */
describe('normalizeHost', () => {
  it.each([
    ['panel.ahantime.com', 'panel.ahantime.com'],
    // Port — the case that kept all six RBAC e2e tests on `fixme`.
    ['panel.ahantime.com:3100', 'panel.ahantime.com'],
    ['panel.ahantime.com:443', 'panel.ahantime.com'],
    ['panel.ahantime.com:80', 'panel.ahantime.com'],
    // Case — DNS names are case-insensitive.
    ['PANEL.AHANTIME.COM', 'panel.ahantime.com'],
    ['Panel.Ahantime.Com:3100', 'panel.ahantime.com'],
    // Trailing root dot — the fully-qualified spelling of the same name.
    ['panel.ahantime.com.', 'panel.ahantime.com'],
    ['panel.ahantime.com.:3100', 'panel.ahantime.com'],
    // Whitespace a proxy may leave behind.
    ['  panel.ahantime.com:3100  ', 'panel.ahantime.com'],
    // IPv6 literals: bracket-aware. Splitting on the FIRST colon would turn
    // `[::1]:3100` into `[` — a different "host" entirely.
    ['[::1]', '[::1]'],
    ['[::1]:3100', '[::1]'],
    ['[2001:db8::1]:8443', '[2001:db8::1]'],
    ['[::1]', '[::1]'],
    // IPv4 + port.
    ['127.0.0.1:3100', '127.0.0.1'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeHost(raw)).toBe(expected);
  });

  it.each([null, undefined, '', '   '])('%s → null', (raw) => {
    expect(normalizeHost(raw)).toBeNull();
  });

  it('leaves an unbracketed IPv6 literal whole rather than truncating it', () => {
    // Illegal in a Host header. It must fail to match, not silently become
    // "2001" (which is what splitting on the first colon would produce).
    expect(normalizeHost('2001:db8::1')).toBe('2001:db8::1');
  });

  it('does not strip more than one trailing dot', () => {
    expect(normalizeHost('panel.ahantime.com..')).toBe('panel.ahantime.com.');
  });

  it('is idempotent', () => {
    const once = normalizeHost('PANEL.Ahantime.com.:3100')!;
    expect(normalizeHost(once)).toBe(once);
  });
});

describe('isPanelHost', () => {
  it.each([
    'panel.ahantime.com',
    'panel.ahantime.com:3100',
    'PANEL.AHANTIME.COM',
    'panel.ahantime.com.',
    'Panel.Ahantime.Com.:3100',
  ])('%s is the panel host', (host) => {
    expect(isPanelHost(host)).toBe(true);
  });

  it.each([
    'ahantime.com',
    'ahantime.com:3100',
    // A look-alike must NOT match: these would expose the admin area on a
    // host an attacker can choose.
    'panel.ahantime.com.evil.test',
    'evil.test',
    'notpanel.ahantime.com',
    'panel.ahantime.com.evil.test:443',
    'xpanel.ahantime.com',
    '127.0.0.1:3100',
    '[::1]:3100',
    null,
    '',
  ])('%s is NOT the panel host', (host) => {
    expect(isPanelHost(host)).toBe(false);
  });

  it('agrees with resolvePanelRouting for every spelling', () => {
    for (const host of [PANEL_HOSTNAME, `${PANEL_HOSTNAME}:3100`, PANEL_HOSTNAME.toUpperCase(), `${PANEL_HOSTNAME}.`]) {
      expect(resolvePanelRouting(host, '/leads').shouldPrefix).toBe(isPanelHost(host));
    }
  });
});

describe('resolvePanelRouting', () => {
  it('prefixes on the panel host WITH a port — the e2e harness case (W29)', () => {
    expect(resolvePanelRouting('panel.ahantime.com:3100', '/leads')).toEqual({
      shouldPrefix: true,
      effectivePathname: '/admin/leads',
    });
  });

  it('rewrites /login to the panel login on the panel host with a port', () => {
    expect(resolvePanelRouting('panel.ahantime.com:3100', '/login')).toEqual({
      shouldPrefix: true,
      effectivePathname: '/panel-login',
    });
  });

  it('a look-alike host with a port is still not the panel', () => {
    expect(resolvePanelRouting('panel.ahantime.com.evil.test:3100', '/leads')).toEqual({
      shouldPrefix: false,
      effectivePathname: '/leads',
    });
  });

  it('does nothing off the panel host', () => {
    expect(resolvePanelRouting('ahantime.com', '/leads')).toEqual({
      shouldPrefix: false,
      effectivePathname: '/leads',
    });
  });

  it('does nothing for a null host', () => {
    expect(resolvePanelRouting(null, '/leads')).toEqual({ shouldPrefix: false, effectivePathname: '/leads' });
  });

  it('prefixes an ordinary path on the panel host', () => {
    expect(resolvePanelRouting('panel.ahantime.com', '/leads')).toEqual({
      shouldPrefix: true,
      effectivePathname: '/admin/leads',
    });
  });

  it('maps the panel root to /admin exactly, not /admin/', () => {
    expect(resolvePanelRouting('panel.ahantime.com', '/')).toEqual({
      shouldPrefix: true,
      effectivePathname: '/admin',
    });
  });

  it.each(['/api/admin/leads', '/admin/leads', '/panel-login', '/_next/data/x.json'])(
    'leaves a passthrough path %s unprefixed on the panel host',
    (path) => {
      expect(resolvePanelRouting('panel.ahantime.com', path)).toEqual({
        shouldPrefix: false,
        effectivePathname: path,
      });
    },
  );

  it.each(['/login', '/login/anything'])('rewrites %s to the dedicated panel login on the panel host', (path) => {
    expect(resolvePanelRouting('panel.ahantime.com', path)).toEqual({
      shouldPrefix: true,
      effectivePathname: '/panel-login',
    });
  });

  it('leaves /login alone on the public host', () => {
    expect(resolvePanelRouting('ahantime.com', '/login')).toEqual({
      shouldPrefix: false,
      effectivePathname: '/login',
    });
  });

  it('a path that merely starts with a passthrough word (not the full segment) is still prefixed', () => {
    // '/logintest' is NOT '/login' or a path under it — segment matching
    // (not a bare string startsWith) must not treat it as the shared login
    // page just because the string happens to start with "login".
    expect(resolvePanelRouting('panel.ahantime.com', '/logintest').effectivePathname).toBe('/admin/logintest');
  });
});

describe('root-level files are never panel pages', () => {
  it.each(['/theme-init.js', '/locale-init.js', '/sitemap.xml', '/robots.txt', '/favicon.ico'])(
    '%s is passed through on the panel host, not prefixed into /admin',
    (path) => {
      // These are served from public/ and are NOT in the middleware matcher's
      // exclusion list. Prefixing them made `/admin/theme-init.js` hit the
      // admin gate and 307 to /api/auth/silent, so the theme/locale bootstrap
      // scripts never loaded on panel.ahantime.com — a hydration mismatch on
      // every panel page for a logged-out visitor.
      expect(resolvePanelRouting('panel.ahantime.com:3100', path)).toEqual({
        shouldPrefix: false,
        effectivePathname: path,
      });
    },
  );

  it('a normal panel path is still prefixed', () => {
    expect(resolvePanelRouting('panel.ahantime.com', '/leads').shouldPrefix).toBe(true);
    expect(resolvePanelRouting('panel.ahantime.com', '/prices/rebar').shouldPrefix).toBe(true);
  });
});
