/**
 * Grounded tool registry for the AI advisor (acceptance-criteria §D).
 * The model TALKS; these tools decide every number. They read the same catalog
 * the price tables render (mock now, live API later — one swap point), so the
 * advisor can never disagree with the site. Pure + server-safe + unit-tested.
 */
import { getRows, getSubRows } from '@/lib/mock/catalogData';
import { CATEGORY_SUBS } from '@/lib/data/nav';
import { computeBulkSplit } from '@/lib/utils/bulkSplit';
import { normalizeDigits, toPersianDigits } from '@/lib/utils/format';
import type { PriceRow } from '@/lib/types/domain';
import type { GroundingLedger } from './grounding';

/* ------------------------------------------------------------------ */
/* Category / size normalization — the model may pass Persian names,   */
/* Latin slugs, either digit script.                                   */
/* ------------------------------------------------------------------ */

const CATEGORY_ALIASES: { re: RegExp; slug: string; name: string }[] = [
  { re: /rebar|میلگرد/, slug: 'rebar', name: 'میلگرد' },
  { re: /ibeam|beam|تیرآهن|تیراهن|هاش/, slug: 'ibeam', name: 'تیرآهن' },
  { re: /sheet|ورق/, slug: 'sheet', name: 'ورق' },
  { re: /profile|پروفیل|قوطی/, slug: 'profile', name: 'پروفیل' },
  { re: /angle|channel|نبشی|ناودانی|سپری/, slug: 'angle-channel', name: 'نبشی و ناودانی' },
  { re: /pipe|لوله/, slug: 'pipe', name: 'لوله' },
  { re: /wire|مفتول|سیم|کلاف|توری/, slug: 'wire', name: 'سیم و مفتول' },
];

export function resolveCategory(input: string): { slug: string; name: string } | null {
  const t = normalizeDigits(String(input)).toLowerCase();
  return CATEGORY_ALIASES.find((c) => c.re.test(t)) ?? null;
}

function resolveSub(categorySlug: string, input?: string): string | undefined {
  if (!input) return undefined;
  const t = String(input).toLowerCase();
  const subs = CATEGORY_SUBS[categorySlug] ?? [];
  return subs.find((s) => s.slug === t || s.name.includes(input) || input.includes(s.name))?.slug;
}

/** Compare sizes across digit scripts: «۱۴» === "14". */
function sameSize(a: string, b: string): boolean {
  return normalizeDigits(a).replace(/\s/g, '') === normalizeDigits(b).replace(/\s/g, '');
}

function pickRows(categorySlug: string, sub?: string, size?: string, factory?: string): PriceRow[] {
  const subSlug = resolveSub(categorySlug, sub);
  let rows = subSlug ? getSubRows(categorySlug, subSlug) : getRows(categorySlug);
  if (size) rows = rows.filter((r) => r.size && sameSize(r.size, size));
  if (factory) rows = rows.filter((r) => r.factory?.includes(factory));
  return rows;
}

/* ------------------------------------------------------------------ */
/* Tool result shapes (also power the UI cards)                        */
/* ------------------------------------------------------------------ */

export type EstimateCardData = {
  items: { name: string; weightKg: number }[];
  totalKg: number;
  totalToman: number;
};

export type SplitCardData = {
  categoryName: string;
  split: ReturnType<typeof computeBulkSplit>;
};

/** Structured UI card a tool may attach to the reply (streamed as an SSE event). */
export type ToolCard =
  | { kind: 'estimate'; estimate: EstimateCardData }
  | { kind: 'split'; split: SplitCardData };

export interface ToolOutcome {
  /** JSON payload handed back to the model (numbers auto-registered in the ledger). */
  result: unknown;
  card?: ToolCard;
}

/* ------------------------------------------------------------------ */
/* Tool implementations                                                */
/* ------------------------------------------------------------------ */

