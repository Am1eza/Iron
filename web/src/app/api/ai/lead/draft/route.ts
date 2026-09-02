import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { assertSameOrigin } from '@/lib/auth/origin';
import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { rateLimit } from '@/lib/server/utils/rateLimit';
import { getDraft, updateDraft } from '@/lib/server/ai/leadDraft';
import { rememberFacts } from '@/lib/server/ai/memory';
import { priceItems } from '@/lib/server/services/leads.service';
import { LEAD_CONFIRM_MESSAGES } from '@/lib/server/ai/messages';
import { CITIES } from '@/lib/data/logistics';
import { PRICE_UNIT_VALUES } from '@/lib/types/domain';
import { finiteNumber } from '@/lib/validation/utils';

export const runtime = 'nodejs';

const payload = z.object({
  draftId: z.string().min(1).max(64),
  items: z
    .array(
      z.object({
        skuId: z.string().min(1).max(120),
        qty: finiteNumber.positive().max(100_000),
        unit: z.enum(PRICE_UNIT_VALUES),
      }),
    )
    .min(1)
    .max(100),
  // Closed vocabulary, exactly as the freight table is keyed — a city we
  // cannot price is worse than no city (see ai/memory.ts). Empty string
  // clears it, which is how the card's «انتخاب نشده» option works.
  city: z
    .string()
    .max(40)
    .optional()
    .refine((c) => !c || CITIES.some((x) => x.name === c), { message: 'شهر نامعتبر است.' }),
});

/**
 * POST /api/ai/lead/draft — the visitor edited the advisor's پیش‌فاکتور card.
 *
 * WHY THIS EXISTS. The card used to be read-only, so «۳ تن» that should have
 * been «۵ تن» meant typing a whole sentence back into the chat and waiting for
 * a model round trip to redraw a card the visitor was already looking at. A
 * quantity field is a quantity field.
 *
 * WHY IT REPRICES SERVER-SIDE. The card shows Toman. If the client were
 * allowed to send back its own line totals, the number on a document a
 * customer keeps would be a number the customer's browser computed. Instead
 * the request carries only WHAT (sku, qty, unit) — never how much — and the
 * server reprices through `priceItems`, the same function `createLead` uses.
 * So the edited card, the confirmed lead and the issued پیش‌فاکتور cannot
 * disagree, and a tampered request can change the order but never the price.
 *
 * The draft keeps its id: editing must not mint a second, still-confirmable
 * draft holding the pre-edit quantities.
 */
async function POSTImpl(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (origin) return origin;
  // Generous enough for real editing (a few taps on a quantity stepper), tight
  // enough that this cannot be used to enumerate the catalog's prices.
  const limited = await rateLimit(req, 'ai-lead-draft', { limit: 40, windowMs: 5 * 60_000 });
  if (limited) return limited;
  const guard = requireDb();
  if (guard) return guard;

  const body: unknown = await req.json().catch(() => null);
  const parsed = payload.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation', message: 'درخواست نامعتبر است.' }, { status: 400 });
  }

  const existing = await getDraft(parsed.data.draftId);
  if (!existing) {
    return NextResponse.json(
      { error: 'draft_expired', message: LEAD_CONFIRM_MESSAGES.draftExpired },
      { status: 410 },
    );
  }
  // Same ownership rule as confirm: a draft prepared while another account was
  // signed in is not this visitor's to edit.
  const session = await getSession();
  if (existing.userId && existing.userId !== session?.id) {
    return NextResponse.json({ error: 'forbidden', message: LEAD_CONFIRM_MESSAGES.forbidden }, { status: 403 });
  }

  // The edit may only re-quantify lines the ADVISOR already put on this draft.
  // Without this, a caller holding a draft id could swap in any sku in the
  // catalog and use a chat draft as a general-purpose pricing endpoint.
  const allowed = new Set(existing.items.map((i) => i.skuId));
  if (parsed.data.items.some((i) => !allowed.has(i.skuId))) {
    return NextResponse.json(
      { error: 'validation', message: 'فقط می‌توان اقلام همین درخواست را ویرایش کرد.' },
      { status: 400 },
    );
  }

  const { lines, allPriced } = await priceItems(parsed.data.items);
  if (lines.length === 0 || lines.every((l) => l.name === l.skuId)) {
    return NextResponse.json(
      { error: 'validation', message: 'این اقلام دیگر در کاتالوگ موجود نیستند.' },
      { status: 400 },
    );
  }

  const city = parsed.data.city?.trim() || undefined;
  const updated = await updateDraft(parsed.data.draftId, {
    items: parsed.data.items,
    ...(parsed.data.city !== undefined ? { city: city ?? '' } : {}),
  });
  if (!updated) {
    return NextResponse.json(
      { error: 'draft_expired', message: LEAD_CONFIRM_MESSAGES.draftExpired },
      { status: 410 },
    );
  }

  // A city chosen ON THE CARD is the same fact as one typed in the chat, and
  // has to reach the same memory — otherwise the next turn's comparison card
  // would still price freight to nowhere.
  if (city && existing.conversationId) {
    void rememberFacts(existing.conversationId, { city }).catch(() => {
      /* best effort, exactly like every other memory write */
    });
  }

  const totalWeightKg = lines.reduce((s, l) => s + (l.weightKg ?? 0), 0) || undefined;
  const total = allPriced ? lines.reduce((s, l) => s + (l.lineTotal ?? 0), 0) || undefined : undefined;
  return NextResponse.json({
    draftId: updated.id,
    items: lines.map((l) => ({
      skuId: l.skuId,
      name: l.name,
      qty: l.qty,
      unit: l.unit,
      weightKg: l.weightKg,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
    })),
    totalWeightKg,
    total,
    allPriced,
    ...(city ? { city } : {}),
    signedIn: Boolean(session),
  });
}

export const POST = withApiErrorHandling(POSTImpl);
