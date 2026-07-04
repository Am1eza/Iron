/**
 * Idempotency-Key support for financially-meaningful writes — پیش‌فاکتور و
 * سفارش issuance — modeled on the Stripe / IETF `Idempotency-Key` header
 * convention (draft-ietf-httpapi-idempotency-key-header): a client retry
 * (network blip, admin double-click, a duplicate webhook redelivery) must
 * not create a second proforma/order/SMS. Backed by Postgres (not memory —
 * Cloudflare Workers has no memory across requests anyway), keyed on the
 * caller-supplied `Idempotency-Key` header, falling back to a same-route
 * dedupe key when the client sends none (so a bare double-click is still
 * caught even from a client that hasn't adopted the header yet).
 */
import { eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/server/db/client';
import { idempotencyKeys } from '@/lib/server/db/schema';

export type IdempotentResult = { status: number; body: unknown };

/**
 * Runs `run()` at most once per idempotency key. On a repeat request with
 * the same key:
 * - if the first request already finished, replays its exact response
 *   (no side effect re-executed);
 * - if the first request is still in flight, returns 409 so the caller
 *   retries shortly instead of racing a second execution.
 */
export async function withIdempotency(
  req: NextRequest,
  route: string,
  fallbackKey: string,
  run: () => Promise<IdempotentResult>,
): Promise<NextResponse> {
  const db = getDb();
  const headerKey = req.headers.get('idempotency-key')?.trim();
  // `fallbackKey` always carries the caller-scoped identity (e.g. `${leadId}:${session.id}:...`)
  // set by the route. A client-supplied header is layered ON TOP of that scope, never in place
  // of it — otherwise two different admins/leads that happen to send the same header value would
  // collide on one row and replay each other's stored response.
  const key = headerKey ? `${route}:${fallbackKey}:${headerKey}` : `${route}:${fallbackKey}`;

  const claimed = await db
    .insert(idempotencyKeys)
    .values({ key, route, status: 'pending' })
    .onConflictDoNothing({ target: idempotencyKeys.key })
    .returning({ key: idempotencyKeys.key });

  if (claimed.length === 0) {
    const [existing] = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key)).limit(1);
    if (existing?.status === 'done') {
      return NextResponse.json(existing.responseBody, {
        status: existing.responseStatus ?? 200,
        headers: { 'Idempotency-Replayed': 'true' },
      });
    }
    return NextResponse.json(
      { error: 'in_progress', message: 'درخواست مشابه در حال پردازش است. کمی صبر کنید.' },
      { status: 409 },
    );
  }

  try {
    const { status, body } = await run();
    await db
      .update(idempotencyKeys)
      .set({ status: 'done', responseStatus: status, responseBody: body })
      .where(eq(idempotencyKeys.key, key));
    return NextResponse.json(body, { status });
  } catch (err) {
    // Don't leave a permanently-stuck "pending" row on failure — release the
    // claim so a genuine retry after a transient error can still succeed.
    await db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key));
    throw err;
  }
}
