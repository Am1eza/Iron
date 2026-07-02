/**
 * Lead → proforma flow (UX-flow F6): validate items → snapshot current prices
 * (hidden-stale → unpriced, flagged for sales) → insert lead → auto-issue the
 * پیش‌فاکتور when everything is priced → SMS the ref → mirror the request in
 * the user's inbox. One entry point for the table/cart/AI/tool sources.
 */
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { skus, currentPrices } from '@/lib/server/db/schema';
import type { AuthUser } from '@/lib/auth/types';
import type { LineItem, PriceUnit } from '@/lib/types/domain';
import { insertLead, insertProforma, proformasOfLead, type LeadRow } from '@/lib/server/repos/leadsRepo';
import { insertRequest } from '@/lib/server/repos/requestsRepo';
import { getVatRate, getHolidays, getSetting } from '@/lib/server/repos/settingsRepo';
import { nextRef } from '@/lib/server/utils/refs';
import { quoteValidUntil } from '@/lib/server/utils/jalali';
import { sendTemplateSms } from '@/lib/server/integrations/kavenegar';
import { getPriceFreshness } from '@/lib/server/services/priceFreshness';

export interface CreateLeadInput {
  contact: { name?: string; mobile: string };
  items: Array<{ skuId: string; qty: number; unit: PriceUnit }>;
  channel?: 'sms' | 'whatsapp' | 'telegram' | 'eitaa';
  source?: string;
  note?: string;
  context?: { aiConversationId?: string; sourcePage?: string };
}

export interface CreateLeadResult {
  ref: string;
  proformaRef?: string;
  validUntil?: string;
  total?: number;
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
  // Slug fallback: cart items created from mock-era rows carry slug ids.
  const bySlug = new Map(rows.map((r) => [r.sku.slug, r] as const));
  const slugRows = await db
    .select({ sku: skus, price: currentPrices })
    .from(skus)
    .leftJoin(currentPrices, eq(currentPrices.skuId, skus.id))
    .where(inArray(skus.slug, ids));
  for (const r of slugRows) bySlug.set(r.sku.slug, r);

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

  const lead = await insertLead({
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
        totalWeightKg: lines.reduce((s, l) => s + (l.weightKg ?? 0), 0) || undefined,
        totalPrice: lines.reduce((s, l) => s + (l.lineTotal ?? 0), 0) || undefined,
      },
    },
    channelPref: input.channel === 'whatsapp' ? 'whatsapp' : (input.channel ?? 'sms'),
    items: lines,
  });

  let result: CreateLeadResult = { ref };

  // Auto-issue the proforma when every line has a live price.
  if (allPriced && lines.length > 0) {
    const proforma = await issueProforma(lead, lines);
    result = {
      ref,
      proformaRef: proforma.ref,
      validUntil: proforma.validUntil.toISOString(),
      total: proforma.total,
    };
  }

  // SMS the reference (dev: logged). Template tokens: ref (+ total when priced).
  await sendTemplateSms(
    input.contact.mobile,
    process.env.KAVENEGAR_PROFORMA_TEMPLATE ?? 'ahantime-proforma',
    { token: ref, token2: result.total ? String(result.total) : '0' },
    'proforma',
  );

  // Mirror into the account inbox so /account/requests shows it immediately.
  if (session) {
    await insertRequest({
      userId: session.id,
      ref,
      type: 'proforma',
      title: lines.length > 0 ? lines.map((l) => l.name).slice(0, 2).join('، ') + (lines.length > 2 ? ' و…' : '') : 'درخواست پیش‌فاکتور',
      detail: lines.length > 0 ? `${lines.length} قلم` : undefined,
      note: input.note,
      leadId: lead.id,
      status: result.proformaRef ? 'quoted' : 'submitted',
    });
  }

  return result;
}

/** Issue (or re-issue) a proforma for a lead from its priced lines. */
export async function issueProforma(lead: LeadRow, lines: LineItem[]) {
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
  const existing = await proformasOfLead(lead.id);
  const ref = existing.length === 0 ? lead.ref : await nextRef('PF');
  return insertProforma({ leadId: lead.id, ref, lines, subtotal, vatRate, vatAmount, total, validUntil });
}


