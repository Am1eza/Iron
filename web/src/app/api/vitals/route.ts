import { NextResponse } from 'next/server';
import { withApiErrorHandling } from '@/lib/server/utils/apiGuard';

/**
 * Web Vitals sink — receives the fire-and-forget beacon from reportMetric()
 * (navigator.sendBeacon) in production. For now it simply accepts and drops the
 * payload (204) so the beacon never 404s; wire it to real analytics later. No
 * PII is sent (name/value/rating only).
 *
 * Note: no `export const runtime = 'edge'` — the OpenNext/Cloudflare adapter runs
 * the default runtime on workerd (nodejs_compat), and edge routes would need to be
 * bundled separately.
 */
async function POSTImpl(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204 });
}

export const POST = withApiErrorHandling(POSTImpl);
