/**
 * Same-origin assertion for state-changing requests (CSRF defense in depth, on top
 * of SameSite=Lax cookies). Verifies the Origin (or Referer) host matches the
 * request host. Returns a 403 response to short-circuit, or null when allowed.
 */
import { NextResponse, type NextRequest } from 'next/server';

export function assertSameOrigin(req: NextRequest): NextResponse | null {
  const origin = req.headers.get('origin') ?? req.headers.get('referer');
  // Some same-origin GET/no-CORS cases omit Origin; only block clear mismatches.
  if (!origin) return null;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return forbidden();
  }
  const host = req.headers.get('host');
  if (host && originHost !== host) return forbidden();
  return null;
}

function forbidden(): NextResponse {
  return NextResponse.json(
    { error: 'forbidden', message: 'درخواست نامعتبر است.' },
    { status: 403 },
  );
}
