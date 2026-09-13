import { readJsonBody } from '@/lib/server/utils/requestBody';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSessionVerified } from '@/lib/auth/session';
import { assertSameOrigin } from '@/lib/auth/origin';
import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { rateLimit } from '@/lib/server/utils/rateLimit';
import { consumeAlertDraft, getAlertDraft } from '@/lib/server/ai/alertDraft';
import {
  createAlert,
  alertCapForTier,
  AlertCapExceededError,
  AlertTargetNotFoundError,
} from '@/lib/server/repos/alertsRepo';
import { toPersianDigits } from '@/lib/utils/format';

export const runtime = 'nodejs';

const payload = z.object({ draftId: z.string().min(1).max(64) });

/**
 * POST /api/ai/alert/confirm — the visitor pressed «تأیید و ثبت هشدار» on the
 * advisor's alert card (J-223).
 *
 * THIS is where an AI conversation arms a real price alert. `setPriceAlert`
 * used to write the row itself, which made it the one model tool that could
 * produce a side effect — future SMS to this person — from nothing but a
 * question. It now only prepares a draft; the whole write lives here, behind
 * an explicit human action, the same split `prepareProforma`
 * + /api/ai/lead/confirm already uses for the heavier lead case.
 *
 * Sign-in is REQUIRED: an alert is a promise to text someone later, and the
 * number comes from the session — never from the chat.
 */
async function POSTImpl(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (origin) return origin;
  const limited = await rateLimit(req, 'ai-alert-confirm', { limit: 20, windowMs: 60 * 60_000 });
  if (limited) return limited;
  const guard = requireDb();
  if (guard) return guard;

  const body: unknown = await readJsonBody(req);
  const parsed = payload.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation', message: 'درخواست نامعتبر است.' }, { status: 400 });
  }

  const session = await getSessionVerified({ strict: true });
  if (!session) {
    // Same shape as the lead card's auth state: the draft is still waiting,
    // so the client shows «ورود به حساب کاربری», not an error.
    return NextResponse.json(
      { error: 'auth_required', message: 'برای ثبت هشدار قیمت، اول وارد حساب کاربری‌ات شو.' },
      { status: 401 },
    );
  }

  // Ownership BEFORE consuming: another account must not be able to destroy a
  // pending draft merely by submitting its id.
  const existing = await getAlertDraft(parsed.data.draftId);
  if (existing && existing.userId !== session.id) {
    return NextResponse.json(
      { error: 'forbidden', message: 'این هشدار متعلق به حساب دیگری است.' },
      { status: 403 },
    );
  }

  // Single-use: consumed BEFORE the write, so a double-tap cannot arm the
  // same alert twice. A failed create just means the visitor asks again.
  const draft = await consumeAlertDraft(parsed.data.draftId);
  if (!draft) {
    return NextResponse.json(
      { error: 'draft_expired', message: 'این درخواست منقضی شده؛ دوباره از مشاور بخواه هشدار بگذارد.' },
      { status: 410 },
    );
  }
  if (draft.userId !== session.id) {
    return NextResponse.json(
      { error: 'forbidden', message: 'این هشدار متعلق به حساب دیگری است.' },
      { status: 403 },
    );
  }

  try {
    const cap = await alertCapForTier(session.clubTier);
    const created = await createAlert({
      userId: session.id,
      target: { type: 'sku', skuId: draft.skuId },
      op: draft.op,
      threshold: draft.threshold,
      channel: 'sms',
      cap,
    });
    return NextResponse.json({
      ok: true,
      merged: created.merged,
      product: draft.productName,
      op: draft.op,
      threshold: draft.threshold,
      message: created.merged
        ? 'همین هشدار از قبل فعال بود؛ با تغییر قیمت برایت پیامک می‌شود.'
        : 'هشدار ثبت شد؛ با رسیدن قیمت به این حد برایت پیامک می‌شود.',
    });
  } catch (err) {
    if (err instanceof AlertCapExceededError) {
      return NextResponse.json(
        {
          error: 'cap_exceeded',
          message: `سقف هشدارهای فعال تو پر است (${toPersianDigits(String(err.cap))} مورد). یکی از هشدارهای قبلی را در حسابت غیرفعال کن و دوباره امتحان کن.`,
        },
        { status: 409 },
      );
    }
    if (err instanceof AlertTargetNotFoundError) {
      return NextResponse.json({ error: 'not_found', message: 'این محصول یافت نشد.' }, { status: 404 });
    }
    throw err;
  }
}

export const POST = withApiErrorHandling(POSTImpl);
