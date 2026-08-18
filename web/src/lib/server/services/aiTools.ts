/**
 * Grounded AI tools — thin wrappers over the same services the site uses, so
 * every number the advisor quotes has one source of truth. The model never
 * invents a price/weight (acceptance-criteria §D: null/stale → «کارشناس تماس
 * می‌گیرد», never a guess).
 */
import { z } from 'zod';
import {
  searchSkus,
  findSkuRow,
  listCategories,
  listSubCategories,
  tableRows,
  unmatchedQueryTokens,
} from '@/lib/server/repos/catalogRepo';
import { searchPublishedGuides, type ArticleFull } from '@/lib/server/repos/articlesRepo';
import { searchCorrections } from '@/lib/server/repos/aiCorrectionsRepo';
import { estimateProject } from '@/lib/server/services/estimate.service';
import { priceItems } from '@/lib/server/services/leads.service';
import { putDraft, type DraftItem } from '@/lib/server/ai/leadDraft';
import { computeBulkSplit, pickBestGroup } from '@/lib/utils/bulkSplit';
// The ONE weight formula table — shared with POST /api/tools/weight and the
// وزن‌سنج UI. These numbers become پیش‌فاکتور line weights, so the advisor and
// the endpoint must not be able to disagree (they had already diverged).
import { unitWeightKg } from '@/lib/utils/weight';
import type { AuthUser } from '@/lib/auth/types';
import type { ToolDef } from '@/lib/server/integrations/aiRelay';
import { finiteNumber } from '@/lib/validation/utils';
import { normalizeDigits } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';

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
      description:
        'وزن تئوری مقاطع فولادی را دقیق محاسبه می‌کند، همهٔ ۷ دستهٔ سایت: میلگرد، ورق، لوله، قوطی/پروفیل، سیم و مفتول، نبشی، تسمه، تیرآهن، ناودانی.',
      parameters: {
        type: 'object',
        properties: {
          shape: {
            type: 'string',
            enum: ['rebar', 'plate', 'pipe', 'box', 'wire', 'angle', 'flat', 'ibeam', 'channel'],
          },
          diameterMm: {
            type: 'number',
            description:
              'فقط شکل گرد (shape=rebar یا wire): قطر (mm). هرگز برای تیرآهن/ناودانی (ibeam/channel) پر نکن؛ آن دو مقطعِ I/U دارند نه دایره‌ای، و «تیرآهن ۱۴» یعنی شمارهٔ سایز، نه قطر — برایشان sizeCode بده، نه diameterMm.',
          },
          thicknessMm: { type: 'number', description: 'ورق/لوله/قوطی/نبشی: ضخامت (mm)' },
          widthM: { type: 'number', description: 'ورق: عرض (m)' },
          lengthM: { type: 'number', description: 'طول شاخه/محصول (m)، برای میلگرد اختیاری (پیش‌فرض ۱۲)، بقیه الزامی' },
          widthMm: { type: 'number', description: 'قوطی/تسمه: عرض مقطع (mm)' },
          heightMm: { type: 'number', description: 'قوطی: ارتفاع مقطع (mm)' },
          outerDiameterMm: { type: 'number', description: 'لوله: قطر خارجی (mm)' },
          legMm: { type: 'number', description: 'نبشی: طول بال (mm)، مثلاً نبشی ۵۰×۵۰ → legMm=50' },
          sizeCode: {
            type: 'number',
            description:
              'فقط شکل تیرآهن/ناودانی (shape=ibeam یا channel): شمارهٔ سایز بازار، مثلاً «تیرآهن ۱۴» یا «ناودانی ۱۴» → shape=ibeam/channel و sizeCode=14 (نه diameterMm=14؛ عدد بعد از «تیرآهن»/«ناودانی» همیشه sizeCode است).',
          },
          qty: { type: 'number' },
          targetTons: {
            type: 'number',
            description:
              'اختیاری: «X تن چند شاخه/برگ می‌شود؟»؛ تناژ هدف را بده تا piecesForTargetTons برگردد؛ هرگز خودت تقسیم نکن.',
          },
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
      name: 'compareFactories',
      description:
        'سیگنیچر آهن‌تایم: یک تناژ مشخص از یک محصول را بین همهٔ کارخانه‌ها مقایسه می‌کند و ارزان‌ترین را پیدا می‌کند، برای «۲۰ تن میلگرد از کجا ارزون‌تره؟». اگر sub ندهی، خودش پرتکرارترین زیرشاخه (گرید) را انتخاب می‌کند و در subCategory خروجی برمی‌گرداند؛ همیشه همان را در پاسخ بگو. اگر size هم بدهی، مقایسه دقیقاً روی همان سایز محدود می‌شود.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'مثلاً «میلگرد» یا slug دسته (rebar)' },
          // The example is a real sub-category NAME («میلگرد آجدار»); grade
          // codes like «A3» are not stored anywhere and never resolve.
          sub: { type: 'string', description: 'زیردسته (اختیاری) با همان نام کاتالوگ، مثلاً «آجدار» یا «ساده»' },
          size: { type: 'string', description: 'سایز دقیق (اختیاری)؛ بدون این، مقایسه بین سایزهای مختلف قاطی می‌شود' },
          tonnage: { type: 'number', description: 'تناژ (تن)' },
        },
        required: ['category', 'tonnage'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchGuides',
      description:
        'برای سؤال‌های دانشی و راهنمایی (مثلاً «فرق A2 و A3؟») در راهنماها و مقاله‌های منتشرشدهٔ آهن‌تایم جستجو می‌کند و عنوان، بریدهٔ مرتبط و slug هر مقاله را برمی‌گرداند.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'کلیدواژه‌های اصلی سؤال، مثلاً «گرید میلگرد A2 A3»' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepareProforma',
      description:
        'وقتی کاربر آمادهٔ پیش‌فاکتور است: خلاصهٔ اقلام را با قیمت و وزن روز آماده می‌کند و کارت تأیید را زیر پیام تو به کاربر نشان می‌دهد. این ابزار درخواست را ثبت نمی‌کند؛ ثبت نهایی با دکمهٔ تأیید خودِ کاربر انجام می‌شود. برای هر قلم کافی است نام محصول را با همان کلماتی که کاربر گفته در product بنویسی (مثلاً «میلگرد ۱۴ آجدار»)؛ خود ابزار محصول را در کاتالوگ پیدا می‌کند. هرگز از کاربر کد، شناسه، نام یا شمارهٔ موبایل نپرس؛ اگر کاربر وارد حساب نشده باشد، دکمهٔ ورود در همان کارت نمایش داده می‌شود.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                product: {
                  type: 'string',
                  description:
                    'نام محصول به فارسی، همان‌طور که کاربر گفته یا در گفتگو مشخص شده؛ هر چه کامل‌تر بهتر (محصول + سایز + گرید + کارخانه اگر معلوم است)، مثلاً «میلگرد ۱۴ آجدار ذوب‌آهن». ابزار خودش این نام را به محصول کاتالوگ تبدیل می‌کند. هرگز از کاربر کد یا شناسهٔ محصول نپرس؛ کاربر چنین کدی ندارد.',
                },
                skuId: {
                  type: 'string',
                  description:
                    'اختیاری و فقط وقتی که در همین گفتگو از خروجی getPrice فیلد skuId را گرفته‌ای؛ آن مقدار را بدون تغییر بگذار. اگر نداری این فیلد را خالی بگذار و فقط product را پر کن. این شناسهٔ داخلی سیستم است و هرگز نباید از کاربر پرسیده یا به او نشان داده شود.',
                },
                qty: {
                  type: 'number',
                  description:
                    'مقدار، در همان واحدی که در unit می‌گذاری. برای تناژ، واحد را kg بگذار و مقدار را به کیلوگرم بده (مثلاً «۳ تن» یعنی qty=3000 و unit=kg).',
                },
                unit: { type: 'string', enum: ['kg', 'branch', 'sheet', 'meter'], description: 'واحد qty' },
              },
              required: ['qty', 'unit'],
            },
          },
        },
        required: ['items'],
      },
    },
  },
];

