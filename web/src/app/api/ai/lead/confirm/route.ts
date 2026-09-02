import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { assertSameOrigin } from '@/lib/auth/origin';
import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { rateLimit } from '@/lib/server/utils/rateLimit';
import { consumeDraft } from '@/lib/server/ai/leadDraft';
import { conversationForSales } from '@/lib/server/ai/conversation';
import { getMemory } from '@/lib/server/ai/memory';
import { createLead } from '@/lib/server/services/leads.service';
// Rendered inside the chat thread, so they speak in the advisor's register.
import { LEAD_CONFIRM_MESSAGES } from '@/lib/server/ai/messages';

export const runtime = 'nodejs';

const payload = z.object({ draftId: z.string().min(1).max(64) });

/**
 * POST /api/ai/lead/confirm — the visitor pressed «تأیید و ثبت درخواست» on the
 * advisor's summary card. THIS is where an AI conversation becomes a real lead
 * (+ پیش‌فاکتور + SMS); the advisor itself only prepares a draft, so the model
 * can no longer file a request the visitor never confirmed, and can no longer
 * be talked into texting an arbitrary mobile number.
 *
 * Sign-in is REQUIRED — which is also what makes the name/mobile questions
 * unnecessary: both come from the session, never from the chat.
 */
async function POSTImpl(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (origin) return origin;
  const limited = await rateLimit(req, 'ai-lead-confirm', { limit: 10, windowMs: 60 * 60_000 });
  if (limited) return limited;
  const guard = requireDb();
  if (guard) return guard;

  const body: unknown = await req.json().catch(() => null);
  const parsed = payload.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation', message: 'درخواست نامعتبر است.' }, { status: 400 });
  }

  const session = await getSession();
  if (!session) {
    // The client turns this into the «ورود به حساب کاربری» state on the card
    // rather than an error toast — the draft is still waiting.
    return NextResponse.json(
      { error: 'auth_required', message: LEAD_CONFIRM_MESSAGES.authRequired },
      { status: 401 },
    );
  }
  if (!session.mobile) {
    return NextResponse.json(
      { error: 'no_mobile', message: LEAD_CONFIRM_MESSAGES.noMobile },
      { status: 400 },
    );
  }

  // Single-use: consumed BEFORE the write so a double-tap can't produce two
  // leads and two SMS. A failed create just means the visitor asks again.
  const draft = await consumeDraft(parsed.data.draftId);
  if (!draft) {
    return NextResponse.json(
      { error: 'draft_expired', message: LEAD_CONFIRM_MESSAGES.draftExpired },
      { status: 410 },
    );
  }
  // A draft prepared while ANOTHER account was signed in is not this user's to
  // confirm. One prepared anonymously belongs to whoever signs in from that
  // chat — that is the login-then-continue flow itself.
  if (draft.userId && draft.userId !== session.id) {
    return NextResponse.json({ error: 'forbidden', message: LEAD_CONFIRM_MESSAGES.forbidden }, { status: 403 });
  }

  // Sales context: the WHOLE stored chat + the advisor's rolling summary,
  // read from the DB (the client only ever resends the last 10 turns).
  const chat = draft.conversationId
    ? await conversationForSales(draft.conversationId)
    : { summary: null, transcript: [] };
  const transcript = chat.transcript.length > 0 ? chat.transcript : draft.transcript;
  // Where the chat established this is going. Recorded on the lead so the rep
  // opens the call knowing it, and so this customer's NEXT conversation can
  // default to it instead of asking again (ai/customerFacts.ts). Best-effort:
  // a missing memory must never fail a confirmed request.
  const remembered = draft.conversationId ? await getMemory(draft.conversationId).catch(() => null) : null;

  const result = await createLead(
    {
      contact: { name: session.name, mobile: session.mobile },
      items: draft.items,
      source: 'ai',
      context: {
        ...(draft.conversationId ? { aiConversationId: draft.conversationId } : {}),
        ...(chat.summary ? { aiSummary: chat.summary } : {}),
        ...(transcript && transcript.length > 0 ? { transcript } : {}),
        // The card's own city wins: if the visitor changed it there, that is
        // the most recent and most deliberate statement of where this goes.
        ...(draft.city || remembered?.city ? { deliveryCity: draft.city || remembered!.city! } : {}),
      },
    },
    session,
  );

  return NextResponse.json(result);
}

export const POST = withApiErrorHandling(POSTImpl);
