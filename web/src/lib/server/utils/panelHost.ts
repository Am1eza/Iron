/**
 * panel.ahantime.com routing decision — pure logic, kept out of
 * middleware.ts so it's independently testable (middleware.ts itself is
 * hard to unit test directly: it needs a real NextRequest, and — after
 * today's not-found.tsx lesson about Next's restricted per-file export
 * surfaces — an extra export there is a build-time risk not worth taking
 * for something this cheap to isolate).
 */
export const PANEL_HOSTNAME = 'panel.ahantime.com';
const PANEL_PASSTHROUGH_PREFIXES = ['/api', '/admin', '/panel-login', '/_next'];

export interface PanelRoutingDecision {
  /** True when this request should be rewritten to its /admin/* counterpart. */
  shouldPrefix: boolean;
  /** The internal routing path — unchanged unless shouldPrefix is true. */
  effectivePathname: string;
}

/** `host` — the raw `Host` request header value (may include a port; a bare
 *  hostname match against PANEL_HOSTNAME is intentional — this deployment
 *  never puts the panel behind a non-standard port). */
/** Exact segment match — `/login` must match `/login` and `/login/x`, but
 *  NOT `/logintest` (a bare `startsWith` would wrongly treat that as the
 *  shared login page instead of prefixing it to `/admin/logintest`). */
function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function resolvePanelRouting(host: string | null, pathname: string): PanelRoutingDecision {
  const onPanelHost = host === PANEL_HOSTNAME;
  // The panel host gets its OWN login page — a chrome-free staff entrance
  // (app/panel-login) instead of the public storefront's /login, which
  // renders the full customer ticker/navbar/footer around the form. The
  // browser URL stays panel.ahantime.com/login; only the internal route
  // differs. (`shouldPrefix` really means "should rewrite" here.)
  if (onPanelHost && matchesPrefix(pathname, '/login')) {
    return { shouldPrefix: true, effectivePathname: '/panel-login' };
  }
  const shouldPrefix = onPanelHost && !PANEL_PASSTHROUGH_PREFIXES.some((p) => matchesPrefix(pathname, p));
  if (!shouldPrefix) return { shouldPrefix: false, effectivePathname: pathname };
  // Root `/` → `/admin` exactly (not `/admin/`, which a rewrite target
  // doesn't auto-normalize the way a real navigation's trailing-slash
  // handling would).
  return { shouldPrefix: true, effectivePathname: pathname === '/' ? '/admin' : `/admin${pathname}` };
}
