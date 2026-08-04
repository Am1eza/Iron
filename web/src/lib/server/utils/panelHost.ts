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

/**
 * Normalize a raw `Host` header to a comparable hostname.
 *
 * This used to not exist: the raw header was compared to PANEL_HOSTNAME with
 * `===`, on the stated assumption that the panel never sits behind a
 * non-standard port. It does in one place that matters — the e2e harness — and
 * that single `===` is why all six RBAC tests were `fixme` and authorization
 * had zero end-to-end signal (W29, audit area 29).
 *
 * Everything here is a form of the SAME host that a comparison must not
 * disagree about:
 *   - `panel.ahantime.com:3100` — a port is not part of the hostname.
 *   - `PANEL.Ahantime.com`      — DNS names are case-insensitive.
 *   - `panel.ahantime.com.`     — the fully-qualified (root-labelled) form.
 *   - `[::1]:3100` / `[::1]`    — an IPv6 literal is bracketed, and only a
 *                                 colon AFTER the bracket is a port. Splitting
 *                                 on the first colon would turn `[::1]` into
 *                                 `[`, which is why this is bracket-aware even
 *                                 though the panel is never an IP.
 *
 * Returns null for an absent or empty header. Never throws — this runs in
 * middleware on every single request.
 */
export function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null;
  let h = host.trim();
  if (!h) return null;

  if (h.startsWith('[')) {
    // IPv6 literal. Keep the brackets — `[::1]` is the hostname; anything
    // after `]` is the port. A missing `]` is malformed; keep it as-is so it
    // simply fails to match rather than becoming something else.
    const close = h.indexOf(']');
    if (close !== -1) h = h.slice(0, close + 1);
  } else {
    // A name or IPv4 has at most one colon, and it introduces the port. More
    // than one means an unbracketed IPv6 literal (illegal in a Host header) —
    // leave it whole so it matches nothing rather than being truncated into
    // some other host.
    const firstColon = h.indexOf(':');
    if (firstColon !== -1 && h.indexOf(':', firstColon + 1) === -1) h = h.slice(0, firstColon);
  }

  h = h.toLowerCase();
  // Trailing root dot: `panel.ahantime.com.` and `panel.ahantime.com` are the
  // same name. Only ONE is stripped — `host..` is not a valid name.
  if (h.length > 1 && h.endsWith('.')) h = h.slice(0, -1);
  return h || null;
}

/** THE panel-host test. Every call site must use this rather than comparing a
 *  raw Host header itself — the admin area's entire "hidden, not redirected"
 *  contract is this one predicate. */
export function isPanelHost(host: string | null | undefined): boolean {
  return normalizeHost(host) === PANEL_HOSTNAME;
}

/**
 * A root-level FILE is not a panel page. `/theme-init.js` and
 * `/locale-init.js` are served from `public/` and requested on every page
 * load, but they are not in the middleware matcher's exclusion list — so on
 * the panel host they were rewritten to `/admin/theme-init.js`, which then hit
 * the admin gate and 307'd to `/api/auth/silent`. The two scripts that set the
 * theme and locale on <html> therefore NEVER loaded on panel.ahantime.com,
 * which showed up as a React hydration mismatch on every panel page for a
 * logged-out visitor (found while un-`fixme`-ing the e2e RBAC suite, W29).
 *
 * A dot in the LAST segment only: `/prices/rebar` has none, `/sitemap.xml`
 * does, and a hypothetical panel route with a dot in a parent segment stays a
 * page.
 */
function isFilePath(pathname: string): boolean {
  const last = pathname.slice(pathname.lastIndexOf('/') + 1);
  return last.includes('.');
}

/** Exact segment match — `/login` must match `/login` and `/login/x`, but
 *  NOT `/logintest` (a bare `startsWith` would wrongly treat that as the
 *  shared login page instead of prefixing it to `/admin/logintest`). */
function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function resolvePanelRouting(host: string | null, pathname: string): PanelRoutingDecision {
  const onPanelHost = isPanelHost(host);
  // The panel host gets its OWN login page — a chrome-free staff entrance
  // (app/panel-login) instead of the public storefront's /login, which
  // renders the full customer ticker/navbar/footer around the form. The
  // browser URL stays panel.ahantime.com/login; only the internal route
  // differs. (`shouldPrefix` really means "should rewrite" here.)
  if (onPanelHost && matchesPrefix(pathname, '/login')) {
    return { shouldPrefix: true, effectivePathname: '/panel-login' };
  }
  const shouldPrefix =
    onPanelHost &&
    !isFilePath(pathname) &&
    !PANEL_PASSTHROUGH_PREFIXES.some((p) => matchesPrefix(pathname, p));
  if (!shouldPrefix) return { shouldPrefix: false, effectivePathname: pathname };
  // Root `/` → `/admin` exactly (not `/admin/`, which a rewrite target
  // doesn't auto-normalize the way a real navigation's trailing-slash
  // handling would).
  return { shouldPrefix: true, effectivePathname: pathname === '/' ? '/admin' : `/admin${pathname}` };
}
