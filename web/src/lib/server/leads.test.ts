// @vitest-environment node
/**
 * P3 integration — the conversion spine on pglite: lead → priced lines →
 * auto-issued پیش‌فاکتور (VAT, validity) → SMS dev-log → account-inbox mirror,
 * plus refs, cooperation leads, orders/tracking and the requests import.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '@/test/db';
import { seedDatabase } from '@/lib/server/db/seed';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { tableRows } from '@/lib/server/repos/catalogRepo';
import {
  createLead,
  createWarehouseRequest,
  createCutToSizeRequest,
  cutToSizeRequestSmsText,
  proformaSmsText,
  proformaSmsNotification,
  orderSmsNotification,
} from '@/lib/server/services/leads.service';
import { runTool, capTranscript, AI_SYSTEM_PROMPT, AI_TOOLS } from '@/lib/server/services/aiTools';
import { getDraft, consumeDraft } from '@/lib/server/ai/leadDraft';
import { findProformaByRef } from '@/lib/server/repos/leadsRepo';
import { requestsForUser, insertRequest, pendingWarehouseRequests, updateRequestStatus } from '@/lib/server/repos/requestsRepo';
import {
  createOrder,
  findOrderByRef,
  updateOrderStatus,
  createWarehouseItem,
  updateWarehouseItem,
  InvalidStatusTransitionError,
} from '@/lib/server/repos/ordersRepo';
import { nextRef } from '@/lib/server/utils/refs';
import { quoteValidUntil, jalaliStamp } from '@/lib/server/utils/jalali';
import type { AuthUser } from '@/lib/auth/types';

let db: Db;
let close: () => Promise<void>;
const user: AuthUser = {
  id: 'u-admin',
  mobile: '09120000000',
  name: 'مدیر سیستم',
  role: 'admin',
  createdAt: new Date(0).toISOString(),
};

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seedDatabase(db, { historyDays: 3 });
}, 120_000);
afterAll(async () => {
  await close();
});

describe('proformaSmsText', () => {
  it('includes the customer name, total and Jalali validity when priced', () => {
    const text = proformaSmsText('PF-14050411-0001-ABCDEF', 'رضا کریمی', 782650, new Date('2026-07-04T07:30:00.000Z'));
    expect(text).toContain('رضا کریمی عزیز');
    expect(text).toContain('PF-14050411-0001-ABCDEF');
    expect(text).toContain('۷۸۲٬۶۵۰ تومان');
    expect(text).toContain('/proforma/PF-14050411-0001-ABCDEF');
  });

  it('falls back to a plain "we received it" message when unpriced', () => {
    const text = proformaSmsText('PF-14050411-0002-ABCDEF', 'رضا کریمی');
    expect(text).toContain('PF-14050411-0002-ABCDEF');
    expect(text).toContain('کارشناسان ما');
    expect(text).not.toContain('تومان');
  });

  // SMS.ir's template-approval policy requires a name variable in every
  // customer-facing template (rejected 3 templates for missing it) — a lead
  // can have no name on file, so this generic greeting is what actually goes
  // out instead of a blank "#NAME# عزیز،".
  it('falls back to «مشتری عزیز» when the lead has no name on file', () => {
    const text = proformaSmsText('PF-14050411-0002-ABCDEF', null);
    expect(text).toContain('مشتری عزیز');
  });
});

describe('proformaSmsNotification (template + fallback wiring)', () => {
  it('picks the ISSUED template with NAME/REF/AMOUNT/EXPIRY params when priced', () => {
    const spec = proformaSmsNotification('PF-14050411-0001-ABCDEF', 'رضا کریمی', 782650, new Date('2026-07-04T07:30:00.000Z'));
    expect(spec.templateEnvVar).toBe('SMSIR_TEMPLATE_ID_PROFORMA_ISSUED');
    expect(spec.params).toEqual([
      { name: 'NAME', value: 'رضا کریمی' },
      { name: 'REF', value: 'PF-14050411-0001-ABCDEF' },
      { name: 'AMOUNT', value: '۷۸۲٬۶۵۰' },
      { name: 'EXPIRY', value: '۱۴۰۵/۰۴/۱۳' },
    ]);
    // Fallback text must match the exact wording sendSms would have sent —
    // this is what actually ships until the template is registered.
    expect(spec.fallbackText).toBe(
      proformaSmsText('PF-14050411-0001-ABCDEF', 'رضا کریمی', 782650, new Date('2026-07-04T07:30:00.000Z')),
    );
  });

  it('picks the REQUEST template with NAME/REF when unpriced', () => {
    const spec = proformaSmsNotification('PF-14050411-0002-ABCDEF', 'رضا کریمی');
    expect(spec.templateEnvVar).toBe('SMSIR_TEMPLATE_ID_PROFORMA_REQUEST');
    expect(spec.params).toEqual([
      { name: 'NAME', value: 'رضا کریمی' },
      { name: 'REF', value: 'PF-14050411-0002-ABCDEF' },
    ]);
  });

  it('truncates a param value over SMS.ir\'s 25-character cap instead of failing', () => {
    // A real observed case: a long SKU/market label used as an alert's LABEL
    // param — proforma refs never hit this, but the same truncateParam() path
    // guards every param builder, so cover it once against a >25 char input.
    const spec = proformaSmsNotification('PF-14050411-0003-VERYLONGREFCODEHERE1234567890', 'رضا کریمی');
    expect(spec.params[1]!.value.length).toBeLessThanOrEqual(25);
    expect(spec.params[1]!.value.endsWith('…')).toBe(true);
  });
});

describe('orderSmsNotification (template + fallback wiring)', () => {
  it('carries NAME + REF params, with the existing free-text as fallback', () => {
    const spec = orderSmsNotification('OR-14050411-0001-ABCDEF', 'رضا کریمی');
    expect(spec.templateEnvVar).toBe('SMSIR_TEMPLATE_ID_ORDER_CONFIRMED');
    expect(spec.params).toEqual([
      { name: 'NAME', value: 'رضا کریمی' },
      { name: 'REF', value: 'OR-14050411-0001-ABCDEF' },
    ]);
    expect(spec.fallbackText).toContain('OR-14050411-0001-ABCDEF');
    expect(spec.fallbackText).toContain('/track');
  });
});

describe('refs & validity', () => {
  it('generates PF-{jalali}-{seq}-{random} refs with an atomic per-day sequence', async () => {
    const a = await nextRef('PF');
    const b = await nextRef('PF');
    const stamp = jalaliStamp(new Date());
    // The trailing random suffix is the actual unguessability guarantee for
    // the public proforma/track lookup endpoints (see refs.ts) — assert the
    // sequence prefix deterministically, the suffix only by shape.
    expect(a).toMatch(new RegExp(`^PF-${stamp}-0001-[A-Z2-9]{6}$`));
    expect(b).toMatch(new RegExp(`^PF-${stamp}-0002-[A-Z2-9]{6}$`));
    expect(a).not.toBe(b);
  });

  it('quoteValidUntil lands on a business day at 11:00 Tehran', () => {
    // Thursday 2026-07-02 → next business day is Saturday (Friday skipped).
    const thu = new Date('2026-07-02T10:00:00.000Z');
    const until = quoteValidUntil(thu, new Set(), 11);
    expect(until.getTime()).toBeGreaterThan(thu.getTime());
    // 11:00 Tehran == 07:30 UTC
    expect(until.toISOString()).toContain('T07:30:00');
    expect(until.getUTCDay()).not.toBe(5); // not Friday
  });
});

describe('lead → proforma flow', () => {
  it('creates the lead, auto-issues the proforma, SMS-logs and mirrors the inbox', async () => {
    const rows = await tableRows('rebar');
    const items = rows.slice(0, 2).map((r) => ({ skuId: r.id, qty: 10, unit: r.unit }));

    const result = await createLead(
      { contact: { name: 'مدیر سیستم', mobile: user.mobile }, items, channel: 'sms', source: 'cart' },
      user,
    );

    expect(result.ref).toMatch(/^PF-\d{8}-\d{4}-[A-Z2-9]{6}$/);
    expect(result.proformaRef).toBe(result.ref); // first issue reuses the lead ref
    expect(result.total).toBeGreaterThan(0);

    // Line items + total weight are surfaced (the AI advisor's confirmation
    // quotes these directly instead of re-deriving/guessing them — AC-D-3).
    expect(result.items).toHaveLength(2);
    expect(result.items![0]!.qty).toBe(10);
    expect(result.totalWeightKg).toBeGreaterThan(0);
    expect(result.totalWeightKg).toBeCloseTo(
      result.items!.reduce((s, i) => s + (i.weightKg ?? 0), 0),
      5,
    );

    // Proforma persisted with VAT math.
    const p = await findProformaByRef(result.ref);
    expect(p).not.toBeNull();
    expect(p!.total).toBe(p!.subtotal + p!.vatAmount);
    expect(p!.status).toBe('active');
    expect(p!.lines).toHaveLength(2);

    // SMS dev-logged.
    const sms = await db.select().from(schema.smsLog).where(eq(schema.smsLog.to, user.mobile));
    expect(sms.some((s) => s.kind === 'proforma' && s.status === 'dev_logged')).toBe(true);

    // Account inbox mirrored as quoted.
    const inbox = await requestsForUser(user.id);
    expect(inbox.rows.some((r) => r.ref === result.ref && r.status === 'quoted')).toBe(true);

    // Lead row verified (session mobile match).
    const lead = await db.select().from(schema.leads).where(eq(schema.leads.ref, result.ref));
    expect(lead[0]!.contactVerified).toBe(true);
    expect(lead[0]!.source).toBe('cart');
  });

  it('skips the proforma when a line is unpriced (sales follows up)', async () => {
    const rows = await tableRows('rebar');
    const sku = rows[5]!;
    await db.delete(schema.currentPrices).where(eq(schema.currentPrices.skuId, sku.id));

    const result = await createLead(
      { contact: { mobile: '09121111111' }, items: [{ skuId: sku.id, qty: 5, unit: sku.unit }], source: 'table' },
      null,
    );
    expect(result.proformaRef).toBeUndefined();
    const p = await findProformaByRef(result.ref);
    expect(p).toBeNull();
    // Even unpriced, the resolved item (name/qty) is still surfaced so the
    // advisor can confirm WHAT was requested while pricing awaits a کارشناس.
    expect(result.items).toHaveLength(1);
    expect(result.items![0]!.unitPrice).toBeUndefined();
  });

  it('prepareProforma files NOTHING — it prepares a priced draft for the user to confirm', async () => {
    const rows = await tableRows('rebar');
    const sku = rows[0]!;
    const before = await db.select().from(schema.leads);

    const emitted: Record<string, unknown>[] = [];
    const result = (await runTool(
      'prepareProforma',
      { items: [{ skuId: sku.id, qty: 2, unit: sku.unit }] },
      null,
      'conv-draft-1',
      [{ role: 'user', content: 'دو شاخه میلگرد می‌خوام' }],
      (d) => emitted.push(d),
    )) as { status: string; draftId: string; signedIn: boolean };

    // No lead, no proforma, no SMS: the visitor has not confirmed anything yet.
    expect(result.status).toBe('awaiting_user_confirmation');
    expect(await db.select().from(schema.leads)).toHaveLength(before.length);

    // The card the client renders — priced line items, straight from priceItems.
    expect(emitted).toHaveLength(1);
    const card = emitted[0] as { draftId: string; items: Array<{ name: string; qty: number }>; signedIn: boolean };
    expect(card.draftId).toBe(result.draftId);
    expect(card.items).toHaveLength(1);
    expect(card.items[0]!.qty).toBe(2);
    expect(card.signedIn).toBe(false);

    // The draft the confirm route will consume carries the chat for sales.
    const draft = await getDraft(result.draftId);
    expect(draft?.conversationId).toBe('conv-draft-1');
    expect(draft?.items).toEqual([{ skuId: sku.id, qty: 2, unit: sku.unit }]);
    expect(draft?.transcript).toEqual([{ role: 'user', content: 'دو شاخه میلگرد می‌خوام' }]);
    // Single-use — a replayed confirm must not mint a second lead.
    expect(await consumeDraft(result.draftId)).not.toBeNull();
    expect(await getDraft(result.draftId)).toBeNull();
  });

  /**
   * LIVE BUG (owner, signed in, ahantime.com/ai): asked for «۳ تن میلگرد ۱۴,
   * تحویل تهران» and the advisor answered by asking HIM for the internal id —
   * «لطفاً کد商品 (skuId) محصول را به من بدهید» — Chinese character and all
   * (an undescribed `skuId` field left the multilingual model to invent both
   * the concept and the word for it). The customer has no such code. The tool
   * must resolve the product from the words the customer actually used.
   */
  it('resolves the product from plain Persian — the customer is never asked for an id', async () => {
    const rows = await tableRows('rebar');
    const sku = rows[0]!;
    const emitted: Record<string, unknown>[] = [];

    // Exactly what the model can know from «۳ تن میلگرد ۱۴»: a product NAME
    // and a tonnage. No skuId anywhere — none was ever quoted in the chat.
    const result = (await runTool(
      'prepareProforma',
      { items: [{ product: sku.name, qty: 3000, unit: 'kg' }] },
      null,
      'conv-resolve-1',
      undefined,
      (d) => emitted.push(d),
    )) as { status?: string; draftId?: string; error?: string };

    expect(result.error).toBeUndefined();
    expect(result.status).toBe('awaiting_user_confirmation');
    expect(emitted).toHaveLength(1);
    const card = emitted[0] as { items: Array<{ name: string; qty: number }> };
    // A REAL catalog product name on the card, not the raw string echoed back.
    expect(card.items[0]!.name).toBe(sku.name);
    expect(card.items[0]!.qty).toBe(3000);
    const draft = await getDraft(result.draftId!);
    expect(draft?.items[0]!.skuId).toBe(sku.id);
  });

  it('an unknown product asks for the product in words, never for a code', async () => {
    const result = (await runTool(
      'prepareProforma',
      { items: [{ product: 'یک چیز کاملاً نامربوط ۹۹۹', qty: 1, unit: 'kg' }] },
      null,
    )) as { error?: string };
    expect(result.error).toContain('پیدا نشد');
    expect(result.error).toContain('هرگز از کاربر کد یا شناسه نخواه');
  });

  it('rejects a line with neither a product name nor an id, instead of filing nonsense', async () => {
    const result = (await runTool('prepareProforma', { items: [{ qty: 2, unit: 'kg' }] }, null)) as {
      error?: string;
    };
    expect(result.error).toContain('نام محصول');
  });

  // The prompt path the model reads must not itself contain a non-Persian
  // word it can copy — this is what «کد商品» looked like from the inside.
  it('no CJK character exists anywhere in the tool schemas or the system prompt', () => {
    const cjk = /[　-〿㐀-䶿一-鿿＀-￯]/;
    expect(cjk.test(AI_SYSTEM_PROMPT)).toBe(false);
    expect(cjk.test(JSON.stringify(AI_TOOLS))).toBe(false);
  });

  it('the transcript handed to sales is capped (20 newest turns, 1000 chars each)', () => {
    const transcript = Array.from({ length: 25 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `پیام شمارهٔ ${i}`,
    }));
    transcript.push({ role: 'user', content: 'ب'.repeat(1500) });

    const capped = capTranscript(transcript)!;
    expect(capped).toHaveLength(20);
    expect(capped[0]).toEqual({ role: 'user', content: 'پیام شمارهٔ 6' });
    expect(capped[19]!.content).toHaveLength(1000);
    expect(capTranscript([])).toBeUndefined();
  });
});

