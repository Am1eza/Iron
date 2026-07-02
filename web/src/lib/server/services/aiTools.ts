/**
 * Grounded AI tools — thin wrappers over the same services the site uses, so
 * every number the advisor quotes has one source of truth. The model never
 * invents a price/weight (acceptance-criteria §D: null/stale → «کارشناس تماس
 * می‌گیرد», never a guess).
 */
import { z } from 'zod';
import { searchSkus, findSkuRow } from '@/lib/server/repos/catalogRepo';
import { estimateProject } from '@/lib/server/services/estimate.service';
import { createLead } from '@/lib/server/services/leads.service';
import type { AuthUser } from '@/lib/auth/types';
import type { ToolDef } from '@/lib/server/integrations/deepseek';
import { finiteNumber } from '@/lib/validation/utils';

export const AI_TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'getPrice',
      description: 'قیمت روز یک محصول فولادی را از دیتابیس آهن‌تایم می‌گیرد. با نام/سایز/کارخانه جستجو کن.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'مثلاً «میلگرد ۱۴ ذوب‌آهن» یا slug محصول' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calcWeight',
      description: 'وزن تئوری مقاطع فولادی را دقیق محاسبه می‌کند (میلگرد/ورق/لوله/قوطی).',
      parameters: {
        type: 'object',
        properties: {
          shape: { type: 'string', enum: ['rebar', 'plate', 'pipe', 'box'] },
          diameterMm: { type: 'number' },
          thicknessMm: { type: 'number' },
          widthM: { type: 'number' },
          lengthM: { type: 'number' },
          widthMm: { type: 'number' },
          heightMm: { type: 'number' },
          outerDiameterMm: { type: 'number' },
          qty: { type: 'number' },
        },
        required: ['shape', 'qty'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'estimateProject',
      description: 'برآورد میلگرد و هزینهٔ اسکلت از متراژ و تعداد طبقات (قیمت میانگین روز).',
      parameters: {
        type: 'object',
        properties: { areaM2: { type: 'number' }, floors: { type: 'number' } },
        required: ['areaM2', 'floors'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createLead',
      description:
        'وقتی کاربر آماده است پیش‌فاکتور بگیرد: با موبایل و اقلام، درخواست ثبت می‌کند و شمارهٔ پیگیری برمی‌گرداند.',
      parameters: {
        type: 'object',
        properties: {
          mobile: { type: 'string', description: 'موبایل ۰۹xxxxxxxxx' },
          name: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                skuId: { type: 'string' },
                qty: { type: 'number' },
                unit: { type: 'string', enum: ['kg', 'branch', 'sheet', 'meter'] },
              },
              required: ['skuId', 'qty', 'unit'],
            },
          },
        },
        required: ['mobile', 'items'],
      },
    },
  },
];

const STEEL_DENSITY = 7.85;

const leadArgs = z.object({
  mobile: z.string().regex(/^09\d{9}$/),
  name: z.string().max(60).optional(),
  items: z
    .array(
      z.object({
        skuId: z.string().max(120),
        qty: finiteNumber.positive().max(100_000),
        unit: z.enum(['kg', 'branch', 'sheet', 'meter']),
      }),
    )
    .min(1)
    .max(100),
});

// Tool-call arguments are model-generated JSON — arguably the LEAST trusted
// input in the system (parsed straight from `call.function.arguments` with
// no other gate). Both need the same finite+bounded validation as the public
// HTTP endpoints backing the identical formulas (tools/weight, tools/estimate).
const calcWeightArgs = z.object({
  shape: z.enum(['rebar', 'plate', 'pipe', 'box']),
  qty: finiteNumber.positive().max(100_000),
  diameterMm: finiteNumber.positive().max(60).optional(),
  thicknessMm: finiteNumber.positive().max(200).optional(),
  widthM: finiteNumber.positive().max(4).optional(),
  lengthM: finiteNumber.positive().max(24).optional(),
  widthMm: finiteNumber.positive().max(600).optional(),
  heightMm: finiteNumber.positive().max(600).optional(),
  outerDiameterMm: finiteNumber.positive().max(1000).optional(),
});

const estimateProjectArgs = z.object({
  areaM2: finiteNumber.positive().max(100_000),
  floors: finiteNumber.int().positive().max(50),
});

