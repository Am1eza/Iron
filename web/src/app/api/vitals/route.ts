import { NextResponse } from 'next/server';

/**
 * Web Vitals sink — receives the fire-and-forget beacon from reportMetric()
 * (navigator.sendBeacon) in production. For now it simply accepts and drops the
 * payload (204) so the beacon never 404s; wire it to real analytics later. No
 * PII is sent (name/value/rating only).
 */
export const runtime = 'edge';

export async function POST(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204 });
}
