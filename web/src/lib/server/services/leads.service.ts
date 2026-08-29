/**
 * Lead → proforma flow (UX-flow F6): validate items → snapshot current prices
 * (hidden-stale → unpriced, flagged for sales) → insert lead → auto-issue the
 * پیش‌فاکتور when everything is priced → SMS the ref → mirror the request in
 * the user's inbox. One entry point for the table/cart/AI/tool sources.
 */
import { and, desc, eq, gt, inArray, ne } from 'drizzle-orm';
import { getDb, type DbOrTx } from '@/lib/server/db/client';
import { skus, currentPrices, proformas, userRequests, users } from '@/lib/server/db/schema';
import type { AuthUser } from '@/lib/auth/types';
import type { LineItem, PriceUnit } from '@/lib/types/domain';
import {
  insertLead,
  insertProforma,
  proformasOfLead,
  updateLead,
  WHOLE_PIECE_UNITS,
  type LeadRow,
  type ProformaRow,
} from '@/lib/server/repos/leadsRepo';
import { insertRequest } from '@/lib/server/repos/requestsRepo';
import { getVatRate, getHolidays, getSetting } from '@/lib/server/repos/settingsRepo';
import { nextRef } from '@/lib/server/utils/refs';
import { quoteValidUntil } from '@/lib/server/utils/jalali';
import { sendNotification, truncateParam, type TemplateParam } from '@/lib/server/integrations/smsir';
import { getPriceFreshness } from '@/lib/server/services/priceFreshness';
import { publicEnv } from '@/lib/validation/env';
import { formatToman } from '@/lib/utils/format';
import { lineTotalToman, lineWeightKg } from '@/lib/utils/priceMath';
import { formatJalali } from '@/lib/utils/jalali';
import { SHIPMENT_STEPS, type ShipmentStatus } from '@/lib/types/domain';
import type { Attribution } from '@/lib/utils/attribution';
import {
  resolveVolumeTier,
  volumeDiscountLabel,
  volumeDiscountToman,
} from '@/lib/config/pricingTiers';

/** SMS.ir's template-approval policy requires every customer-facing template
 *  to be personalized with a name variable — a lead/order/alert can have no
 *  name on file, so every NAME param routes through this instead of the raw
 *  (possibly empty) contactName/user.name, and «مشتری عزیز،» reads as a
 *  normal generic greeting rather than a broken blank. */
export function customerNameParam(name: string | null | undefined): string {
  return truncateParam(name?.trim() || 'مشتری');
}

/** Shared proforma-ref SMS text — used on first issue and on admin re-issue.
 *  Also the fallback for proformaSmsNotification() below when no template is
 *  configured yet — keep the two in wording-sync. */
export function proformaSmsText(ref: string, name: string | null | undefined, total?: number, validUntil?: Date): string {
  const who = name?.trim() || 'مشتری';
  const link = `${publicEnv.NEXT_PUBLIC_SITE_URL}/proforma/${ref}`;
  if (total && validUntil) {
    return `آهن‌تایم: ${who} عزیز، پیش‌فاکتور شما صادر شد. کد پیگیری: ${ref}، مبلغ: ${formatToman(total)}، اعتبار تا ${formatJalali(validUntil)} ساعت ۱۱:۰۰. مشاهده: ${link}`;
  }
  return `آهن‌تایم: ${who} عزیز، درخواست شما با کد پیگیری ${ref} ثبت شد. کارشناسان ما به‌زودی با شما تماس می‌گیرند. پیگیری: ${link}`;
}

/**
 * The same message as a NotificationSpec — templated the moment the owner
 * registers SMSIR_TEMPLATE_ID_PROFORMA_REQUEST / _ISSUED on the SMS.ir panel
 * (see docs/SMS-TEMPLATES.md for the exact text to submit), free-text bulk
 * send on the fixed line until then. Two DIFFERENT templates, not one with
 * optional params — "your request was received" and "here is your priced
 * quote" are different intents a customer reads differently, and SMS.ir
 * templates are fixed text around the placeholders, not conditional.
 */
export function proformaSmsNotification(
  ref: string,
  name: string | null | undefined,
  total?: number,
  validUntil?: Date,
): { templateEnvVar: string; params: TemplateParam[]; fallbackText: string; kind: 'proforma' } {
  const fallbackText = proformaSmsText(ref, name, total, validUntil);
  const NAME = customerNameParam(name);
  if (total && validUntil) {
    return {
      templateEnvVar: 'SMSIR_TEMPLATE_ID_PROFORMA_ISSUED',
      params: [
        { name: 'NAME', value: NAME },
        { name: 'REF', value: truncateParam(ref) },
        { name: 'AMOUNT', value: truncateParam(formatToman(total, false)) },
        { name: 'EXPIRY', value: truncateParam(formatJalali(validUntil)) },
      ],
      fallbackText,
      kind: 'proforma',
    };
  }
  return {
    templateEnvVar: 'SMSIR_TEMPLATE_ID_PROFORMA_REQUEST',
    params: [
      { name: 'NAME', value: NAME },
      { name: 'REF', value: truncateParam(ref) },
    ],
    fallbackText,
    kind: 'proforma',
  };
}

