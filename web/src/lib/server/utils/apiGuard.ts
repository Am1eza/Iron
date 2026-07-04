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
import { hasDb } from '@/lib/server/db/client';
import { writeAudit } from '@/lib/server/repos/auditRepo';
import { reportError } from '@/lib/errors/report';

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
): Promise<{ session: AuthUser } | { response: NextResponse }> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = assertSameOrigin(req);
    if (origin) return { response: origin };
  }
  const session = await getSessionVerified();
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

export async function requireApiPermission(
  req: NextRequest,
  permission: Permission,
): Promise<{ session: AuthUser } | { response: NextResponse }> {
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth;
  if (!can(auth.session.role, permission)) {
    // Hide, don't reveal: admin API answers 404 to non-staff (same as pages).
    return {
      response: NextResponse.json(
        { error: 'not_found', message: 'یافت نشد.' },
        { status: 404 },
      ),
    };
  }
  return auth;
}

/** Audit an admin write — thin wrapper so handlers stay one-line. */
export async function audit(
  actorId: string | null,
  action: string,
  entity: { type: string; id: string },
  before?: unknown,
  after?: unknown,
): Promise<void> {
  await writeAudit({ actorId, action, entityType: entity.type, entityId: entity.id, before, after });
}