function toolGetPrices(args: Record<string, unknown>): ToolOutcome {
  const cat = resolveCategory(String(args.category ?? ''));
  if (!cat) return { result: { error: 'دستهٔ محصول شناخته نشد', available: CATEGORY_ALIASES.map((c) => c.name) } };
  const rows = pickRows(cat.slug, args.sub as string | undefined, args.size as string | undefined, args.factory as string | undefined);
  if (rows.length === 0)
    return { result: { error: 'برای این مشخصات قیمتی ثبت نشده؛ کارشناس اعلام می‌کند.', category: cat.name } };
  // Compact top rows (cheapest first) — small payload keeps tokens (cost) down.
  const sorted = [...rows].sort((a, b) => a.current.price - b.current.price).slice(0, 8);
  const prices = sorted.map((r) => ({
    name: r.name,
    factory: r.factory,
    size: r.size,
    pricePerKgToman: r.current.price,
    delivery: r.current.deliveryTime,
    updatedAt: r.current.updatedAt,
  }));
  const min = sorted[0]!.current.price;
  const max = sorted[sorted.length - 1]!.current.price;
  return { result: { category: cat.name, count: rows.length, minPricePerKg: min, maxPricePerKg: max, prices } };
}

function toolCalcWeight(args: Record<string, unknown>): ToolOutcome {
  const cat = resolveCategory(String(args.category ?? ''));
  const size = String(args.size ?? '');
  const qty = Number(args.qty ?? 0);
  if (!cat || !size || !Number.isFinite(qty) || qty <= 0)
    return { result: { error: 'برای محاسبهٔ وزن، دسته، سایز و تعداد لازم است.' } };
  const row = pickRows(cat.slug, undefined, size)[0];
  if (!row) return { result: { error: 'وزن استاندارد این سایز ثبت نشده؛ کارشناس اعلام می‌کند.' } };
  const unitKg = row.theoreticalWeightKg;
  if (!unitKg) return { result: { error: 'وزن استاندارد این سایز ثبت نشده؛ کارشناس اعلام می‌کند.' } };
  const totalKg = Math.round(unitKg * qty * 10) / 10;
  return {
    result: {
      category: cat.name,
      size,
      qty,
      unitWeightKg: unitKg,
      totalWeightKg: totalKg,
      note: 'وزن نظری هر شاخه/واحد بر اساس جدول استاندارد.',
    },
  };
}

/** Engineering coefficients (kg per built m²) — rough, always labelled تخمینی. */
const STRUCTURE_COEFF: Record<string, { name: string; slug: string; kgPerM2: number }[]> = {
  concrete: [
    { name: 'میلگرد', slug: 'rebar', kgPerM2: 22 },
    { name: 'تیرآهن', slug: 'ibeam', kgPerM2: 14 },
  ],
  steel: [
    { name: 'تیرآهن', slug: 'ibeam', kgPerM2: 28 },
    { name: 'ورق', slug: 'sheet', kgPerM2: 9 },
    { name: 'پروفیل', slug: 'profile', kgPerM2: 6 },
  ],
};

function avgPrice(slug: string): number {
  const rows = getRows(slug);
  if (rows.length === 0) return 0;
  return Math.round(rows.reduce((s, r) => s + r.current.price, 0) / rows.length);
}

function toolEstimateProject(args: Record<string, unknown>): ToolOutcome {
  const area = Number(args.area_m2 ?? 0);
  const floors = Math.max(1, Number(args.floors ?? 1) || 1);
  const structure = String(args.structure ?? 'concrete') === 'steel' ? 'steel' : 'concrete';
  if (!Number.isFinite(area) || area <= 0)
    return { result: { error: 'متراژ زیربنا لازم است (به مترمربع).' } };
  const built = area * floors;
  const items = STRUCTURE_COEFF[structure]!.map((c) => {
    const weightKg = Math.round(built * c.kgPerM2);
    const pricePerKg = avgPrice(c.slug);
    return { name: c.name, weightKg, pricePerKg, costToman: Math.round(weightKg * pricePerKg) };
  });
  const totalKg = items.reduce((s, i) => s + i.weightKg, 0);
  const totalToman = items.reduce((s, i) => s + i.costToman, 0);
  const estimate: EstimateCardData = {
    items: items.map((i) => ({ name: i.name, weightKg: i.weightKg })),
    totalKg,
    totalToman,
  };
  return {
    result: {
      approximate: true,
      builtAreaM2: built,
      items,
      totalWeightKg: totalKg,
      totalCostToman: totalToman,
      note: 'برآورد تخمینی با ضرایب مهندسی؛ قیمت دقیق را کارشناس با پیش‌فاکتور تأیید می‌کند.',
    },
    card: { kind: 'estimate', estimate },
  };
}