const draftArgs = z.object({
  items: z
    .array(
      z
        .object({
          // EITHER is enough. `product` is the normal path: the visitor says
          // «۳ تن میلگرد ۱۴» and the model passes those words straight
          // through — it does not have, and must never ask for, an internal
          // id. `skuId` is the shortcut for when getPrice already returned one.
          product: z.string().trim().min(1).max(120).optional(),
          skuId: z.string().max(120).optional(),
          qty: finiteNumber.positive().max(100_000),
          unit: z.enum(['kg', 'branch', 'sheet', 'meter']),
        })
        .refine((i) => Boolean(i.product?.trim() || i.skuId?.trim()), {
          message: 'product یا skuId لازم است',
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
  // 'flat' (تسمه) is a DIFFERENT section from 'angle' — the وزن‌سنج page has
  // always quoted it and the advisor could not, which is exactly the kind of
  // gap that made a customer get two answers. Both now read lib/utils/weight.
  shape: z.enum(['rebar', 'plate', 'pipe', 'box', 'wire', 'angle', 'flat', 'ibeam', 'channel']),
  qty: finiteNumber.positive().max(100_000),
  // «X تن چند شاخه می‌شود؟» — the inverse ask. Grounded here so the branch
  // count comes from a tool instead of model arithmetic (which the AC-D-3
  // validator would rightly censor as an invented number).
  targetTons: finiteNumber.positive().max(10_000).optional(),
  diameterMm: finiteNumber.positive().max(60).optional(),
  thicknessMm: finiteNumber.positive().max(200).optional(),
  widthM: finiteNumber.positive().max(4).optional(),
  // Bars/plates/beams cap near 24m (standard mill lengths); wire coils are
  // legitimately much longer, so the shared field allows up to 200m.
  lengthM: finiteNumber.positive().max(200).optional(),
  widthMm: finiteNumber.positive().max(600).optional(),
  heightMm: finiteNumber.positive().max(600).optional(),
  outerDiameterMm: finiteNumber.positive().max(1000).optional(),
  legMm: finiteNumber.positive().max(300).optional(),
  sizeCode: finiteNumber.positive().max(60).optional(),
});

const estimateProjectArgs = z.object({
  areaM2: finiteNumber.positive().max(100_000),
  floors: finiteNumber.int().positive().max(50),
});

const compareFactoriesArgs = z.object({
  category: z.string().trim().min(1).max(60),
  sub: z.string().trim().max(60).optional(),
  size: z.string().trim().max(60).optional(),
  tonnage: finiteNumber.positive().max(100_000),
});

/** Resolve the model's free-text category/sub-category name to the DB's real
 *  slug — exact slug, exact name, or substring match (either direction), so
 *  «میلگرد» / «rebar» / «میلگرد آجدار» all land on the same row. Reads the
 *  live category list rather than a hardcoded alias table, so it can never
 *  drift from what's actually in the database. */
async function resolveCategory(query: string): Promise<{ slug: string; name: string } | null> {
  const q = query.trim().toLowerCase();
  const cats = await listCategories();
  const hit =
    cats.find((c) => c.slug.toLowerCase() === q || c.name.toLowerCase() === q) ??
    cats.find((c) => c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase()));
  return hit ? { slug: hit.slug, name: hit.name } : null;
}

/** ~400-char excerpt of a guide, windowed around the FIRST query-token hit in
 *  the body so the model quotes the relevant passage, not just the intro —
 *  falls back to the editorial excerpt, then the body head. Any number inside
 *  flows into the grounding ledger via addFromJson like every tool output
 *  (strings are scanned too), so quoting it never trips the censor. */
const GUIDE_EXCERPT_CHARS = 400;

function guideExcerpt(article: ArticleFull, query: string): string {
  const body = article.bodyMd.trim();
  // normalizeDigits maps each Persian/Arabic digit to ONE Latin char, so
  // indices in the normalized haystack line up with the original body.
  const hay = normalizeDigits(body).toLowerCase();
  let idx = -1;
  for (const t of query.trim().split(/\s+/)) {
    if (t.length < 2) continue;
    const i = hay.indexOf(normalizeDigits(t).toLowerCase());
    if (i !== -1 && (idx === -1 || i < idx)) idx = i;
  }
  if (idx === -1) {
    const fallback = article.excerpt?.trim() || body;
    return fallback.length > GUIDE_EXCERPT_CHARS ? `${fallback.slice(0, GUIDE_EXCERPT_CHARS).trimEnd()}…` : fallback;
  }
  const start = Math.max(0, idx - Math.floor(GUIDE_EXCERPT_CHARS / 4));
  const end = Math.min(body.length, start + GUIDE_EXCERPT_CHARS);
  return `${start > 0 ? '…' : ''}${body.slice(start, end).trim()}${end < body.length ? '…' : ''}`;
}

async function resolveSubCategory(categorySlug: string, query: string): Promise<string | undefined> {
  const q = query.trim().toLowerCase();
  const subs = await listSubCategories(categorySlug);
  const hit = subs.find(
    (s) => s.slug.toLowerCase() === q || s.name.toLowerCase() === q || s.name.toLowerCase().includes(q),
  );
  return hit?.slug;
}

// Transcript cap persisted into a lead's context: enough turns for sales to
// reconstruct the negotiation without letting a 40-turn chat bloat the jsonb.
// The rep reads this to open the call, so a truncated-mid-sentence answer is
// worse than useless — 1000 chars covers a normal advisor reply whole.
const TRANSCRIPT_MAX_MESSAGES = 20;
const TRANSCRIPT_MAX_CHARS = 1000;

/**
 * Free text («میلگرد ۱۴ آجدار A3 ذوب‌آهن») → one catalog SKU, using the SAME
 * lookup getPrice runs, so a product the advisor could quote is always a
 * product it can also put on a پیش‌فاکتور.
 *
 * Returns 'many' rather than silently picking the first hit: which factory
 * you buy from is a real decision with a real price difference, and guessing
 * it would put the wrong mill on a document the customer keeps. The caller
 * turns that into a plain Persian question — never a request for an id.
 */
async function resolveProduct(
  query: string,
): Promise<{ kind: 'one'; skuId: string } | { kind: 'many'; options: string[] } | { kind: 'none' }> {
  const direct = await findSkuRow(query);
  if (direct) return { kind: 'one', skuId: direct.id };
  let rows = await searchSkus(query, 5);
  if (rows.length === 0) {
    // RETRY WITHOUT THE WORDS THE CATALOG DOES NOT KNOW.
    //
    // searchSkus ANDs its tokens, so one unknown word zeroes the whole query.
    // In production that word is nearly always a GRADE CODE: «A3» is how every
    // customer (and this prompt) names rebar, and it appears in zero catalog
    // rows — the grade lives in the sub-category «میلگرد آجدار», which search
    // does not read. «میلگرد ۱۴ آجدار A3» therefore came back `none` and the
    // needs_choice → tappable-chips path could never fire, while the same
    // query minus «A3» matches one row per mill, which is exactly the choice
    // the customer should be asked to make.
    //
    // Only ever runs after a genuine miss, and only drops tokens PROVEN (by a
    // query) to match nothing — so it can turn `none` into an answer and can
    // never change an answer the customer would otherwise have got.
    const unknown = await unmatchedQueryTokens(query);
    if (unknown.length > 0) {
      const kept = query.split(/\s+/).filter((t) => t && !unknown.includes(t));
      // WHAT IS LEFT MUST STILL BE A WORD, NOT A STRAY SYLLABLE.
      //
      // The filter keeps every token that matches SOMETHING, and a two-letter
      // Persian word matches something by accident: «یک» occurs inside real
      // catalog names, so for the pure nonsense «یک چیز کاملاً نامربوط ۹۹۹» it
      // was the single survivor — and on its own it pulled five unrelated
      // تیرآهن rows, turning a correct `none` into a false product on a
      // document the customer keeps. So the retry only runs when at least one
      // survivor is a real word (≥3 chars, ZWNJ not counted). The grade case
      // this whole retry exists for keeps «میلگرد» (7) and clears it easily;
      // «یک»/«از»/«۲» can never carry a query by themselves.
      const ZWNJ = '‌';
      if (kept.some((t) => t.replaceAll(ZWNJ, '').length >= 3)) {
        rows = await searchSkus(kept.join(' ').trim(), 5);
      }
    }
  }
  if (rows.length === 0) return { kind: 'none' };
  if (rows.length === 1) return { kind: 'one', skuId: rows[0]!.id };
  // One product quoted by one mill can legitimately appear once per size/
  // grade row; if every hit is the same NAME, they are the same product and
  // there is nothing for the customer to choose between.
  const names = [...new Set(rows.map((r) => r.name))];
  if (names.length === 1) return { kind: 'one', skuId: rows[0]!.id };
  return { kind: 'many', options: names };
}

/** The chat as sales will read it — capped, oldest turns dropped first. */
export function capTranscript(
  transcript: Array<{ role: string; content: string }> | undefined,
): Array<{ role: string; content: string }> | undefined {
  if (!transcript || transcript.length === 0) return undefined;
  return transcript
    .slice(-TRANSCRIPT_MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, TRANSCRIPT_MAX_CHARS) }));
}

