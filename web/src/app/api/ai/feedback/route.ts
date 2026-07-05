import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { ulid } from 'ulid';
import { assertSameOrigin } from '@/lib/auth/origin';
import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { rateLimit } from '@/lib/server/utils/rateLimit';
import { getDb } from '@/lib/server/db/client';
import { aiFeedback } from '@/lib/server/db/schema';

export const runtime = 'nodejs';

/**
 * POST /api/ai/feedback — 👍/👎 (+ optional reason) on one assistant answer.
 * Anonymous like the advisor itself; the `messageId` comes from the chat
 * stream's `done` frame. Raw signal for the admin review / continuous-
 * improvement loop.
 */
const payload = z.object({
  messageId: z.string().min(1).max(64),
  conversationId: z.string().max(64).optional(),
  rating: z.enum(['up', 'down']),
  reason: z.string().trim().max(500).optional(),
});

async function POSTImpl(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (origin) return origin;

  const limited = await rateLimit(req, 'ai-feedback', { limit: 30, windowMs: 5 * 60_000 });
  if (limited) return limited;

  const dbGuard = requireDb();
  if (dbGuard) return dbGuard;

  const body: unknown = await req.json().catch(() => null);
  const parsed = payload.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', message: 'درخواست نامعتبر است.', fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { messageId, conversationId, rating, reason } = parsed.data;
  await getDb()
    .insert(aiFeedback)
    .values({
      id: ulid(),
      messageId,
      conversationId: conversationId ?? null,
      rating,
      reason: reason && reason.length > 0 ? reason : null,
    });

  return NextResponse.json({ ok: true });
}

export const POST = withApiErrorHandling(POSTImpl);