describe('orders & tracking', () => {
  it('creates an order and finds it by normalized ref (Persian digits ok)', async () => {
    const ref = await nextRef('OR');
    await createOrder({
      ref,
      userId: user.id,
      items: [{ skuId: '', name: 'میلگرد ۱۴', qty: 10, unit: 'branch' }],
    });
    const persianRef = ref.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!);
    const found = await findOrderByRef(persianRef);
    expect(found?.ref).toBe(ref);
    expect(found?.status).toBe('registered');

    const advanced = await updateOrderStatus(ref, 'in_transit');
    expect(advanced?.order.status).toBe('in_transit');
  });

  it('rejects a backward order-status transition (delivered -> registered)', async () => {
    const ref = await nextRef('OR');
    await createOrder({ ref, userId: user.id, items: [{ skuId: '', name: 'تیرآهن', qty: 2, unit: 'branch' }] });
    await updateOrderStatus(ref, 'delivered');
    await expect(updateOrderStatus(ref, 'registered')).rejects.toThrow(InvalidStatusTransitionError);
    // Rejected transition must not have partially applied.
    const found = await findOrderByRef(ref);
    expect(found?.status).toBe('delivered');
  });

  it('rejects a backward warehouse-status transition (released -> stored)', async () => {
    const item = await createWarehouseItem({
      ref: await nextRef('WH'),
      userId: user.id,
      product: 'ورق سیاه',
      quantityTons: 5,
      actorId: null,
    });
    await updateWarehouseItem(item.id, { status: 'released' });
    await expect(updateWarehouseItem(item.id, { status: 'stored' })).rejects.toThrow(InvalidStatusTransitionError);
  });
});