/** At most this many options become chips. resolveProduct already caps its
 *  search at 5 rows, so this is a belt-and-braces bound on a row of buttons
 *  the visitor has to read at 375px. */
const MAX_CHOICE_CHIPS = 5;

/**
 * The tappable version of «کدام کارخانه؟».
 *
 * ONE ambiguous line only: two products' options in a single chip row would
 * not say which product each chip belongs to, and tapping one would answer a
 * question the visitor was never asked. With several ambiguous lines the
 * model falls back to asking in prose, exactly as it did before.
 *
 * The labels are the catalog's own product names, which is precisely what
 * resolveProduct matches on the next round trip — a tap and a typed name
 * take the identical path.
 */
export function chipsForChoice(ambiguous: ReadonlyArray<{ product: string; options: string[] }>): string[] {
  if (ambiguous.length !== 1) return [];
  const options = ambiguous[0]!.options.map((o) => o.trim()).filter(Boolean);
  // Deduped: chip labels are React keys in the thread (AdvisorChat's chip row).
  return [...new Set(options)].slice(0, MAX_CHOICE_CHIPS);
}

/** Execute one tool call; ALWAYS returns a JSON-safe result (errors as text). */
export async function runTool(
  name: string,
  args: Record<string, unknown>,
  session: AuthUser | null,
  conversationId?: string,
  transcript?: Array<{ role: string; content: string }>,
  /** Emitted when prepareProforma builds a draft — the pipeline forwards it to
   *  the client as a `leadDraft` SSE frame (the confirmation card). */
  onDraft?: (draft: Record<string, unknown>) => void,
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
            // The catalog's OWN grade code, when it has one. Omitted rather
            // than sent as null so it adds nothing for the categories that
            // never carry one — and present here so «چه گریدی؟» can be
            // answered from the catalog instead of from the model's
            // imagination (it offered a customer «B400B500» once).
            ...(r.grade ? { grade: r.grade } : {}),
            // ورق only, and only when it's been filled in — for a plate `size`
            // is the thickness alone, so without this the advisor has no
            // grounded way to answer «چه ابعادی؟» and must not guess. Omitted
            // rather than sent as null so it adds nothing to the prompt for
            // the categories that will never have it.
            ...(r.dimensions ? { dimensions: r.dimensions } : {}),
            unit: r.current.unit,
            // Hidden/stale → no number; the model must offer a کارشناس callback.
            price: r.current.priceHidden ? null : r.current.price,
            isStale: r.current.isStale,
            deliveryTime: r.current.priceHidden ? null : r.current.deliveryTime,
            updatedAt: r.current.updatedAt,
            // Jalali form of updatedAt so the model can date a stale price
            // («در تاریخ ۱۴۰۵/۰۴/۱۱») — the validator exempts date patterns.
            updatedAtJalali: formatJalali(r.current.updatedAt),
          })),
        };
      }
      case 'calcWeight': {
        const parsed = calcWeightArgs.safeParse(args);
        if (!parsed.success) return { error: 'ورودی ناقص است؛ ابعاد لازم را بپرس.' };
        const unitKg = unitWeightKg(parsed.data.shape, parsed.data);
        if (!unitKg) return { error: 'ورودی ناقص است؛ ابعاد لازم را بپرس.' };
        const result: Record<string, number> = {
          unitWeightKg: Math.round(unitKg * 100) / 100,
          totalWeightKg: Math.round(unitKg * parsed.data.qty * 100) / 100,
        };
        // Inverse ask («۲۰ تن چند شاخه؟») — computed HERE so the count is a
        // grounded tool number, not model arithmetic the validator censors.
        if (parsed.data.targetTons) {
          result.piecesForTargetTons = Math.ceil((parsed.data.targetTons * 1000) / unitKg);
          result.targetTons = parsed.data.targetTons;
        }
        return result;
      }
      case 'estimateProject': {
        const parsed = estimateProjectArgs.safeParse(args);
        if (!parsed.success) return { error: 'متراژ و تعداد طبقات لازم است.' };
        return await estimateProject(parsed.data.areaM2, parsed.data.floors);
      }
      case 'compareFactories': {
        const parsed = compareFactoriesArgs.safeParse(args);
        if (!parsed.success) return { error: 'دسته‌بندی محصول و تناژ لازم است.' };
        const category = await resolveCategory(parsed.data.category);
        if (!category) return { error: 'این دسته‌بندی شناخته نشد.' };
        const explicitSub = parsed.data.sub ? await resolveSubCategory(category.slug, parsed.data.sub) : undefined;
        const explicitSize = parsed.data.size?.trim() || undefined;

        const allRows = await tableRows(category.slug, explicitSub);
        let usedSub = explicitSub;
        const usedSize = explicitSize;
        let scoped = explicitSize ? allRows.filter((r) => r.size === explicitSize) : allRows;

        // Comparing a factory's price across entirely different sub-categories
        // (e.g. میلگرد «ساده» blended with «آجدار A3») blends non-equivalent
        // products into a misleading "cheapest" — if the model didn't pin
        // down a sub-category (most callers won't), narrow to the single
        // most-comparable one (most factories quoting it) instead of
        // averaging over the whole category. Deliberately NOT also narrowed
        // to one exact size: real data showed a single exact size is often
        // quoted by only one mill, which would collapse "compare factories"
        // to one factory almost every time — different sizes of the same
        // grade/sub-category are still a fair comparison.
        if (!explicitSub) {
          const group = pickBestGroup(scoped);
          if (group?.subCategoryId) {
            usedSub = group.subCategoryId;
            scoped = scoped.filter((r) => r.subCategoryId === usedSub);
          }
        }

        // A hidden/stale price is stored as 0 (toPriceRow's contract) — never
        // let a row with no real price win as "cheapest" by default.
        const priced = scoped.filter((r) => !r.current.priceHidden && r.current.price > 0);
        if (priced.length === 0) return { error: 'قیمتی برای این محصول ثبت نشده؛ کارشناس اعلام می‌کند.' };
        const split = computeBulkSplit(priced, parsed.data.tonnage);
        if (!split.cheapest) return { error: 'قیمتی برای این محصول ثبت نشده؛ کارشناس اعلام می‌کند.' };
        // The veteran's talking point «X تومان نسبت به گزینهٔ بعدی صرفه دارد»
        // — computed HERE so the delta is a grounded tool number (the model
        // subtracting two totals itself gets censored by the AC-D-3 gate).
        const runnerUp = split.lines
          .filter((l) => l.factory !== split.cheapest!.factory)
          .sort((a, b) => a.lineToman - b.lineToman)[0];
        const usedSubName = usedSub
          ? (await listSubCategories(category.slug)).find((s) => s.slug === usedSub)?.name
          : undefined;
        return {
          category: category.name,
          // Which exact product this comparison is for — state this in the
          // reply, especially when the model didn't ask the user for a size
          // (compareFactories picked the most-quoted one automatically).
          subCategory: usedSubName,
          size: usedSize,
          tonnage: split.tonnage,
          cheapestFactory: split.cheapest.factory,
          cheapestPricePerKg: split.cheapest.pricePerKg,
          cheapestTotalToman: split.cheapest.lineToman,
          // How many priced rows backed this average — 1 (maybe stale) row
          // and 20 fresh ones shouldn't read as equally confident.
          cheapestRowCount: split.cheapest.rowCount,
          ...(runnerUp
            ? { savingsVsNextToman: runnerUp.lineToman - split.cheapest.lineToman }
            : {}),
          factories: split.lines.slice(0, 8).map((l) => ({
            factory: l.factory,
            pricePerKg: l.pricePerKg,
            totalToman: l.lineToman,
            rowCount: l.rowCount,
          })),
        };
      }
      case 'searchGuides': {
        const q = String(args.query ?? '').trim();
        if (!q) return { error: 'query لازم است.' };
        // Curated corrections (admin-vetted golden answers) are retrieved first
        // and marked as authoritative — this is how admin feedback improves the
        // advisor over time. Fail-safe: searchCorrections returns [] on error,
        // so a live answer never depends on it.
        const corrections = await searchCorrections(q, 2);
        const hits = await searchPublishedGuides(q, 3);
        const results = [
          ...corrections.map((c) => ({
            title: 'پاسخ تأییدشدهٔ کارشناسان آهن‌تایم',
            slug: 'curated',
            excerpt: c.answer,
          })),
          ...hits.map((a) => ({ title: a.title, slug: a.slug, excerpt: guideExcerpt(a, q) })),
        ];
        if (results.length === 0)
          return { results: [], note: 'راهنمای مرتبطی در آهن‌تایم منتشر نشده؛ صادقانه بگو راهنمایی برای این موضوع نداریم.' };
        return { results };
      }
      case 'prepareProforma': {
        const parsed = draftArgs.safeParse(args);
        if (!parsed.success) return { error: 'اقلام ناقص است؛ نام محصول، مقدار و واحد را کامل بده.' };

        // Resolve every line to a REAL catalog product from the words the
        // visitor used. This is the tool's job, not the customer's: they do
        // not have an internal id and being asked for one is nonsense to
        // them (a live report: the advisor asked a buyer for «کد商品», having
        // improvised both the concept and, being a multilingual model, the
        // word for it out of an undescribed `skuId` field).
        const resolved: DraftItem[] = [];
        const notFound: string[] = [];
        const ambiguous: Array<{ product: string; options: string[] }> = [];
        for (const item of parsed.data.items) {
          if (item.skuId?.trim()) {
            resolved.push({ skuId: item.skuId.trim(), qty: item.qty, unit: item.unit });
            continue;
          }
          const query = item.product!.trim();
          const match = await resolveProduct(query);
          if (match.kind === 'one') {
            resolved.push({ skuId: match.skuId, qty: item.qty, unit: item.unit });
          } else if (match.kind === 'many') {
            ambiguous.push({ product: query, options: match.options });
          } else {
            notFound.push(query);
          }
        }

        // Ambiguity is a question for a HUMAN, phrased in human terms —
        // «کدام کارخانه؟», never «کد محصول را بده». The options also become
        // real tappable chips under the answer (see choiceChips below), so
        // the visitor can answer with one tap instead of retyping a mill's
        // name; typing it still works exactly as before.
        if (ambiguous.length > 0) {
          const choiceChips = chipsForChoice(ambiguous);
          return {
            status: 'needs_choice',
            ambiguous,
            choiceChips,
            note: choiceChips.length
              ? 'این محصول چند گزینه دارد. گزینه‌ها همین حالا به شکل دکمه‌های قابل‌لمس زیر پیام تو به کاربر نشان داده می‌شوند، پس فهرستشان را در متن تکرار نکن و شماره‌گذاری نکن. فقط یک سؤال کوتاه فارسی بپرس (مثلاً «از کدام کارخانه می‌خواهی؟») و بگو یکی از گزینه‌های زیر را بزند یا نامش را بنویسد. بعد از انتخاب او، دوباره همین ابزار را صدا بزن. هرگز از کاربر کد یا شناسه نخواه.'
              : 'این محصول‌ها چند گزینه دارند. فقط با نام فارسی بپرس کدام‌یک را می‌خواهد (مثلاً کدام کارخانه یا کدام سایز) و بعد دوباره همین ابزار را صدا بزن. هرگز از کاربر کد یا شناسه نخواه.',
          };
        }
        if (notFound.length > 0 || resolved.length === 0) {
          return {
            error: `این محصول در کاتالوگ پیدا نشد: ${notFound.join('، ')}. با نام فارسی بپرس دقیقاً چه محصول و سایزی می‌خواهد؛ هرگز از کاربر کد یا شناسه نخواه.`,
          };
        }

        // Prices the lines with the SAME function createLead uses, so the card
        // the visitor confirms and the lead the rep receives cannot disagree.
        const { lines, allPriced } = await priceItems(resolved);
        // An unresolved skuId comes back as a line whose `name` IS the raw id
        // (priceItems' fallback) — showing that to the customer as a product
        // name would be nonsense, so send the model back for a real product.
        if (lines.length === 0 || lines.every((l) => l.name === l.skuId)) {
          return { error: 'این اقلام در کاتالوگ پیدا نشد؛ با نام فارسی بپرس چه محصولی می‌خواهد.' };
        }
        const draft = await putDraft({
          items: resolved,
          conversationId,
          userId: session?.id,
          transcript: capTranscript(transcript),
        });
        const totalWeightKg = lines.reduce((s, l) => s + (l.weightKg ?? 0), 0) || undefined;
        const total = allPriced ? lines.reduce((s, l) => s + (l.lineTotal ?? 0), 0) || undefined : undefined;
        const card = {
          draftId: draft.id,
          items: lines.map((l) => ({
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
          signedIn: Boolean(session),
        };
        onDraft?.(card);
        // What the MODEL is told — deliberately not the numbers a second time
        // (the card carries them), and explicitly that nothing is filed yet.
        return {
          status: 'awaiting_user_confirmation',
          draftId: draft.id,
          itemCount: lines.length,
          totalWeightKg,
          total,
          allPriced,
          signedIn: Boolean(session),
          note: session
            ? 'کارت خلاصهٔ درخواست زیر پیام تو به کاربر نشان داده شد. فقط بگو خلاصه را ببیند و دکمهٔ «تأیید و ثبت درخواست» را بزند. نام و موبایل از حساب کاربری‌اش برداشته می‌شود؛ نپرس.'
            : 'کارت خلاصهٔ درخواست همراه دکمهٔ «ورود به حساب کاربری» زیر پیام تو نشان داده شد. فقط بگو برای ثبت نهایی از همان کارت وارد حساب شود. هرگز نام یا شمارهٔ موبایل را در متن نپرس.',
        };
      }
      default:
        return { error: `ابزار ناشناخته: ${name}` };
    }
  } catch {
    return { error: 'اجرای ابزار ناموفق بود.' };
  }
}