/** Shared order-confirmation SMS text. «تبدیل به سفارش» minted a tracking ref
 *  and told the rep it was «قابل رهگیری در /track» while the customer was
 *  never told anything at all — SMS is the only channel here (there is no
 *  in-app notification system). Links to the public /track lookup rather than
 *  a per-ref page: /track takes the ref in its own form and needs no login,
 *  so it works for the guest leads that never had an account. */
export function orderSmsText(ref: string, name: string | null | undefined): string {
  const who = name?.trim() || 'مشتری';
  const link = `${publicEnv.NEXT_PUBLIC_SITE_URL}/track`;
  return `آهن‌تایم: ${who} عزیز، سفارش شما ثبت شد. کد رهگیری: ${ref}، پیگیری وضعیت ارسال: ${link}`;
}

/** As a NotificationSpec — see proformaSmsNotification's doc comment. Owner
 *  registers SMSIR_TEMPLATE_ID_ORDER_CONFIRMED to switch this to the
 *  templated Verify send; the fallback (free-text bulk) is unchanged. */
export function orderSmsNotification(
  ref: string,
  name: string | null | undefined,
): { templateEnvVar: string; params: TemplateParam[]; fallbackText: string; kind: 'generic' } {
  return {
    templateEnvVar: 'SMSIR_TEMPLATE_ID_ORDER_CONFIRMED',
    params: [
      { name: 'NAME', value: customerNameParam(name) },
      { name: 'REF', value: truncateParam(ref) },
    ],
    fallbackText: orderSmsText(ref, name),
    kind: 'generic',
  };
}

const SHIPMENT_LABEL: Record<ShipmentStatus, string> = Object.fromEntries(
  SHIPMENT_STEPS.map((s) => [s.key, s.label]),
) as Record<ShipmentStatus, string>;

/**
 * Everything the ORDER_CONFIRMED notification above does NOT cover: the
 * shipment moving past its creation state. `registered` is that creation
 * state — orderSmsNotification already told the customer about it — so
 * there is no per-status notification for it (calling this with 'registered'
 * would be a caller bug, not a state this ever needs to describe).
 * `delivered` gets a distinct, warmer template (SMSIR_TEMPLATE_ID_ORDER_
 * DELIVERED) rather than reusing the generic "status changed" wording — it's
 * the one stage the customer is actually waiting for.
 */
export function orderStatusSmsNotification(
  ref: string,
  name: string | null | undefined,
  status: Exclude<ShipmentStatus, 'registered'>,
): { templateEnvVar: string; params: TemplateParam[]; fallbackText: string; kind: 'generic' } {
  const who = name?.trim() || 'مشتری';
  const link = `${publicEnv.NEXT_PUBLIC_SITE_URL}/track`;
  const NAME = customerNameParam(name);
  if (status === 'delivered') {
    return {
      templateEnvVar: 'SMSIR_TEMPLATE_ID_ORDER_DELIVERED',
      params: [
        { name: 'NAME', value: NAME },
        { name: 'REF', value: truncateParam(ref) },
      ],
      fallbackText: `آهن‌تایم: ${who} عزیز، سفارش ${ref} با موفقیت تحویل داده شد. از خرید شما سپاسگزاریم.`,
      kind: 'generic',
    };
  }
  const stage = SHIPMENT_LABEL[status];
  return {
    templateEnvVar: 'SMSIR_TEMPLATE_ID_ORDER_STATUS',
    params: [
      { name: 'NAME', value: NAME },
      { name: 'REF', value: truncateParam(ref) },
      { name: 'STAGE', value: truncateParam(stage) },
    ],
    fallbackText: `آهن‌تایم: ${who} عزیز، وضعیت سفارش ${ref} به «${stage}» تغییر کرد. پیگیری: ${link}`,
    kind: 'generic',
  };
}

/** Fires only once a real tracking number lands (see the route caller) — a
 *  carrier name alone, with no tracking number yet, isn't the "you can go
 *  look this up now" moment this notification exists for. */
export function orderShippingSmsNotification(
  ref: string,
  name: string | null | undefined,
  trackingNumber: string,
  carrierName: string | null,
): { templateEnvVar: string; params: TemplateParam[]; fallbackText: string; kind: 'generic' } {
  const carrier = carrierName?.trim() || 'شرکت حمل';
  const who = name?.trim() || 'مشتری';
  return {
    templateEnvVar: 'SMSIR_TEMPLATE_ID_ORDER_SHIPPING',
    params: [
      { name: 'NAME', value: customerNameParam(name) },
      { name: 'REF', value: truncateParam(ref) },
      { name: 'CARRIER', value: truncateParam(carrier) },
      { name: 'TRACKING', value: truncateParam(trackingNumber) },
    ],
    fallbackText: `آهن‌تایم: ${who} عزیز، سفارش ${ref} با ${carrier} ارسال شد. کد رهگیری: ${trackingNumber}`,
    kind: 'generic',
  };
}