function toolCompareFactories(args: Record<string, unknown>): ToolOutcome {
  const cat = resolveCategory(String(args.category ?? ''));
  const tonnage = Number(args.tonnage ?? 0);
  if (!cat || !Number.isFinite(tonnage) || tonnage <= 0)
    return { result: { error: 'دستهٔ محصول و تناژ لازم است.' } };
  const rows = pickRows(cat.slug, args.sub as string | undefined, args.size as string | undefined);
  const split = computeBulkSplit(rows, tonnage);
  if (!split.cheapest) return { result: { error: 'برای این مشخصات قیمتی ثبت نشده.' } };
  return {
    result: {
      category: cat.name,
      tonnage,
      cheapest: { factory: split.cheapest.factory, pricePerKg: split.cheapest.pricePerKg, totalToman: split.cheapest.lineToman },
      lines: split.lines.slice(0, 8).map((l) => ({ factory: l.factory, pricePerKg: l.pricePerKg, totalToman: l.lineToman })),
    },
    card: { kind: 'split', split: { categoryName: cat.name, split } },
  };
}

/* ------------------------------------------------------------------ */
/* Registry + OpenAI-format schemas (kept COMPACT — schema tokens are   */
/* resent on every call and priced; short descriptions = lower cost).   */
/* ------------------------------------------------------------------ */

type ToolFn = (args: Record<string, unknown>) => ToolOutcome;

const REGISTRY: Record<string, ToolFn> = {
  get_prices: toolGetPrices,
  calc_weight: toolCalcWeight,
  estimate_project: toolEstimateProject,
  compare_factories: toolCompareFactories,
};

export const TOOL_SCHEMAS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_prices',
      description: 'قیمت روز محصولات فولادی از جدول قیمت سایت (تومان بر کیلوگرم). تنها منبع مجاز قیمت.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'میلگرد|تیرآهن|ورق|پروفیل|نبشی و ناودانی|لوله|سیم و مفتول' },
          sub: { type: 'string', description: 'زیر‌دسته (اختیاری)، مثلاً آجدار A3' },
          size: { type: 'string', description: 'سایز (اختیاری)، مثلاً 14' },
          factory: { type: 'string', description: 'نام کارخانه (اختیاری)' },
        },
        required: ['category'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'calc_weight',
      description: 'وزن دقیق بر اساس جدول وزن استاندارد. تنها منبع مجاز وزن.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          size: { type: 'string' },
          qty: { type: 'number', description: 'تعداد شاخه/واحد' },
        },
        required: ['category', 'size', 'qty'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'estimate_project',
      description: 'برآورد تخمینی مصالح پروژهٔ ساختمانی (اقلام، وزن، هزینه) با ضرایب مهندسی و قیمت روز.',
      parameters: {
        type: 'object',
        properties: {
          area_m2: { type: 'number', description: 'متراژ زیربنا هر طبقه' },
          floors: { type: 'number' },
          structure: { type: 'string', enum: ['concrete', 'steel'], description: 'بتنی یا اسکلت فلزی' },
        },
        required: ['area_m2'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'compare_factories',
      description: 'مقایسهٔ قیمت یک تناژ مشخص بین کارخانه‌ها و یافتن ارزان‌ترین.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          tonnage: { type: 'number', description: 'تناژ (تن)' },
          sub: { type: 'string' },
          size: { type: 'string' },
        },
        required: ['category', 'tonnage'],
      },
    },
  },
];

/** Execute one tool call; register every number it returns in the ledger. */
export function executeTool(name: string, rawArgs: string, ledger: GroundingLedger): ToolOutcome {
  const fn = REGISTRY[name];
  if (!fn) return { result: { error: `ابزار ${name} وجود ندارد.` } };
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(rawArgs || '{}') as Record<string, unknown>;
  } catch {
    return { result: { error: 'آرگومان نامعتبر.' } };
  }
  try {
    const outcome = fn(args);
    ledger.addFromJson(outcome.result);
    if (outcome.card?.kind === 'estimate') ledger.addFromJson(outcome.card.estimate);
    if (outcome.card?.kind === 'split') ledger.addFromJson(outcome.card.split.split);
    return outcome;
  } catch {
    return { result: { error: 'اجرای ابزار ناموفق بود؛ کارشناس اعلام می‌کند.' } };
  }
}

/** Persian display for a tonnage chip label etc. (server-safe re-export). */
export { toPersianDigits };
