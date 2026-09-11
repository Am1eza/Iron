import { PayloadTooLargeError, payloadTooLargeResponse } from './requestBody';
/**
 * Route-handler guards — session/permission checks with the app's Persian
 * error contract ({ error, message }), plus the audit helper every admin
 * mutation calls. 404 (not 403) hides admin surfaces from non-staff (AUTH.md).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getSessionVerified } from '@/lib/auth/session';
import { can } from '@/lib/auth/roles';
import type { AuthUser, Permission } from '@/lib/auth/types';
import { assertSameOrigin } from '@/lib/auth/origin';
import { hasDb, type DbOrTx } from '@/lib/server/db/client';
import { writeAudit } from '@/lib/server/repos/auditRepo';
import { reportError } from '@/lib/errors/report';
import { rateLimit } from './rateLimit';
import { BusinessRuleError } from './businessOperation';

/**
 * H-185 — a shared floor under every authenticated admin request, closing
 * the gap where 91 of 94 `/api/admin/**` routes had no independent
 * throttle of their own: only a valid session+permission stood between a
 * stolen/rogue staff token and hammering something expensive (BrsAPI sync,
 * a heavy export query) at unlimited speed. Deliberately generous — this
 * is a backstop against abuse, not a UX-visible limit for normal admin use
 * (GitHub's own per-token default is the cited pattern: one big number on
 * every authenticated call, not a hand-tuned limit per endpoint). A route
 * that already calls `rateLimit()` itself keeps that tighter limit; this
 * one only ever adds an outer ceiling, never loosens an existing one.
 */
const ADMIN_DEFAULT_RATE_LIMIT = { limit: 120, windowMs: 60_000 };

/**
 * Wrap a route handler so ANY uncaught error (a dropped Postgres connection
 * mid-query, a malformed cookie throwing in getSession, etc.) becomes the
 * app's standard Persian `{error, message}` JSON contract instead of
 * Next.js's generic framework error response — most handlers had no
 * try/catch of their own. Also the one place every unhandled API error is
 * guaranteed to pass through `reportError` for visibility.
 */
export function withApiErrorHandling<Args extends unknown[]>(
  // `Response`, not just `NextResponse` — the AI chat route returns a raw
  // streaming `new Response(...)` (SSE), which NextResponse can't represent.
  handler: (...args: Args) => Promise<Response> | Response,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof BusinessRuleError) return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
      if (err instanceof PayloadTooLargeError) return payloadTooLargeResponse();
      reportError(err, { scope: 'api', unhandled: true });
      return NextResponse.json(
        { error: 'internal_error', message: 'خطایی در سرور رخ داد. دوباره تلاش کنید.' },
        { status: 500 },
      );
    }
  };
}

export function dbUnavailable(): NextResponse {
  return NextResponse.json(
    { error: 'db_unavailable', message: 'سرویس موقتاً در دسترس نیست. کمی بعد تلاش کنید.' },
    { status: 503 },
  );
}

/** DB guard for live endpoints — mock builds never call these routes. */
export function requireDb(): NextResponse | null {
  return hasDb() ? null : dbUnavailable();
}

export async function requireApiUser(
  req: NextRequest,
  opts?: { strict?: boolean },
): Promise<{ session: AuthUser } | { response: NextResponse }> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = assertSameOrigin(req);
    if (origin) return { response: origin };
  }
  const session = await getSessionVerified(opts);
  if (!session) {
    return {
      response: NextResponse.json(
        { error: 'unauthenticated', message: 'وارد نشده‌اید.' },
        { status: 401 },
      ),
    };
  }
  return { session };
}

/**
 * G-161 — role re-validation policy: the role check here reads the JWT ONCE,
 * at the top of the request; nothing re-checks it before the handler's final
 * write. That is safe ONLY because every admin route in this codebase is a
 * single short request — one or a few DB round trips, no per-item sequential
 * `await` loop, no long-lived stream — so "the role was valid when this
 * request started" and "the role is still valid when it finishes" are, in
 * practice, the same instant. A role/active-state change also bumps
 * `tokenVersion` and revokes refresh tokens (store.pg.ts's `updateUser`), so
 * the NEXT request from a demoted actor is rejected immediately — the
 * exposure window is bounded by one in-flight request's duration, not by
 * anything longer.
 *
 * This stops being true the moment an admin route does real per-item
 * sequential I/O over a large batch (verified empirically at the time of
 * writing: `grep`-checked every `for (const ...)` in `api/admin/**` — none
 * contains an `await` inside the loop body; see docs/audit-rbac-panel-G.md
 * §G-161). If you are adding one: re-fetch and re-check
 * `can(session.role, permission)` immediately before the operation's
 * irreversible step, not just at the top — the JWT claim from minutes
 * earlier is no longer a safe stand-in for "this actor may still do this
 * right now".
 */
export async function requireApiPermission(
  req: NextRequest,
  permission: Permission,
): Promise<{ session: AuthUser } | { response: NextResponse }> {
  // strict: staff/permission routes fail closed on a DB outage (no stale-role trust).
  const auth = await requireApiUser(req, { strict: true });
  if ('response' in auth) return auth;
  if (!can(auth.session.role, permission)) {
    // Hide, don't reveal: admin API answers 404 to non-staff (same as pages).
    return {
      response: NextResponse.json({ error: 'not_found', message: 'یافت نشد.' }, { status: 404 }),
    };
  }
  // H-185 — checked last, after we know WHO (keyed by session id, not IP —
  // see ADMIN_DEFAULT_RATE_LIMIT's doc comment above) and that they're
  // actually staff with this permission, so an anonymous/unauthorized
  // caller can't burn a real admin's quota by guessing their session id.
  const limited = await rateLimit(req, 'admin-default', {
    ...ADMIN_DEFAULT_RATE_LIMIT,
    key: auth.session.id,
  });
  if (limited) return { response: limited };
  return auth;
}

/**
 * Audit an admin write — thin wrapper so handlers stay one-line.
 *
 * Two modes, chosen by whether a `tx` is passed:
 *
 * - No `tx` (the default, and every pre-existing caller): never throws. The
 *   write it records has ALREADY committed by the time this runs, and
 *   `withApiErrorHandling` turns anything thrown here into a generic 500 — so
 *   a transient failure inserting the audit row reported «خطایی در سرور رخ داد»
 *   for an operation that had fully succeeded. Reported instead, so the
 *   failure is visible where failures are read, without lying to the caller.
 * - `tx` given: this call is expected to run BEFORE commit, inside the same
 *   transaction as the write it records (see `users/[id]/route.ts`'s role
 *   change for the canonical caller) — so a failure here MUST propagate and
 *   roll back the state change too. Losing "who changed this sensitive
 *   field" is worse than losing the change itself for something like a role
 *   grant; unlike the no-tx case, nothing has committed yet to lie about.
 */
export async function audit(
  actorId: string | null,
  action: string,
  entity: { type: string; id: string },
  before?: unknown,
  after?: unknown,
  tx?: DbOrTx,
): Promise<void> {
  if (tx) {
    await writeAudit({ actorId, action, entityType: entity.type, entityId: entity.id, before, after, tx });
    return;
  }
  try {
    await writeAudit({
      actorId,
      action,
      entityType: entity.type,
      entityId: entity.id,
      before,
      after,
    });
  } catch (err) {
    reportError(err, { stage: 'audit', action, entityType: entity.type, entityId: entity.id });
  }
}