export function orderCancelledSmsNotification(
  ref: string,
  name: string | null | undefined,
): { templateEnvVar: string; params: TemplateParam[]; fallbackText: string; kind: 'generic' } {
  const who = name?.trim() || 'مشتری';
  return {
    templateEnvVar: 'SMSIR_TEMPLATE_ID_ORDER_CANCELLED',
    params: [
      { name: 'NAME', value: customerNameParam(name) },
      { name: 'REF', value: truncateParam(ref) },
    ],
    fallbackText: `آهن‌تایم: ${who} عزیز، سفارش ${ref} لغو شد. برای اطلاعات بیشتر با پشتیبانی تماس بگیرید.`,
    kind: 'generic',
  };
}

export interface CreateLeadInput {
  contact: { name?: string; mobile: string };
  items: Array<{ skuId: string; qty: number; unit: PriceUnit }>;
  channel?: 'sms' | 'whatsapp' | 'telegram' | 'eitaa';
  source?: string;
  note?: string;
  /** First-touch campaign attribution (W28), read from the visitor's cookie
   *  by the route handler — deliberately NOT accepted from the request body,
   *  so a caller cannot forge which campaign gets credit for a deal. */
  attribution?: Attribution | null;
  context?: {
    aiConversationId?: string;
    sourcePage?: string;
    /** AI-advisor chat that led to this lead (capped upstream) — sales context. */
    transcript?: Array<{ role: string; content: string }>;
    aiSummary?: string;
    /** Where the chat established this is going — see LeadContext.deliveryCity. */
    deliveryCity?: string;
  };
}

export interface CreateLeadResult {
  ref: string;
  proformaRef?: string;
  validUntil?: string;
  total?: number;
  // Resolved line items (name/weight/price) — surfaced so the AI advisor's
  // confirmation message can quote real figures instead of leaving a
  // grounding-censored gap where the user's requested weight/cost would go.
  items?: Array<{ name: string; qty: number; unit: PriceUnit; weightKg?: number; unitPrice?: number; lineTotal?: number }>;
  totalWeightKg?: number;
}

const KNOWN_SOURCES = ['table', 'ai', 'cart', 'cooperation', 'tool', 'warehouse', 'contact', 'cutToSize', 'tender'] as const;
type LeadSource = (typeof KNOWN_SOURCES)[number];

function asSource(s?: string): LeadSource {
  return (KNOWN_SOURCES as readonly string[]).includes(s ?? '') ? (s as LeadSource) : 'cart';
}

/** Resolve items against the catalog and snapshot prices (skip hidden-stale).
 *  Exported for tests — this is the function that decides what a customer is
 *  quoted, so its rules are pinned directly rather than through createLead. */