describe('requests inbox', () => {
  it('imports legacy localStorage refs idempotently', async () => {
    const first = await insertRequest({ userId: user.id, ref: 'RQ-LEGACY-1', type: 'bulk', title: 'خرید عمده' });
    const dupe = await insertRequest({ userId: user.id, ref: 'RQ-LEGACY-1', type: 'bulk', title: 'خرید عمده' });
    expect(first).not.toBeNull();
    expect(dupe).toBeNull(); // ON CONFLICT DO NOTHING
  });
});

describe('createWarehouseRequest (W20/W21 — the public request → admin intake pipeline)', () => {
  it('creates a real CRM lead (source=warehouse) and a mirrored request row, both carrying the same ref', async () => {
    const result = await createWarehouseRequest(
      { product: 'میلگرد آجدار', quantityTons: 12, duration: '۳ ماه', notes: 'تحویل آخر هفته' },
      user,
    );
    expect(result.ref).toMatch(/^LD-/);

    const requests = await requestsForUser(user.id, 1, 100);
    const mine = requests.rows.find((r) => r.ref === result.ref);
    expect(mine).toBeDefined();
    expect(mine!.type).toBe('warehouse');
    expect(mine!.status).toBe('submitted');
    expect(mine!.title).toContain('میلگرد آجدار');
    expect(mine!.title).toContain('12');

    // Confirms the lead behind it actually carries the structured context
    // (source=warehouse, context.warehouse) — verified end-to-end through
    // pendingWarehouseRequests() rather than a direct lead lookup, since
    // that's the exact read path the admin intake queue depends on.
    const pending = await pendingWarehouseRequests();
    const row = pending.find((r) => r.ref === result.ref);
    expect(row).toBeDefined();
    expect(row!.leadId).not.toBeNull();
    expect(row!.product).toBe('میلگرد آجدار');
    expect(row!.quantityTons).toBe(12);
    expect(row!.duration).toBe('۳ ماه');
  });

  it('shows up in the admin intake queue with structured product/quantity from the lead context, and disappears once fulfilled', async () => {
    const result = await createWarehouseRequest({ product: 'ورق سیاه', quantityTons: 7, duration: '۱ ماه' }, user);

    const before = await pendingWarehouseRequests();
    const row = before.find((r) => r.ref === result.ref);
    expect(row).toBeDefined();
    expect(row!.customerMobile).toBe(user.mobile);
    expect(row!.product).toBe('ورق سیاه');
    expect(row!.quantityTons).toBe(7);

    // Simulates what POST /api/admin/warehouse does once the goods are
    // actually received: mark the source request fulfilled.
    await updateRequestStatus(row!.id, 'fulfilled');

    const after = await pendingWarehouseRequests();
    expect(after.find((r) => r.ref === result.ref)).toBeUndefined();
  });
});