function weight(shape: string, a: z.infer<typeof calcWeightArgs>): number | null {
  switch (shape) {
    case 'rebar':
      return a.diameterMm ? ((a.diameterMm * a.diameterMm) / 162) * (a.lengthM ?? 12) : null;
    case 'plate':
      return a.thicknessMm && a.widthM && a.lengthM ? a.thicknessMm * a.widthM * a.lengthM * STEEL_DENSITY : null;
    case 'pipe':
      return a.outerDiameterMm && a.thicknessMm
        ? (a.outerDiameterMm - a.thicknessMm) * a.thicknessMm * 0.02466 * (a.lengthM ?? 6)
        : null;
    case 'box':
      return a.widthMm && a.heightMm && a.thicknessMm
        ? (((a.widthMm + a.heightMm) * 2) / 1000) * a.thicknessMm * STEEL_DENSITY * (a.lengthM ?? 6)
        : null;
    default:
      return null;
  }
}

/** Execute one tool call; ALWAYS returns a JSON-safe result (errors as text). */
export async function runTool(
  name: string,
  args: Record<string, unknown>,
  session: AuthUser | null,
  conversationId?: string,
): Promise<unknown> {
  try {
    switch (name) {
      case 'getPrice': {
        const q = String(args.query ?? '').trim();
        if (!q) return { error: 'query لازم است.' };
        const direct = await findSkuRow(q);
        const rows = direct ? [direct] : await searchSkus(q, 5);
        return {
          results: rows.map((r) => ({
            skuId: r.id,
            slug: r.slug,
            name: r.name,
            factory: r.factory,
            size: r.size,
            unit: r.current.unit,
            // Hidden/stale → no number; the model must offer a کارشناس callback.
            price: r.current.priceHidden ? null : r.current.price,
            isStale: r.current.isStale,
            deliveryTime: r.current.priceHidden ? null : r.current.deliveryTime,
            updatedAt: r.current.updatedAt,
          })),
        };
      }
      case 'calcWeight': {
        const parsed = calcWeightArgs.safeParse(args);
        if (!parsed.success) return { error: 'ورودی ناقص است — ابعاد لازم را بپرس.' };
        const unitKg = weight(parsed.data.shape, parsed.data);
        if (!unitKg) return { error: 'ورودی ناقص است — ابعاد لازم را بپرس.' };
        return {
          unitWeightKg: Math.round(unitKg * 100) / 100,
          totalWeightKg: Math.round(unitKg * parsed.data.qty * 100) / 100,
        };
      }
      case 'estimateProject': {
        const parsed = estimateProjectArgs.safeParse(args);
        if (!parsed.success) return { error: 'متراژ و تعداد طبقات لازم است.' };
        return await estimateProject(parsed.data.areaM2, parsed.data.floors);
      }
      case 'createLead': {
        const parsed = leadArgs.safeParse(args);
        if (!parsed.success) return { error: 'اطلاعات ناقص است — موبایل و اقلام را کامل بپرس.' };
        const result = await createLead(
          {
            contact: { name: parsed.data.name, mobile: parsed.data.mobile },
            items: parsed.data.items,
            source: 'ai',
            context: { aiConversationId: conversationId },
          },
          session,
        );
        return result;
      }
      default:
        return { error: `ابزار ناشناخته: ${name}` };
    }
  } catch {
    return { error: 'اجرای ابزار ناموفق بود.' };
  }
}

export const AI_SYSTEM_PROMPT = `تو «مشاور هوشمند آهن‌تایم» هستی — دستیار خرید آهن‌آلات برای بازار ایران. قواعد قطعی:
1) هیچ قیمت، وزن یا عددی را از خودت نساز. هر عدد فقط از خروجی ابزارها (getPrice, calcWeight, estimateProject) می‌آید.
2) اگر ابزار قیمت null یا isStale برگرداند، بگو قیمت توسط کارشناس تأیید می‌شود و پیشنهاد ثبت درخواست بده — هرگز حدس نزن.
3) پاسخ‌ها فارسی، کوتاه و کاربردی؛ اعداد با جداکنندهٔ هزارگان.
4) وقتی کاربر آمادهٔ خرید/پیش‌فاکتور است، با ابزار createLead درخواست را ثبت کن و شمارهٔ پیگیری را اعلام کن.
5) خارج از حوزهٔ آهن/فولاد/ساخت‌وساز، مؤدبانه به موضوع برگرد.
آهن‌تایم: «اول مشورت، بعد خرید» — پرداخت آنلاین نداریم؛ فروش با پیش‌فاکتور و تماس کارشناس نهایی می‌شود.`;
