/**
 * H-171 — CI-enforced regression test for the route-security inventory. The
 * previous state of this audit item was a one-time manual review (154 routes
 * read/grepped by hand); this makes the two zero-exception invariants that
 * review actually found into an automated check that fails the moment a new
 * route regresses them, per the item's own acceptance criteria ("a test …
 * that enforces this in CI — this test does not exist today").
 */
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { buildRouteInventory, type RouteInfo } from './lib/routeInventory';

const apiRoot = path.join(__dirname, '..', 'src', 'app', 'api');
const routes = buildRouteInventory(apiRoot);

/**
 * Routes that accept a body (POST/PUT/PATCH/DELETE) but deliberately don't
 * call `validateBody` — each verified individually (not assumed) to fall
 * into one of:
 *   (a) no meaningful body — the route acts on a route param / session only;
 *   (b) validated another way — multipart/form-data (file upload, checked by
 *       size cap + magic-byte sniff or a real parser like ExcelJS), or a
 *       manual `readJsonBody` + zod `.safeParse` inline (functionally the
 *       same check `validateBody` wraps, just not through the shared
 *       helper — often because the route needs a non-standard error shape,
 *       e.g. "never throw" for a telemetry sink);
 *   (c) a deliberately schema-less, defensively-parsed payload whose SHAPE
 *       varies by design (a third-party webhook), gated by a secret check
 *       instead of a body schema.
 * A new route landing here without EITHER calling validateBody or being
 * added to this list (with a real reason, reviewed) fails the test below —
 * this is the "explicit allowlist with a documented reason" the audit's
 * acceptance criteria asked for.
 */
const VALIDATE_BODY_EXEMPT: Record<string, string> = {
  'vitals/route.ts': '(b) manual readJsonBody + zod safeParse; must never throw on a malformed telemetry beacon',
  'log/route.ts': '(b) manual readJsonBody + zod safeParse; unauthenticated error-sink, must never throw',
  'auth/refresh/route.ts': '(a) no body — refresh token comes from an httpOnly cookie only',
  'auth/logout/route.ts': '(a) no body — refresh token comes from an httpOnly cookie only',
  'comments/[id]/helpful/route.ts': '(a) no body — acts on the [id] route param + session only',
  'ai/feedback/route.ts': '(b) manual readJsonBody + zod safeParse',
  'me/club/route.ts': '(a) no body — join action keyed off the session id only',
  'ai/lead/draft/route.ts': '(b) manual readJsonBody + zod safeParse, plus server-side re-pricing checks',
  'ai/lead/confirm/route.ts': '(b) manual readJsonBody + zod safeParse; name/mobile taken from session, not body',
  'me/letterhead/logo/route.ts': '(b) multipart/form-data upload — size cap + magic-byte sniff, not JSON',
  'admin/upload/route.ts': '(b) multipart/form-data upload — size cap + magic-byte sniff, not JSON',
  'internal/alert-relay/route.ts':
    '(c) schema-less GlitchTip webhook payload, parsed defensively field-by-field; gated by a shared-secret check',
  'ai/chat/route.ts': '(b) manual readJsonBody + zod safeParse for the chat messages array',
  'admin/pricing/history/route.ts': '(b) manual (non-zod) field-by-field validation — slugs capped, range type-checked',
  'admin/pricing/import/route.ts': '(b) multipart/form-data Excel upload — size cap + ExcelJS parse-or-reject',
  'admin/users/[id]/revoke-sessions/route.ts': '(a) no body — acts on the [id] route param + permission check only',
  'admin/seo/search-console/connect/route.ts': '(a) no body — starts an OAuth flow from server-side config only',
  'admin/catalog/audit/[id]/restore/route.ts': '(a) no body — restores from a stored snapshot keyed by [id]',
  'admin/leads/[id]/order/route.ts': '(a) no body — creates the order from the [id] route param + session only',
  'admin/leads/[id]/proforma/route.ts': '(b) manual readJsonBody + zod safeParse on an explicitly optional body',
  // DELETE-by-identifier routes: DELETE conventionally has no body, and none
  // of these read one (verified: no req.json()/readJsonBody call) — the
  // route param (mobile/ref/skuId) is the only input.
  'admin/allowlist/[mobile]/route.ts': '(a) no body — DELETE acts on the [mobile] route param only',
  'admin/proforma/[ref]/route.ts': '(a) no body — DELETE acts on the [ref] route param only',
  'admin/seo/search-console/route.ts': '(a) no body — DELETE disconnects the stored OAuth connection, no params needed',
  'me/favorites/[skuId]/route.ts': '(a) no body — DELETE acts on the [skuId] route param + session only',
  'me/route.ts': '(a) no body — DELETE deletes the session-owner\'s own account, no params needed',
  'ai/conversations/[id]/route.ts': '(a) no body — DELETE acts on the [id] route param + session only (J-228)',
};

function withBody(rs: RouteInfo[]): RouteInfo[] {
  return rs.filter((r) => r.methods.some((m) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(m)));
}

describe('H-171 — route security inventory (CI-enforced)', () => {
  it('found at least 150 route.ts files (sanity check that the walk actually ran)', () => {
    // Loose lower bound, not an exact count — the count legitimately grows
    // over time (154 as of the original audit; H-171's own note says a
    // count drift is normal, not a missed route). This just catches the
    // walk silently returning zero/a handful because apiRoot moved.
    expect(routes.length).toBeGreaterThan(150);
  });

  it('every /api/admin/** route calls requireApiPermission, requireApiUser, or getSessionVerified', () => {
    const missing = routes.filter((r) => r.family === 'admin' && !r.hasAuthGuard).map((r) => r.relPath);
    expect(missing).toEqual([]);
  });

  it('every /api/me/** route calls requireApiPermission, requireApiUser, or getSessionVerified', () => {
    const missing = routes.filter((r) => r.family === 'me' && !r.hasAuthGuard).map((r) => r.relPath);
    expect(missing).toEqual([]);
  });

  it('every route.ts accepting POST/PUT/PATCH/DELETE either validates its body or is on the reviewed exemption list', () => {
    const unexplained = withBody(routes)
      .filter((r) => !r.hasValidateBody && !(r.relPath in VALIDATE_BODY_EXEMPT))
      .map((r) => r.relPath);
    expect(unexplained).toEqual([]);
  });

  it('the exemption list contains no stale entries (a route that now calls validateBody, or no longer exists)', () => {
    const byPath = new Map(routes.map((r) => [r.relPath, r]));
    const stale = Object.keys(VALIDATE_BODY_EXEMPT).filter((relPath) => {
      const route = byPath.get(relPath);
      return !route || route.hasValidateBody;
    });
    expect(stale).toEqual([]);
  });
});
