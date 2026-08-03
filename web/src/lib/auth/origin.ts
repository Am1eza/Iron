/**
 * Same-origin assertion for state-changing requests (CSRF defense in depth, on top
 * of SameSite=Lax cookies). Verifies the Origin (or Referer) host matches the
 * request host. Returns a 403 response to short-circuit, or null when allowed.
 */
import { NextResponse, type NextRequest } from 'next/server';

export function assertSameOrigin(req: NextRequest): NextResponse | null {
  const origin = req.headers.get('origin') ?? req.headers.get('referer');
  const method = req.method.toUpperCase();
  const stateChanging = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
  if (!origin) {
    // Browsers ALWAYS send Origin on state-changing fetches (POST/PUT/PATCH/
    // DELETE), so a missing header on those is treated as suspicious and
    // blocked (fail closed). Safe read methods stay lenient.
    return stateChanging ? forbidden() : null;
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return forbidden();
  }
  const host = req.headers.get('host');
  // Fail CLOSED on a missing Host: skipping the comparison when it is absent
  // meant any Origin was accepted. Not reachable through Caddy (HTTP/1.1
  // requires Host, HTTP/2 synthesises it from :authority) but this primitive
  // guards every mutating auth route and must not have a lenient branch.
  if (!host || originHost !== host) return forbidden();
  return null;
}


function forbidden(): NextResponse {
  return NextResponse.json(
    { error: 'forbidden', message: 'درخواست نامعتبر است.' },
    { status: 403 },
  );
}
