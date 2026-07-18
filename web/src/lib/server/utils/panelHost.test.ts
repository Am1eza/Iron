import { describe, it, expect } from 'vitest';
import { resolvePanelRouting } from './panelHost';

describe('resolvePanelRouting', () => {
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

  it.each(['/api/admin/leads', '/login', '/admin/leads', '/_next/data/x.json'])(
    'leaves a passthrough path %s unprefixed on the panel host',
    (path) => {
      expect(resolvePanelRouting('panel.ahantime.com', path)).toEqual({
        shouldPrefix: false,
        effectivePathname: path,
      });
    },
  );

  it('a path that merely starts with a passthrough word (not the full segment) is still prefixed', () => {
    // '/logintest' is NOT '/login' or a path under it — segment matching
    // (not a bare string startsWith) must not treat it as the shared login
    // page just because the string happens to start with "login".
    expect(resolvePanelRouting('panel.ahantime.com', '/logintest').effectivePathname).toBe('/admin/logintest');
  });
});