export async function priceItems(
  items: CreateLeadInput['items'],
): Promise<{ lines: LineItem[]; allPriced: boolean }> {
  const db = getDb();
  const ids = items.map((i) => i.skuId);
  const rows = await db
    .select({ sku: skus, price: currentPrices })
    .from(skus)
    .leftJoin(currentPrices, eq(currentPrices.skuId, skus.id))
    // W24 audit fix: without the `isActive` filter a stale cart or a
    // bookmarked page could resolve a DEACTIVATED product — and since
    // `createLead` auto-issues a پیش‌فاکتور the moment `allPriced` holds, the
    // shop could issue a binding quote for a delisted item. An id that no
    // longer resolves already falls through to `unitPrice: undefined` →
    // `allPriced = false`, which routes the lead to a human instead.
    .where(and(inArray(skus.id, ids), eq(skus.isActive, true)));
  const bySku = new Map(rows.map((r) => [r.sku.id, r] as const));
  // Slug fallback: cart items created from mock-era rows carry slug ids. Only
  // query the ids that DIDN'T resolve by SKU id — skip the extra round-trip
  // entirely in the common case where every id matched.
  const bySlug = new Map(rows.map((r) => [r.sku.slug, r] as const));
  const unresolved = ids.filter((id) => !bySku.has(id));
  if (unresolved.length > 0) {
    const slugRows = await db
      .select({ sku: skus, price: currentPrices })
      .from(skus)
      .leftJoin(currentPrices, eq(currentPrices.skuId, skus.id))
      // The isActive gate has to hold on BOTH lookups: a cart line carrying a
      // slug id would otherwise resolve a delisted product through this
      // fallback and get it auto-quoted, which is exactly what the primary
      // query above was fixed to prevent.
      .where(and(inArray(skus.slug, unresolved), eq(skus.isActive, true)));
    for (const r of slugRows) bySlug.set(r.sku.slug, r);
  }

  const freshness = await getPriceFreshness();

  let allPriced = true;
  const lines: LineItem[] = items.map((item) => {
    const hit = bySku.get(item.skuId) ?? bySlug.get(item.skuId);
    const price = hit?.price ?? null;
    const hidden = price ? freshness.isHidden(price.updatedAt) : true;

    // The UNIT IS THE SKU'S, never the client's. Every other number on this
    // line is recomputed server-side, but `unit` used to be taken on trust
    // while `unitPrice` came from the SKU — so the two could describe
    // different things. A request of {skuId: rebar-14, qty: 100,
    // unit: 'branch'} against a SKU priced per kg produced
    // lineTotal = 100 x 42,000 on a proforma that read «۱۰۰ شاخه», when 100
    // branches of rebar-14 is ~1200kg — roughly 12x under, on a document the
    // customer keeps and that is sent to them by SMS. The mirrored error
    // (claiming 'kg' on a per-branch SKU) corrupted weightKg the other way.
    const skuUnit = hit?.sku.unit ?? item.unit;

    // …EXCEPT that a PIECE COUNT is not a mass claim, and overriding it with
    // the SKU's 'kg' silently reinterprets it as one. Live case (2026-08-18):
    // the advisor correctly computed «۲۰ شاخه × ۱۴٫۵۲ کیلوگرم = ۲۹۰٫۳۷
    // کیلوگرم» and then the confirmation card under it read «وزن کل ۲۰
    // کیلوگرم» — because `unit` became 'kg', which made `weightKg` fall into
    // the `item.qty` branch below and take the SHAFT COUNT as kilograms, a
    // 14.5x understatement on a document the customer keeps.
    //
    // «۲۰ شاخه میلگرد ۱۴» is a completely ordinary way to order, so the right
    // move is to CONVERT, not to overrule: when the SKU is kg-denominated and
    // carries a theoretical per-piece weight, the piece unit is kept for
    // display and `weightKg` below derives the real mass from it. This cannot
    // resurrect the undercharge the comment above describes — `lineTotal` is
    // `unitPrice × weightKg`, so a (forged or mistaken) piece claim now
    // produces a HIGHER total, never a lower one — and `unitMismatch` still
    // withholds the automatic quote either way (see below).
    const pieceRequest =
      hit != null &&
      skuUnit === 'kg' &&
      // …and the price really is per kilogram. A kg-UNIT row whose price is
      // denominated per شاخه/کلاف has nothing to convert through.
      (hit.sku.priceBasis ?? 'kg') === 'kg' &&
      WHOLE_PIECE_UNITS.has(item.unit) &&
      // `piece` is excluded on purpose: it is the one unit whose price is NOT
      // per kilogram (see PRICE_UNITS), so «۲۰ عدد» of a kg-priced SKU is not
      // a convertible piece claim, it is a mismatch — and `unitMismatch`
      // below already routes that to a human.
      item.unit !== 'piece' &&
      typeof hit.sku.theoreticalWeightKg === 'number' &&
      hit.sku.theoreticalWeightKg > 0;
    const unit = pieceRequest ? item.unit : skuUnit;

    // A disagreement is not something to silently paper over: it means the
    // client is working from a stale catalog (an admin changed the SKU's unit
    // after this cart was built) or is forged. Either way the price basis is
    // not what the customer was shown, so this line does not get an automatic
    // quote — allPriced=false routes the whole lead to a human, which is the
    // same path an unpriced or stale-priced item already takes.
    //
    // Deliberately NOT relaxed for `pieceRequest`: the weight is now right,
    // but whether a piece-counted order gets an automatic binding quote is a
    // commercial decision, not a bug fix. «۲۰ شاخه» keeps going to a human
    // with the correct mass on the card, which is this shop's normal close
    // anyway («اول مشورت، بعد خرید»).
    const unitMismatch = hit != null && item.unit !== hit.sku.unit;

    // Same rule the admin edit path already enforced, now also on create:
    // «۳٫۷ شاخه» is a typo, not an order. Only here is the SKU's real unit
    // known, so this could not be expressed in the route's Zod schema.
    const fractionalPieces = WHOLE_PIECE_UNITS.has(unit) && !Number.isInteger(item.qty);

    const unitPrice = price && !hidden && !unitMismatch && !fractionalPieces ? price.price : undefined;

    // The denomination is stored, not assumed: `priceMath` owns both halves
    // of the arithmetic and `estimate.service` calls the same two functions,
    // so a new basis can no longer be handled correctly in one and wrongly in
    // the other. A `piece`/`coil`/`sheet`/`sqm` line has no mass on file at
    // all, which is why `weightKg` is left undefined rather than derived —
    // nothing downstream can then present a fabricated tonnage, and
    // `totalWeightKg` counts only material that really has one.
    const basis = hit?.sku.priceBasis ?? 'kg';
    const weightKg = lineWeightKg(basis, unit, item.qty, hit?.sku.theoreticalWeightKg);
    const lineTotal = lineTotalToman(basis, unit, item.qty, weightKg, unitPrice);
    // Gate on `lineTotal`, not `unitPrice` alone — a non-kg SKU can have a
    // live price but no `theoreticalWeightKg` on file, leaving `lineTotal`
    // undefined even though `unitPrice` is set. Gating on `unitPrice` alone
    // would have let `allPriced` stay true with a line silently missing its
    // total, which `Σ(lineTotal ?? 0)` would then have summed as a free 0 —
    // the same class of undercharge this whole fix exists to close.
    if (!lineTotal) allPriced = false;

    return {
      skuId: hit?.sku.id ?? item.skuId,
      name: hit?.sku.name ?? item.skuId,
      qty: item.qty,
      unit,
      weightKg,
      unitPrice,
      lineTotal,
    };
  });
  return { lines, allPriced };
}

