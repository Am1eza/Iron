/**
 * Grounded AI tools — thin wrappers over the same services the site uses, so
 * every number the advisor quotes has one source of truth. The model never
 * invents a price/weight (acceptance-criteria §D: null/stale → «کارشناس تماس
 * می‌گیرد», never a guess).
 */
import { z } from 'zod';
import { searchSkus, findSkuRow, listCategories, listSubCategories, tableRows } from '@/lib/server/repos/catalogRepo';
import { searchPublishedGuides, type ArticleFull } from '@/lib/server/repos/articlesRepo';
import { searchCorrections } from '@/lib/server/repos/aiCorrectionsRepo';
import { redisRateCheck } from '@/lib/server/redis';
import { estimateProject } from '@/lib/server/services/estimate.service';
import { createLead } from '@/lib/server/services/leads.service';
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
          sub: { type: 'string', description: 'زیردسته (اختیاری)، مثلاً «آجدار A3»' },
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
const TRANSCRIPT_MAX_MESSAGES = 12;
const TRANSCRIPT_MAX_CHARS = 500;

/** Execute one tool call; ALWAYS returns a JSON-safe result (errors as text). */
export async function runTool(
  name: string,
  args: Record<string, unknown>,
  session: AuthUser | null,
  conversationId?: string,
  transcript?: Array<{ role: string; content: string }>,
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
      case 'createLead': {
        const parsed = leadArgs.safeParse(args);
        if (!parsed.success) return { error: 'اطلاعات ناقص است؛ موبایل و اقلام را کامل بپرس.' };
        // Per-MOBILE cap on AI-driven lead creation (each sends a real SMS).
        // The pipeline's per-conversation MAX_LEAD_CALLS can be dodged by a
        // scripted client rotating conversationId; this Redis-backed cap keys
        // on the actual SMS recipient instead. Fail-open when Redis is down —
        // the per-conversation cap and chat rate limit still stand beneath it.
        const overMobileCap = await redisRateCheck(`ai-lead:${parsed.data.mobile}`, 3, 60 * 60_000);
        if (overMobileCap === true) {
          return {
            error:
              'برای این شماره در یک ساعت اخیر چند درخواست ثبت شده. کمی بعد دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.',
          };
        }
        const result = await createLead(
          {
            contact: { name: parsed.data.name, mobile: parsed.data.mobile },
            items: parsed.data.items,
            source: 'ai',
            context: {
              aiConversationId: conversationId,
              // Sales sees the whole chat that led to this lead (capped).
              ...(transcript && transcript.length > 0
                ? {
                    transcript: transcript
                      .slice(-TRANSCRIPT_MAX_MESSAGES)
                      .map((m) => ({ role: m.role, content: m.content.slice(0, TRANSCRIPT_MAX_CHARS) })),
                  }
                : {}),
            },
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

export const AI_SYSTEM_PROMPT = `تو «مشاور هوشمند آهن‌تایم» هستی، یک کارشناس کهنه‌کار بازار آهن ایران با سال‌ها تجربهٔ فروش در بازار آهن تهران. مثل یک مشاور معتمد رفتار می‌کنی، نه فروشندهٔ سمج: اول نیاز مشتری را می‌فهمی، بعد راه‌حل می‌دهی. شعار آهن‌تایم: «اول مشورت، بعد خرید». پرداخت آنلاین نداریم؛ فروش با پیش‌فاکتور و تماس کارشناس نهایی می‌شود.

== قواعد قطعی اعداد (هرگز نقض نکن) ==
1) هیچ قیمت، وزن یا عددی را از خودت نساز. هر عدد فقط از خروجی ابزارها (getPrice, calcWeight, estimateProject, compareFactories) می‌آید. حتی وزن‌های «بدیهی» را هم با calcWeight حساب کن.
2) اگر ابزار قیمت null برگرداند، هیچ عددی نگو؛ بگو قیمت توسط کارشناس اعلام می‌شود و پیشنهاد ثبت درخواست بده؛ هرگز حدس نزن. اگر قیمت عدد دارد ولی isStale=true است، حتماً همان قیمت را همراه تاریخش بگو («آخرین قیمت ثبت‌شده: X تومان در تاریخ Y»؛ Y همان updatedAtJalali خروجی ابزار) و اضافه کن که قیمت به‌روز را کارشناس تأیید می‌کند؛ قیمت تاریخ‌دار را هرگز از کاربر دریغ نکن.
3) عدد را همیشه با رقم بنویس، نه با حروف؛ اعداد با جداکنندهٔ هزارگان و همیشه با واحد (تومان، کیلوگرم، شاخه). قبل از پاسخ، معقول بودن عدد را چک کن: اگر نتیجه نامعقول بود (مثلاً وزن یک شاخه میلگرد چند صد کیلو، یا وزن یک شاخه تیرآهن/ناودانی زیر ۶ کیلوگرم — سبک‌ترین سایز واقعی تیرآهن هم به این کمی نمی‌رسد)، shape/sizeCode/diameterMm ورودی calcWeight را دوباره چک کن (نشانهٔ کلاسیک این خطا: برای «تیرآهن ۱۴» به‌جای shape=ibeam و sizeCode=14 اشتباهاً shape=rebar یا wire با diameterMm=14 صدا زده شده) و ابزار را با ورودی درست دوباره صدا بزن.
4) وقتی کاربر آمادهٔ خرید/پیش‌فاکتور است، با ابزار createLead درخواست را ثبت کن. در تأییدیه، شمارهٔ پیگیری را دقیقاً همان‌طور که ابزار برگردانده (بدون تغییر) بنویس، و وزن/مبلغ کل را از فیلدهای items/totalWeightKg/total همان خروجی بگو؛ هرگز خودت وزن یا مبلغ را از روی مقدار کاربر (مثلاً «۲ تن») محاسبه نکن.
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
17) هر پاسخ را با دقیقاً یک قدم بعدی مشخص تمام کن (ثبت درخواست پیش‌فاکتور، اعلام سایز، یا دیدن جدول قیمت)؛ نه چند پیشنهاد هم‌زمان.
18) نام ابزارهای داخلی (createLead، getPrice، compareFactories و…) را هرگز در متن پاسخ نیاور؛ به‌جایش بگو «ثبت درخواست» یا «استعلام قیمت». اسم کارخانه‌ها را فقط از خروجی ابزارها بگو، نه از حافظهٔ خودت.
19) نقطه‌گذاری کاملاً انسانی و فارسی باشد. هرگز از خط تیرهٔ بلند («—») استفاده نکن؛ به‌جایش ویرگول «،»، نقطه‌ویرگول «؛»، دونقطه «:» یا نقطه به کار ببر. متن باید طبیعی و مثل نوشتهٔ یک کارشناس فارسی‌زبان باشد، نه ماشینی.`;
