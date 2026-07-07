/**
 * Lead → proforma flow (UX-flow F6): validate items → snapshot current prices
 * (hidden-stale → unpriced, flagged for sales) → insert lead → auto-issue the
 * پیش‌فاکتور when everything is priced → SMS the ref → mirror the request in
 * the user's inbox. One entry point for the table/cart/AI/tool sources.
 */
import { eq, inArray } from 'drizzle-orm';
import { getDb, type DbOrTx } from '@/lib/server/db/client';
import { skus, currentPrices } from '@/lib/server/db/schema';
import type { AuthUser } from '@/lib/auth/types';
import type { LineItem, PriceUnit } from '@/lib/types/domain';
import { insertLead, insertProforma, proformasOfLead, type LeadRow } from '@/lib/server/repos/leadsRepo';
import { insertRequest } from '@/lib/server/repos/requestsRepo';
import { getVatRate, getHolidays, getSetting } from '@/lib/server/repos/settingsRepo';
import { nextRef } from '@/lib/server/utils/refs';
import { quoteValidUntil } from '@/lib/server/utils/jalali';
import { sendSms } from '@/lib/server/integrations/smsir';
import { getPriceFreshness } from '@/lib/server/services/priceFreshness';
import { publicEnv } from '@/lib/validation/env';
import { formatJalali, formatToman } from '@/lib/utils/format';

/** Shared proforma-ref SMS text — used on first issue and on admin re-issue. */
export function proformaSmsText(ref: string, total?: number, validUntil?: Date): string {
  const link = `${publicEnv.NEXT_PUBLIC_SITE_URL}/proforma/${ref}`;
  if (total && validUntil) {
    return `آهن‌تایم: پیش‌فاکتور شما صادر شد. کد پیگیری: ${ref} — مبلغ: ${formatToman(total)} — اعتبار تا ${formatJalali(validUntil)} ساعت ۱۱:۰۰. مشاهده: ${link}`;
  }
  return `آهن‌تایم: درخواست شما با کد پیگیری ${ref} ثبت شد. کارشناسان ما به‌زودی با شما تماس می‌گیرند. پیگیری: ${link}`;
}

export interface CreateLeadInput {
  contact: { name?: string; mobile: string };
  items: Array<{ skuId: string; qty: number; unit: PriceUnit }>;
  channel?: 'sms' | 'whatsapp' | 'telegram' | 'eitaa';
  source?: string;
  note?: string;
  context?: {
    aiConversationId?: string;
    sourcePage?: string;
    /** AI-advisor chat that led to this lead (capped upstream) — sales context. */
    transcript?: Array<{ role: string; content: string }>;
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

const KNOWN_SOURCES = ['table', 'ai', 'cart', 'cooperation', 'tool', 'warehouse', 'contact'] as const;
type LeadSource = (typeof KNOWN_SOURCES)[number];

function asSource(s?: string): LeadSource {
  return (KNOWN_SOURCES as readonly string[]).includes(s ?? '') ? (s as LeadSource) : 'cart';
}

/** Resolve items against the catalog and snapshot prices (skip hidden-stale). */
async function priceItems(
  items: CreateLeadInput['items'],
): Promise<{ lines: LineItem[]; allPriced: boolean }> {
  const db = getDb();
  const ids = items.map((i) => i.skuId);
  const rows = await db
    .select({ sku: skus, price: currentPrices })
    .from(skus)
    .leftJoin(currentPrices, eq(currentPrices.skuId, skus.id))
    .where(inArray(skus.id, ids));
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
      .where(inArray(skus.slug, unresolved));
    for (const r of slugRows) bySlug.set(r.sku.slug, r);
  }

  const freshness = await getPriceFreshness();

  let allPriced = true;
  const lines: LineItem[] = items.map((item) => {
    const hit = bySku.get(item.skuId) ?? bySlug.get(item.skuId);
    const price = hit?.price ?? null;
    const hidden = price ? freshness.isHidden(price.updatedAt) : true;
    const unitPrice = price && !hidden ? price.price : undefined;
    if (!unitPrice) allPriced = false;
    const weightKg =
      item.unit === 'kg'
        ? item.qty
        : hit?.sku.theoreticalWeightKg
          ? Math.round(hit.sku.theoreticalWeightKg * item.qty * 100) / 100
          : undefined;
    return {
      skuId: hit?.sku.id ?? item.skuId,
      name: hit?.sku.name ?? item.skuId,
      qty: item.qty,
      unit: item.unit,
      weightKg,
      unitPrice,
      lineTotal: unitPrice ? Math.round(unitPrice * item.qty) : undefined,
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
  await sendSms(input.contact.mobile, proformaSmsText(ref, result.total, validUntilDate), 'proforma');

  return result;
}

/** Issue (or re-issue) a proforma for a lead from its priced lines. */
export async function issueProforma(lead: LeadRow, lines: LineItem[], dbh?: DbOrTx) {
  const [vatRate, holidays, hour] = await Promise.all([
    getVatRate(),
    getHolidays(),
    getSetting<number>('QUOTE_VALIDITY_HOUR', 11),
  ]);
  const subtotal = lines.reduce((s, l) => s + (l.lineTotal ?? 0), 0);
  const vatAmount = Math.round(subtotal * vatRate);
  const total = subtotal + vatAmount;
  const validUntil = quoteValidUntil(new Date(), holidays, hour);
  // First issue reuses the lead's human ref; re-issues get a fresh one.
  const existing = await proformasOfLead(lead.id, dbh);
  const ref = existing.length === 0 ? lead.ref : await nextRef('PF');
  return insertProforma({ leadId: lead.id, ref, lines, subtotal, vatRate, vatAmount, total, validUntil }, dbh);
}