describe('createCutToSizeRequest (کالا با ابعاد درخواستی — public request → CRM lead)', () => {
  it('creates a real CRM lead (source=cutToSize) and a mirrored request row, both carrying the same ref and the requested dimensions', async () => {
    const result = await createCutToSizeRequest(
      {
        product: 'ورق سیاه',
        currentDimensions: 'ورق ۶ میل، ۱۲۵۰×۲۵۰۰',
        requestedDimensions: 'برش به ۱۰۰۰×۲۰۰۰',
        quantity: '۵۰ برگ',
        notes: 'لبه‌ها صاف باشد',
      },
      user,
    );
    expect(result.ref).toMatch(/^LD-/);

    // The customer-facing mirror row.
    const requests = await requestsForUser(user.id, 1, 100);
    const mine = requests.rows.find((r) => r.ref === result.ref);
    expect(mine).toBeDefined();
    expect(mine!.type).toBe('cutToSize');
    expect(mine!.status).toBe('submitted');
    expect(mine!.title).toContain('ورق سیاه');
    expect(mine!.detail).toContain('۱۰۰۰×۲۰۰۰'); // the whole point of the ask surfaces in the row

    // The CRM lead behind it: source + structured context the rep reads back.
    const [lead] = await db
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.ref, result.ref));
    expect(lead).toBeDefined();
    expect(lead!.source).toBe('cutToSize');
    expect(lead!.context?.cutToSize?.requestedDimensions).toBe('برش به ۱۰۰۰×۲۰۰۰');
    expect(lead!.context?.cutToSize?.quantity).toBe('۵۰ برگ');
    expect(lead!.contactMobile).toBe(user.mobile);
  });

  it('omits currentDimensions from the context when the customer left it blank', async () => {
    const result = await createCutToSizeRequest(
      { product: 'میلگرد', requestedDimensions: 'شاخهٔ ۶ متری', quantity: '۲۰ شاخه' },
      user,
    );
    const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.ref, result.ref));
    expect(lead!.context?.cutToSize?.currentDimensions).toBeUndefined();
    expect(lead!.context?.cutToSize?.requestedDimensions).toBe('شاخهٔ ۶ متری');
  });

  it('cutToSizeRequestSmsText names the customer and the tracking ref', () => {
    const txt = cutToSizeRequestSmsText('LD-1404-7-abc', 'رضا');
    expect(txt).toContain('رضا');
    expect(txt).toContain('LD-1404-7-abc');
    expect(txt).toContain('ابعاد');
  });
});