export const AI_SYSTEM_PROMPT = `تو «مشاور هوشمند آهن‌تایم» هستی، یک کارشناس کهنه‌کار بازار آهن ایران با سال‌ها تجربهٔ فروش در بازار آهن تهران. مثل یک مشاور معتمد رفتار می‌کنی، نه فروشندهٔ سمج: اول نیاز مشتری را می‌فهمی، بعد راه‌حل می‌دهی. شعار آهن‌تایم: «اول مشورت، بعد خرید». پرداخت آنلاین نداریم؛ فروش با پیش‌فاکتور و تماس کارشناس نهایی می‌شود. با مشتری همیشه دوم‌شخص مفرد حرف می‌زنی («تو»، «می‌خواهی»، «بگو»)، هرگز «شما» و «کنید»؛ صمیمی اما حرفه‌ای، مثل همکاری که کنارش ایستاده. این بخشی از هویت توست، نه یک ترجیح سلیقه‌ای (بند ۲۱).

== قواعد قطعی اعداد (هرگز نقض نکن) ==
1) هیچ قیمت، وزن یا عددی را از خودت نساز. هر عدد فقط از خروجی ابزارها (getPrice, calcWeight, estimateProject, compareFactories) می‌آید. حتی وزن‌های «بدیهی» را هم با calcWeight حساب کن.
1-الف) کد گرید را هم مثل عدد نساز. فقط گریدی را نام ببر که یا در فهرست «گریدهای واقعی» همین متن آمده، یا در خروجی ابزارها (فیلد grade) دیده‌ای، یا در راهنمای آهن‌تایم خوانده‌ای. هیچ کد نمونه‌ای از خودت اختراع نکن؛ «B400B500» و «B500B600» در این بازار و در کاتالوگ آهن‌تایم اصلاً وجود ندارند و گفتنشان به مشتری خطای فاحشی است. اگر برای دسته‌ای گرید ثبت نشده، بگو گرید دقیق را کارشناس یا نقشهٔ سازه تعیین می‌کند و مثال نساز.
2) اگر ابزار قیمت null برگرداند، هیچ عددی نگو؛ بگو قیمت توسط کارشناس اعلام می‌شود و پیشنهاد ثبت درخواست بده؛ هرگز حدس نزن. اگر قیمت عدد دارد ولی isStale=true است، حتماً همان قیمت را همراه تاریخش بگو («آخرین قیمت ثبت‌شده: X تومان در تاریخ Y»؛ Y همان updatedAtJalali خروجی ابزار) و اضافه کن که قیمت به‌روز را کارشناس تأیید می‌کند؛ قیمت تاریخ‌دار را هرگز از کاربر دریغ نکن.
3) عدد را همیشه با رقم بنویس، نه با حروف؛ اعداد با جداکنندهٔ هزارگان و همیشه با واحد (تومان، کیلوگرم، شاخه). قبل از پاسخ، معقول بودن عدد را چک کن: اگر نتیجه نامعقول بود (مثلاً وزن یک شاخه میلگرد چند صد کیلو، یا وزن یک شاخه تیرآهن/ناودانی زیر ۶ کیلوگرم — سبک‌ترین سایز واقعی تیرآهن هم به این کمی نمی‌رسد)، shape/sizeCode/diameterMm ورودی calcWeight را دوباره چک کن (نشانهٔ کلاسیک این خطا: برای «تیرآهن ۱۴» به‌جای shape=ibeam و sizeCode=14 اشتباهاً shape=rebar یا wire با diameterMm=14 صدا زده شده) و ابزار را با ورودی درست دوباره صدا بزن.
4) وقتی کاربر آمادهٔ خرید/پیش‌فاکتور است، ابزار prepareProforma را با اقلام صدا بزن. این ابزار درخواست را ثبت نمی‌کند: یک کارت خلاصهٔ اقلام با دکمهٔ تأیید زیر پیام تو به کاربر نشان داده می‌شود و ثبت نهایی با فشردن همان دکمه توسط کاربر انجام می‌شود. پس هرگز نگو «درخواستت ثبت شد» و هرگز کد پیگیری نساز؛ فقط بگو خلاصه را ببیند و دکمه را بزند. اسم دکمه را از خودت نساز: دکمهٔ کارت دقیقاً «تأیید و ثبت درخواست» نام دارد (و برای کاربری که وارد حساب نشده، «ورود به حساب کاربری»)؛ اگر به دکمه اشاره می‌کنی، فقط همین دو نام را به کار ببر.
4-پ) هرگز از پرداخت حرف نزن. در آهن‌تایم پرداخت آنلاین وجود ندارد و هیچ مرحلهٔ پرداختی در این گفتگو یا بعد از تأیید کارت پیش نمی‌آید؛ جمله‌هایی مثل «پرداخت پس از تأیید انجام می‌شود» یا «فاکتور را پرداخت کنید» ممنوع است. بعد از ثبت درخواست، تنها چیزی که اتفاق می‌افتد این است: کارشناس فروش تماس می‌گیرد و قیمت و زمان تحویل را نهایی می‌کند. شرایط تسویه هم فقط با همین جمله بیان می‌شود که کارشناس اعلامش می‌کند؛ خودت هیچ روش یا زمان‌بندی پرداختی توصیف نکن. وزن/مبلغ کل را در متن تکرار نکن یا اگر گفتی، دقیقاً از فیلدهای totalWeightKg/total همان خروجی بگو؛ هرگز خودت وزن یا مبلغ را از روی مقدار کاربر (مثلاً «۲ تن») محاسبه نکن.
4-الف) هرگز از کاربر کد، شناسه یا هر مقدار فنیِ داخلی سیستم (skuId و مانند آن) نخواه؛ کاربر چنین چیزی ندارد و پرسیدنش او را گیج می‌کند. برای ثبت پیش‌فاکتور کافی است نام محصول را با همان کلمات خود کاربر در فیلد product بگذاری (مثلاً «میلگرد ۱۴ آجدار»)؛ پیدا کردن محصول در کاتالوگ کار ابزار است، نه کار کاربر. اگر ابزار گفت چند گزینه وجود دارد (needs_choice)، گزینه‌ها همان لحظه به شکل دکمه‌های قابل‌لمس زیر پیام تو به کاربر نشان داده می‌شوند؛ پس فهرست شماره‌دار یا جدول ننویس و نام گزینه‌ها را در متن تکرار نکن. فقط یک سؤال کوتاه بپرس (مثلاً «از کدام کارخانه می‌خواهی؟») و اضافه کن که می‌تواند یکی از گزینه‌های زیر را بزند یا نامش را بنویسد. بعد از انتخاب او، دوباره ابزار را صدا بزن.
4-ب) نام و شمارهٔ موبایل را هرگز از کاربر نپرس. اگر کاربر وارد حساب شده باشد، این اطلاعات از پروفایلش برداشته می‌شود؛ اگر نشده باشد، دکمهٔ «ورود به حساب کاربری» در همان کارت به او نشان داده می‌شود. فقط چیزهای واقعاً لازم و ناقص (محصول، سایز، مقدار، شهر تحویل، زمان نیاز) را بپرس.
5) اگر کاربر خودش قیمتی گفت، آن را تأیید یا رد نکن؛ قیمت معتبر را از ابزار بگیر و همان را بگو.

== روش مشاوره (مثل یک کارشناس واقعی) ==
6) اول تشخیص، بعد نسخه: اگر کاربر فقط پرسید «قیمت چنده؟» بدون مشخصات، با یک سؤال کوتاه بپرس برای چه کاری می‌خواهد و هنوز قیمت نده؛ پرسش دقیق (محصول + سایز) را مستقیم جواب بده. در هر نوبت حداکثر ۱–۲ سؤال بپرس؛ بازجویی نکن.
7) محاسبه را شفاف نشان بده تا مشتری بفهمد عدد از کجا آمده: مبنا را اعلام کن (شاخهٔ ۱۲ متری، وزن تئوری) و از فیلدهای unitWeightKg/totalWeightKg خروجی ابزار به شکل «هر شاخه X کیلوگرم؛ N شاخه می‌شود Y کیلوگرم» استفاده کن. مفروضات را همیشه بگو. هیچ حساب سرانگشتی نکن؛ حتی تقسیم و ضرب ساده (مثل «چند شاخه می‌شود») را از ابزار بگیر: برای تبدیل تناژ به تعداد شاخه، calcWeight را با targetTons صدا بزن و فیلد piecesForTargetTons را بگو.
8) حرکت امضای کارشناس: مقایسه‌ها را به «قیمت هر کیلوگرم» برگردان تا منصفانه شوند؛ قیمت شاخه‌ایِ ارزان‌تر گاهی به‌خاطر وزن کمتر است، نه ارزانی واقعی. برای تناژ عمده («۲۰ تن میلگرد از کجا ارزون‌تره؟») حتماً compareFactories را صدا بزن و تفکیک کارخانه‌ها را نشان بده؛ این قابلیت سیگنیچر آهن‌تایم است. اگر کاربر زیرشاخه/گرید دقیق را نگفت، خودِ ابزار پرتکرارترین زیرشاخه را انتخاب می‌کند و در فیلد subCategory برمی‌گرداند؛ همیشه همان را در پاسخ بگو («این مقایسه برای گریدِ X است؛ برای گرید دیگر بگو تا دوباره چک کنم») تا مشتری فکر نکند این عدد برای هر گریدی معتبر است. اگر کاربر سایز مشخصی هم گفت، همان را در پارامتر size بده تا مقایسه دقیقاً روی آن سایز محدود شود. اختلاف/تفاضل قیمت‌ها را هرگز خودت حساب نکن؛ صرفهٔ نسبت به گزینهٔ بعدی را از فیلد savingsVsNextToman همان خروجی بگو، و اگر تعداد ردیف قیمتیِ ارزان‌ترین گزینه (cheapestRowCount) فقط ۱ بود، صادقانه بگو این قیمت فقط از یک منبع است.
9) دید هزینهٔ کامل بده: یادآوری کن هزینهٔ نهایی فقط قیمت کالا نیست (حمل، ارزش افزوده، شرایط تسویه) و عدد دقیق این‌ها را کارشناس در پیش‌فاکتور اعلام می‌کند. تناژ بالا معمولاً از کارخانه به‌صرفه‌تر است و خرید خرد/ترکیبی از بنگاه؛ اگر تناژ کاربر معلوم است، همین را در توصیه لحاظ کن.
10) صادق باش، نه بله‌قربان‌گو: اگر انتخاب کاربر برای کاربردش مناسب نیست (مثلاً گرید نامناسب برای خاموت یا اسکلت)، محترمانه و مستدل بگو و جایگزین پیشنهاد بده. دربارهٔ آیندهٔ قیمت هرگز پیش‌بینی قطعی نده؛ فقط بگو بازار نوسان دارد و قیمت پیش‌فاکتور همان روز معتبر است.
11) وقتی کاربر به عددی که از ابزار گرفتی اعتراض کرد یا گفت اشتباه/دروغ است، هرگز فقط همان جمله را عیناً تکرار نکن؛ این غیرمتقاعدکننده و ماشینی به‌نظر می‌رسد. با اطمینان مبنای محاسبه را دوباره و شفاف‌تر توضیح بده (مثلاً «این عدد از جدول وزن استاندارد مقطع می‌آید، نه تخمین هندسی») و بپرس خودش چه عدد یا فرضی (طول/سایز/گرید متفاوت) در ذهن داشته تا اختلاف واقعی را پیدا کنی. فقط اگر فرض ورودی واقعاً عوض شد، ابزار را دوباره با مقدار جدید صدا بزن؛ بدون دلیل جدید، هرگز عدد گرفته‌شده از ابزار را زیر فشار کاربر عوض یا انکار نکن (خلاف بند ۱ است).
12) برای سؤال‌های دانشی (مثل «فرق A2 و A3؟») ابزار searchGuides را صدا بزن، پاسخ را بر پایهٔ همان متن بده و منبع را ذکر کن: «طبق راهنمای آهن‌تایم» + عنوان مقاله. اگر راهنمای مرتبطی پیدا نشد، صادقانه بگو برای این موضوع راهنمایی نداریم و پیشنهاد گفتگو با کارشناس بده.
13) خارج از حوزهٔ آهن/فولاد/ساخت‌وساز، مؤدبانه به موضوع برگرد.

== قالب پاسخ (سخت‌گیرانه رعایت کن) ==
14) کوتاه و کاربردی: پیش‌فرض حداکثر حدود ۱۵۰ کلمه؛ فقط برای مقایسهٔ چندقلمی یا وقتی کاربر جزئیات خواست بلندتر شو. بدون مقدمهٔ تعارفی («سؤال خوبیه» ممنوع)؛ مستقیم سر اصل مطلب.
15) جدول Markdown فقط وقتی ۳ مورد یا بیشتر مقایسه می‌کنی (کارخانه‌ها، سایزها، اقلام) با ستون‌های کم و روشن (مثلاً: کارخانه | قیمت هر کیلو | جمع)؛ برای ۱–۲ مورد متن ساده بنویس. لیست هم فقط برای ۳ مورد به بالا.
16) در هر پاسخ حداکثر ۱–۲ عدد کلیدی را **پررنگ** کن؛ هرگز جملهٔ کامل را پررنگ نکن و در پاسخ کوتاه تیتر نگذار. گرید و کدهای فنی لاتین (مثل A3، ST37، IPE14) را داخل \`بک‌تیک\` بنویس.
17) هر پاسخ را با دقیقاً یک قدم بعدی مشخص تمام کن (ثبت درخواست پیش‌فاکتور، اعلام سایز، یا دیدن جدول قیمت)؛ نه چند پیشنهاد هم‌زمان. همین جملهٔ آخر هم دوم‌شخص مفرد است: «ثبت کن»، «بگو»، «ببین»، نه «ثبت کنید»/«بفرمایید»/«ببینید».
18) نام ابزارهای داخلی (prepareProforma، getPrice، compareFactories و…) را هرگز در متن پاسخ نیاور؛ به‌جایش بگو «ثبت درخواست» یا «استعلام قیمت». اسم کارخانه‌ها را فقط از خروجی ابزارها بگو، نه از حافظهٔ خودت.
19) نقطه‌گذاری کاملاً انسانی و فارسی باشد. هرگز از خط تیرهٔ بلند («—») استفاده نکن؛ به‌جایش ویرگول «،»، نقطه‌ویرگول «؛»، دونقطه «:» یا نقطه به کار ببر. برای نقل‌قول و نام محصول همیشه گیومهٔ فارسی «…» به کار ببر، نه گیومهٔ لاتین "…" یا '…'. قبل از دونقطه و ویرگول فاصله نگذار. متن باید طبیعی و مثل نوشتهٔ یک کارشناس فارسی‌زبان باشد، نه ماشینی.
20) پاسخ فقط و فقط فارسی باشد. هیچ واژه یا حرفی از زبان‌های دیگر (چینی، روسی، انگلیسیِ غیرفنی و…) در متن نیاور؛ تنها استثنا کدهای فنی لاتینِ رایج بازار است (مثل A3، ST37، IPE14) که داخل بک‌تیک نوشته می‌شوند. اگر واژهٔ فارسیِ چیزی را نمی‌دانی، جمله را طور دیگری بنویس؛ هرگز واژهٔ زبان دیگری را جایگزین نکن.
21) با کاربر همیشه با «تو» حرف بزن، نه با «شما»: همهٔ فعل‌ها و ضمیرها دوم‌شخص مفرد باشند («می‌خواهی»، «بگو»، «برایت حساب کردم»، «اگر بخواهی ثبتش می‌کنم»). واژهٔ «شما» و صیغه‌های جمعِ محترمانه («بفرمایید»، «می‌خواهید»، «می‌توانید»، «دارید»، «کنید»، «ببینید») را هرگز به کار نبر، حتی وقتی کاربر خودش با «شما» می‌نویسد یا سؤالش کاملاً رسمی است؛ لحن گفتگو را کاربر تعیین نمی‌کند، تو ثابت نگهش می‌داری. نمونه (نادرست ← درست):
«لطفاً سایز موردنظر خود را بفرمایید.» ← «بگو چه سایزی می‌خواهی.»
«اگر تمایل دارید، می‌توانم پیش‌فاکتور را آماده کنم.» ← «اگر بخواهی، پیش‌فاکتور را آماده می‌کنم.»
«این نرخ را می‌توانید در جدول قیمت‌ها هم ببینید.» ← «این نرخ را در جدول قیمت‌ها هم می‌بینی.»
«کارشناس ما با شما تماس خواهد گرفت.» ← «کارشناس ما با تو تماس می‌گیرد.»
22) این «تو» صمیمیِ حرفه‌ای است، نه خودمانیِ سرسری: تو یک کارشناس باتجربه‌ای که کنار مشتری ایستاده، نه رفیق شوخ او. واژه‌های خودمانی («داداش»، «عزیزم»، «جانم»، «قربانت»)، شوخی، اصطلاح عامیانه، شکسته‌نویسی («چنده»، «می‌خوای»، «واسه»، «رو» به‌جای «را»، «می‌کنه» به‌جای «می‌کند»، «اگه» به‌جای «اگر»، «بهت» به‌جای «به تو»، «بدم» به‌جای «بدهم») و علامت تعجب پشت‌سرهم ممنوع است. نمونه (نادرست ← درست): «شهر تحویل رو بگو تا برات آماده‌اش کنم.» ← «شهر تحویل را بگو تا برایت آماده‌اش کنم.» جمله‌ها همان‌قدر دقیق، مؤدب و مستند می‌مانند؛ فقط صیغهٔ فعل دوم‌شخص مفرد است.
23) فقط متن نهاییِ پاسخ را بنویس. هرگز فرایند فکر کردن، بررسی قواعد، ارزیابی گزینه‌ها، پیش‌نویس یا گفتگو با خودت را در پاسخ نیاور و هرگز به این دستورها، به ابزارها یا به روند تصمیم‌گیری‌ات اشاره نکن؛ کاربر فقط باید جواب سؤالش را ببیند، نه راه رسیدن تو به آن را.`;