export async function createLead(
  input: CreateLeadInput,
  session: AuthUser | null,
): Promise<CreateLeadResult> {
  const { lines, allPriced } = await priceItems(input.items);
  const ref = await nextRef('PF');
  const verified = Boolean(session && session.mobile === input.contact.mobile);

  const items = lines.map((l) => ({
    name: l.name,
    qty: l.qty,
    unit: l.unit,
    weightKg: l.weightKg,
    unitPrice: l.unitPrice,
    lineTotal: l.lineTotal,
  }));
  const totalWeightKg = lines.reduce((s, l) => s + (l.weightKg ?? 0), 0) || undefined;

  // Precompute the proforma financials OUTSIDE the transaction: getVatRate/
  // getHolidays/getSetting each borrow their own pool connection, and doing
  // that INSIDE the transaction (which holds one connection) deadlocks on a
  // single-connection backend. A fresh lead has no prior proforma, so its ref
  // is just `ref` (no proformasOfLead lookup needed).
  let proformaData:
    | { subtotal: number; vatRate: number; vatAmount: number; total: number; validUntil: Date }
    | null = null;
  if (allPriced && lines.length > 0) {
    const [vatRate, holidays, hour] = await Promise.all([
      getVatRate(),
      getHolidays(),
      getSetting<number>('QUOTE_VALIDITY_HOUR', 11),
    ]);
    const subtotal = lines.reduce((s, l) => s + (l.lineTotal ?? 0), 0);
    const vatAmount = Math.round(subtotal * vatRate);
    proformaData = { subtotal, vatRate, vatAmount, total: subtotal + vatAmount, validUntil: quoteValidUntil(new Date(), holidays, hour) };
  }

  // ALL DB writes (lead + items + proforma + account-inbox mirror) run in ONE
  // transaction (WRITES ONLY — every read is done above): a partial failure
  // rolls back to nothing rather than orphaning a lead without its proforma/
  // inbox row. The SMS is sent AFTER commit — an external side effect can't be
  // rolled back, so it must never fire for a request that didn't fully persist.
  let result: CreateLeadResult = { ref, items, totalWeightKg };
  let validUntilDate: Date | undefined;

  await getDb().transaction(async (tx) => {
    const lead = await insertLead(
      {
        ref,
        userId: session?.id,
        contactName: input.contact.name ?? session?.name,
        contactMobile: input.contact.mobile,
        contactVerified: verified,
        source: asSource(input.source),
        context: {
          ...(input.context ?? {}),
          ...(input.note ? { note: input.note } : {}),
          estimate: {
            totalWeightKg,
            totalPrice: lines.reduce((s, l) => s + (l.lineTotal ?? 0), 0) || undefined,
          },
        },
        channelPref: input.channel === 'whatsapp' ? 'whatsapp' : (input.channel ?? 'sms'),
        attribution: input.attribution ?? null,
        items: lines,
      },
      tx,
    );

    if (proformaData) {
      const proforma = await insertProforma({ leadId: lead.id, ref, lines, ...proformaData }, tx);
      validUntilDate = proforma.validUntil;
      result = {
        ref,
        proformaRef: proforma.ref,
        validUntil: proforma.validUntil.toISOString(),
        total: proforma.total,
        items,
        totalWeightKg,
      };
    }

    // Mirror into the account inbox so /account/requests shows it immediately.
    if (session) {
      await insertRequest(
        {
          userId: session.id,
          ref,
          type: 'proforma',
          title:
            lines.length > 0
              ? lines.map((l) => l.name).slice(0, 2).join('، ') + (lines.length > 2 ? ' و…' : '')
              : 'درخواست پیش‌فاکتور',
          detail: lines.length > 0 ? `${lines.length} قلم` : undefined,
          note: input.note,
          leadId: lead.id,
          status: result.proformaRef ? 'quoted' : 'submitted',
        },
        tx,
      );
    }
  });

  // AFTER commit — the record is durable, so now it's safe to text the ref:
  // a priced proforma with total+validity, or a plain "request received".
  await sendNotification(
    input.contact.mobile,
    proformaSmsNotification(ref, input.contact.name, result.total, validUntilDate),
  );

  return result;
}

/** The ONE quote a lead may have outstanding, or null.
 *
 *  `status = 'active'` on its own is NOT enough: expiry is swept lazily (see
 *  findProformaByRef / expireDueProformas), so a lapsed quote can sit in the
 *  table marked 'active' for up to ten minutes. Treating that as outstanding
 *  would block the one re-issue a rep is unambiguously right to make — the
 *  customer's quote just expired and they called back. */