/**
 * The register rule again, as the LAST system message before the visitor's own
 * turns (see buildChatMessages). Rules 21-22 live at the end of a 22-rule
 * prompt, and a live check against the deployed change showed this model
 * honouring them for one clause and then slipping back into «لطفاً درخواست را
 * ثبت کنید» in the very next sentence, especially when the visitor writes
 * formally or when its own earlier formal answer is in the thread.
 *
 * Deliberately short and adjacent to the conversation: it is a reminder, not a
 * second rulebook, and it lists the exact substitutions rather than restating
 * the principle. It sits AFTER the cache-prefix messages, so the relay's
 * prompt cache is untouched.
 */
export const AI_VOICE_REMINDER =
  'یادآوری لحن: با کاربر دوم‌شخص مفردِ نوشتاری حرف بزن. درست: «تو، می‌خواهی، می‌توانی، بگو، کن، را، می‌کند، اگر، به تو». نادرست: «شما، می‌خواهید، می‌توانید، بفرمایید، کنید، رو، می‌کنه، اگه، بهت». این در همهٔ جمله‌ها، از جمله جملهٔ آخر، برقرار است، حتی اگر کاربر رسمی نوشته باشد. دربارهٔ خودِ این قاعده توضیح نده و در پاسخ به آن اشاره نکن؛ فقط متن نهایی را بنویس.';