export async function activeProformaOfLead(
  leadId: string,
  dbh: DbOrTx = getDb(),
): Promise<ProformaRow | null> {
  const rows = await dbh
    .select()
    .from(proformas)
    .where(
      and(eq(proformas.leadId, leadId), eq(proformas.status, 'active'), gt(proformas.validUntil, new Date())),
    )
    .orderBy(desc(proformas.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Void a lead's still-valid quotes so at most ONE is ever outstanding.
 *
 *  Re-issuing used to simply insert a second row: the customer held two live
 *  quotes with different refs and different totals and no way to know which
 *  one counted — and smsAutomation's proformaReminders texts EVERY active
 *  proforma, so 24h before expiry they were reminded of both. Genuinely
 *  expired rows are deliberately left alone: they belong to the expiry sweep,
 *  and 'cancelled' would misdescribe them. */
export async function supersedeActiveProformas(
  leadId: string,
  dbh: DbOrTx = getDb(),
): Promise<string[]> {
  const rows = await dbh
    .update(proformas)
    .set({ status: 'cancelled' })
    .where(
      and(eq(proformas.leadId, leadId), eq(proformas.status, 'active'), gt(proformas.validUntil, new Date())),
    )
    .returning({ ref: proformas.ref });
  return rows.map((r) => r.ref);
}

/** Move the pipeline the way issuing a quote actually moves it.
 *
 *  There is no 'quoted' LEAD status (LEAD_STATUSES = new|contacted|won|lost),
 *  so a quoted lead at minimum leaves 'new' — otherwise it stayed «تماس‌گرفته»/
 *  «جدید» and was indistinguishable from one where the rep only dialled. The
 *  MIRRORED user request DOES have 'quoted' (REQUEST_STATUSES), and createLead
 *  already sets it at creation time; an admin-side issue never did, so the
 *  customer's /account/requests inbox still read «ثبت شد» after a rep had
 *  quoted them and the rep had to hand-move a dropdown in another tab. */
export async function markLeadQuoted(
  lead: LeadRow,
): Promise<{ leadStatus: LeadRow['status']; requestSynced: boolean }> {
  // ONLY 'new' advances. Re-quoting an old deal must not drag a won/lost lead
  // back into the open pipeline (and back onto the rep's desk queue, which
  // filters on new|contacted).
  let leadStatus = lead.status;
  if (lead.status === 'new') {
    const updated = await updateLead(lead.id, { status: 'contacted' });
    leadStatus = updated?.status ?? 'contacted';
  }
  // `ne` so the flag reports a real change, not a no-op updatedAt bump. A
  // guest lead has no mirrored request at all — false, not an error.
  const synced = await getDb()
    .update(userRequests)
    .set({ status: 'quoted', updatedAt: new Date() })
    .where(and(eq(userRequests.leadId, lead.id), ne(userRequests.status, 'quoted')))
    .returning({ id: userRequests.id });
  return { leadStatus, requestSynced: synced.length > 0 };
}

/** The total tonnage a پیش‌فاکتور is quoting, in kilograms — the input the
 *  تخفیف پلکانی band is decided from.
 *
 *  A tier is a property of the ORDER, not of a SKU, so this sums the whole
 *  basket. `LineItem.weightKg` is already the LINE's total mass (qty
 *  included — see `lineWeightKg` in utils/priceMath), so this must NOT
 *  multiply by qty again. A line with no known weight (توافقی, or a
 *  per-piece SKU with no section table on file) contributes 0 rather than a
 *  guess: under-counting only ever costs the customer a discount they were
 *  never promised, while over-counting hands out money on invented tonnage. */
export function quotedWeightKg(lines: readonly LineItem[]): number {
  const kg = lines.reduce((s, l) => s + (Number.isFinite(l.weightKg) ? l.weightKg! : 0), 0);
  return Math.round(kg * 100) / 100;
}

/** Does this lead belong to an APPROVED business account (the owner's
 *  «یا حساب سازمانی تأییدشده» arm of the tier structure)?
 *
 *  Reads `users.biz_verify_status` — the same column, and the same
 *  'approved' comparison, that the «حساب سازمانی تأییدشده» badge is drawn
 *  from. 'pending' is deliberately NOT approved: a submitted-but-unreviewed
 *  company registration must not buy a price cut.
 *
 *  A guest lead (no userId) or a deleted account resolves to `false` — the
 *  tonnage path still applies, so the worst case is a verified buyer being
 *  quoted the same tier an unverified one would get, never a discount granted
 *  on an unverified account. A DB error is deliberately NOT swallowed: it
 *  fails the whole issuance rather than quietly printing a sheet at a tier we
 *  could not actually confirm. */
async function leadHasVerifiedBusiness(lead: LeadRow): Promise<boolean> {
  if (!lead.userId) return false;
  const rows = await getDb()
    .select({ status: users.bizVerifyStatus })
    .from(users)
    .where(eq(users.id, lead.userId))
    .limit(1);
  return rows[0]?.status === 'approved';
}

/** Issue (or re-issue) a proforma for a lead from its priced lines.
 *
 *  Two independent discounts come off `subtotal`, BOTH before VAT:
 *
 *   1. تخفیف پلکانی — the RULE-BASED volume discount, derived from the
 *      basket's total tonnage and the buyer's business-verification status
 *      via `resolveVolumeTier`. Not a caller input: it is a published
 *      entitlement, so a rep can neither forget it nor hand it out early.
 *   2. `discountToman` (US-19.4) — the rep's flat, per-deal figure on top.
 *
 *  Ordering matters and is deliberate: the volume discount is taken FIRST
 *  and the manual one is then clamped into whatever is left. The tier
 *  discount is the customer's entitlement, so it must survive a rep typing
 *  an oversized manual figure; without this ordering a fat-fingered manual
 *  discount would silently swallow the tier the sheet still claims to grant.
 *  Their sum can never exceed `subtotal`, so `taxable` never goes negative.
 *
 *  Always supersedes the lead's outstanding quote (see
 *  supersedeActiveProformas) — the "exactly one active proforma per lead"
 *  invariant holds no matter which caller issues. Callers that need to TELL
 *  the rep what was voided should read activeProformaOfLead first; that read
 *  is also what gates a re-issue behind explicit intent. */
export async function issueProforma(
  lead: LeadRow,
  lines: LineItem[],
  dbh?: DbOrTx,
  discountToman = 0,
) {
  const [vatRate, holidays, hour, businessVerified] = await Promise.all([
    getVatRate(),
    getHolidays(),
    getSetting<number>('QUOTE_VALIDITY_HOUR', 11),
    leadHasVerifiedBusiness(lead),
  ]);
  const subtotal = lines.reduce((s, l) => s + (l.lineTotal ?? 0), 0);

  const weightKg = quotedWeightKg(lines);
  const resolved = resolveVolumeTier({ totalWeightKg: weightKg, businessVerified });
  const volumeDiscount = volumeDiscountToman(subtotal, resolved.tier);

  // Clamped into what the tier discount left behind, not into `subtotal` —
  // see the ordering note above.
  const discount = Math.min(Math.max(discountToman, 0), subtotal - volumeDiscount);
  const taxable = subtotal - volumeDiscount - discount;
  const vatAmount = Math.round(taxable * vatRate);
  const total = taxable + vatAmount;
  const validUntil = quoteValidUntil(new Date(), holidays, hour);
  // First issue reuses the lead's human ref; re-issues get a fresh one.
  const existing = await proformasOfLead(lead.id, dbh);
  const ref = existing.length === 0 ? lead.ref : await nextRef('PF');
  // BEFORE the insert, never after — the predicate matches any active row of
  // this lead, so voiding afterwards would cancel the quote we just issued.
  await supersedeActiveProformas(lead.id, dbh);
  return insertProforma(
    {
      leadId: lead.id,
      ref,
      lines,
      subtotal,
      discountToman: discount,
      volumeDiscountToman: volumeDiscount,
      // Null rather than 'retail' when nothing was earned: the columns then
      // read the same on a pre-scheme proforma and on a base-price one, and
      // every display site already tests the amount, not the band.
      volumeTier: volumeDiscount > 0 ? resolved.tier.id : null,
      volumeDiscountLabel: volumeDiscount > 0 ? volumeDiscountLabel(resolved) : null,
      quotedWeightKg: weightKg > 0 ? weightKg : null,
      vatRate,
      vatAmount,
      total,
      validUntil,
    },
    dbh,
  );
}

/* ---------------------------- warehouse requests (W20) ---------------------------- */

export interface CreateWarehouseRequestInput {
  product: string;
  quantityTons: number;
  duration: string;
  notes?: string;
}

export interface CreateWarehouseRequestResult {
  ref: string; // the lead ref — what the customer's confirmation SMS names
}

/** Shared warehouse-request SMS text — the fallback for
 *  warehouseRequestSmsNotification() below when no template is configured. */
export function warehouseRequestSmsText(ref: string, name: string | null | undefined): string {
  const who = name?.trim() || 'مشتری';
  const link = `${publicEnv.NEXT_PUBLIC_SITE_URL}/account/requests`;
  return `آهن‌تایم: ${who} عزیز، درخواست نگهداری کالای شما ثبت شد. کد پیگیری: ${ref}. کارشناسان به‌زودی تماس می‌گیرند. پیگیری: ${link}`;
}

export function warehouseRequestSmsNotification(
  ref: string,
  name: string | null | undefined,
): { templateEnvVar: string; params: TemplateParam[]; fallbackText: string; kind: 'generic' } {
  return {
    templateEnvVar: 'SMSIR_TEMPLATE_ID_WAREHOUSE_REQUEST',
    params: [
      { name: 'NAME', value: customerNameParam(name) },
      { name: 'REF', value: truncateParam(ref) },
    ],
    fallbackText: warehouseRequestSmsText(ref, name),
    kind: 'generic',
  };
}

/**
 * A customer's «انبار مشتریان» storage ask, wired the same way createLead()
 * wires a proforma ask (W20) — this was the single biggest gap the audit
 * found: the public form had never called any API at all, so a request went
 * nowhere: no lead, no entry in the rep's queue, no SMS, gone the moment the
 * browser was cleared. This makes it a REAL lead (source='warehouse', so it
 * lands in the CRM pipeline exactly like every other lead — assignable,
 * trackable, SMS-able) plus a mirrored row in the customer's own «درخواست‌های
 * من» inbox, in one transaction, then texts the confirmation after commit —
 * same ordering discipline as createLead: an SMS is an external side effect
 * that can't be undone, so it must never announce a ref that failed to
 * persist.
 */
export async function createWarehouseRequest(
  input: CreateWarehouseRequestInput,
  session: AuthUser,
): Promise<CreateWarehouseRequestResult> {
  const ref = await nextRef('LD');

  await getDb().transaction(async (tx) => {
    const lead = await insertLead(
      {
        ref,
        userId: session.id,
        contactName: session.name,
        contactMobile: session.mobile,
        contactVerified: true, // the session IS the contact — always verified
        source: 'warehouse',
        context: {
          warehouse: { product: input.product, quantityTons: input.quantityTons, duration: input.duration },
          ...(input.notes ? { note: input.notes } : {}),
        },
        items: [],
      },
      tx,
    );

    await insertRequest(
      {
        userId: session.id,
        ref,
        type: 'warehouse',
        title: `نگهداری ${input.product}، ${input.quantityTons} تن`,
        detail: `مدت نگهداری: ${input.duration}`,
        note: input.notes,
        leadId: lead.id,
      },
      tx,
    );
  });

  // AFTER commit — same rationale as createLead: never text a ref that
  // didn't durably persist.
  await sendNotification(session.mobile, warehouseRequestSmsNotification(ref, session.name));

  return { ref };
}

/* ------------------------- cut-to-size requests ------------------------- */

export interface CreateCutToSizeRequestInput {
  /** The material the customer already has / wants converted. */
  product: string;
  /** Its current spec/dimensions (optional — some customers only know the target). */
  currentDimensions?: string;
  /** The dimensions they want it cut/converted to — the whole point of the ask. */
  requestedDimensions: string;
  /** Free-text quantity (unit varies: برگ / شاخه / تن …), so a plain string. */
  quantity: string;
  notes?: string;
}

export interface CreateCutToSizeRequestResult {
  ref: string;
}

/** Shared cut-to-size SMS text — the fallback for cutToSizeRequestSmsNotification()
 *  below when no template is configured. */
export function cutToSizeRequestSmsText(ref: string, name: string | null | undefined): string {
  const who = name?.trim() || 'مشتری';
  const link = `${publicEnv.NEXT_PUBLIC_SITE_URL}/account/requests`;
  return `آهن‌تایم: ${who} عزیز، درخواست برش/تبدیل کالا به ابعاد درخواستی شما ثبت شد. کد پیگیری: ${ref}. کارشناسان به‌زودی تماس می‌گیرند. پیگیری: ${link}`;
}

export function cutToSizeRequestSmsNotification(
  ref: string,
  name: string | null | undefined,
): { templateEnvVar: string; params: TemplateParam[]; fallbackText: string; kind: 'generic' } {
  return {
    templateEnvVar: 'SMSIR_TEMPLATE_ID_CUT_TO_SIZE_REQUEST',
    params: [
      { name: 'NAME', value: customerNameParam(name) },
      { name: 'REF', value: truncateParam(ref) },
    ],
    fallbackText: cutToSizeRequestSmsText(ref, name),
    kind: 'generic',
  };
}

/**
 * A customer's «کالا با ابعاد درخواستی» (cut-to-size) ask — wired exactly like
 * createWarehouseRequest: one transaction that files a REAL lead
 * (source='cutToSize', so it lands in the CRM pipeline like every other lead)
 * plus a mirrored row in the customer's own «درخواست‌های من» inbox, then texts
 * the confirmation strictly AFTER commit (never announce a ref that failed to
 * persist). Authenticated only — the form gates on login, and a cutting job
 * needs a real contact to call back.
 */
export async function createCutToSizeRequest(
  input: CreateCutToSizeRequestInput,
  session: AuthUser,
): Promise<CreateCutToSizeRequestResult> {
  const ref = await nextRef('LD');

  await getDb().transaction(async (tx) => {
    const lead = await insertLead(
      {
        ref,
        userId: session.id,
        contactName: session.name,
        contactMobile: session.mobile,
        contactVerified: true, // the session IS the contact — always verified
        source: 'cutToSize',
        context: {
          cutToSize: {
            product: input.product,
            ...(input.currentDimensions ? { currentDimensions: input.currentDimensions } : {}),
            requestedDimensions: input.requestedDimensions,
            quantity: input.quantity,
          },
          ...(input.notes ? { note: input.notes } : {}),
        },
        items: [],
      },
      tx,
    );

    await insertRequest(
      {
        userId: session.id,
        ref,
        type: 'cutToSize',
        title: `کالا با ابعاد درخواستی: ${input.product}`,
        detail: `ابعاد درخواستی: ${input.requestedDimensions} · مقدار: ${input.quantity}${input.currentDimensions ? ` · ابعاد فعلی: ${input.currentDimensions}` : ''}`,
        note: input.notes,
        leadId: lead.id,
      },
      tx,
    );
  });

  await sendNotification(session.mobile, cutToSizeRequestSmsNotification(ref, session.name));

  return { ref };
}


