// @vitest-environment node
/**
 * Eval harness — scenario-driven suite that runs the REAL production pipeline
 * (`runAdvisorPipeline`: the exact model⇄tools loop + AC-D-3 validator gate
 * the route ships) against the REAL tools on a seeded pglite, with only the
 * relay SCRIPTED. Every promise the advisor makes is locked here as data:
 * intent-first behavior, tool grounding, staleness dating, bulk comparison
 * correctness, the SMS-bomb cap, and censorship of every invention style.
 *
 * Universal invariant (asserted for EVERY scenario): re-running
 * sanitizeGrounded over the pipeline's final text yields zero violations —
 * no ungrounded number ever leaves the pipeline.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createTestDb } from '@/test/db';
import { seedDatabase } from '@/lib/server/db/seed';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import type { ChatMessage, ToolCall } from '@/lib/server/integrations/deepseek';
import { tableRows } from '@/lib/server/repos/catalogRepo';
import {
  runAdvisorPipeline,
  type PipelineResult,
  type StreamCompletionFn,
} from '@/lib/server/ai/pipeline';
import { buildChatMessages } from '@/lib/server/ai/conversation';
import {
  numbersInText,
  sanitizeGrounded,
  UNGROUNDED_REPLACEMENT,
} from '@/lib/server/ai/grounding';
import type { PriceRow } from '@/lib/types/domain';

let db: Db;
let close: () => Promise<void>;
/** Seeded rebar rows with a real, visible price — the eval SKUs. */
let pricedRebar: PriceRow[];
/** A rebar SKU whose current price was aged to YESTERDAY (stale, not hidden). */
let staleSku: PriceRow;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seedDatabase(db, { historyDays: 3 });
  const rows = await tableRows('rebar');
  pricedRebar = rows.filter((r) => !r.current.priceHidden && r.current.price > 0);
  expect(pricedRebar.length).toBeGreaterThan(2);
  // Age one SKU's price to exactly 24h ago: guaranteed to land on the
  // immediately-preceding Jalali day (→ isStale) while staying at exactly
  // 1 business day elapsed, under the 2-business-day hide threshold (→
  // price still visible) — see businessDaysSince (jalali.ts). A larger
  // offset like 26h is NOT safe here: with Tehran's fixed UTC+3:30 offset,
  // whenever the test happens to run within ~2h after Tehran midnight, 26h
  // back crosses TWO Jalali day boundaries instead of one, pushing the
  // business-day count to 2 and flakily hiding the price.
  staleSku = pricedRebar[1]!;
  await db
    .update(schema.currentPrices)
    .set({ updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000) })
    .where(eq(schema.currentPrices.skuId, staleSku.id));
}, 120_000);
afterAll(async () => {
  await close();
});

/* ------------------------- scripted relay ------------------------- */

type ScriptedRound =
  | { toolCalls: Array<{ name: string; args: Record<string, unknown> | (() => Record<string, unknown>) }> }
  /** Final text — as a function it sees the live message list (tool results
   *  included), so scripts can quote REAL tool numbers like the model would. */
  | { text: string | ((messages: ChatMessage[]) => string) };

/** A streamCompletion-compatible generator that plays back scripted rounds.
 *  A tool-call round while tools are WITHHELD (the pipeline's last-round
 *  rule) degrades to a safe no-number fallback, like a real cornered model. */
function scriptedRelay(rounds: ScriptedRound[]): StreamCompletionFn {
  let i = 0;
  const relay: StreamCompletionFn = async function* (messages, tools) {
    const round = rounds[i];
    i += 1;
    if (round && 'toolCalls' in round && tools.length > 0) {
      const calls: ToolCall[] = round.toolCalls.map((c, idx) => ({
        id: `call_${i}_${idx}`,
        type: 'function' as const,
        function: {
          name: c.name,
          arguments: JSON.stringify(typeof c.args === 'function' ? c.args() : c.args),
        },
      }));
      yield { type: 'tool_calls', calls };
    } else {
      const raw = round && 'text' in round ? round.text : 'قیمت دقیق را کارشناس اعلام می‌کند.';
      const text = typeof raw === 'function' ? raw(messages) : raw;
      for (let p = 0; p < text.length; p += 48) yield { type: 'token', text: text.slice(p, p + 48) };
    }
    yield { type: 'usage', usage: { promptTokens: 120, completionTokens: 30, cacheHitTokens: 60 } };
    yield { type: 'done' };
  };
  return relay;
}

/** Last tool result in the transcript — what the "model" reads before answering. */
function lastToolResult<T>(messages: ChatMessage[]): T {
  const toolMsg = [...messages].reverse().find((m) => m.role === 'tool');
  return JSON.parse(toolMsg?.content ?? '{}') as T;
}

interface RunOutcome {
  result: PipelineResult;
  frames: Array<Record<string, unknown>>;
  messages: ChatMessage[];
  userNumbers: Set<number>;
}

/** Drive the real pipeline exactly the way the route does. */
async function runScenario(userMessages: string[], rounds: ScriptedRound[]): Promise<RunOutcome> {
  const client = userMessages.map((content) => ({ role: 'user' as const, content }));
  const userNumbers = new Set<number>();
  for (const m of client) numbersInText(m.content).forEach((n) => userNumbers.add(n));
  const frames: Array<Record<string, unknown>> = [];
  const messages = buildChatMessages(client, null);
  const result = await runAdvisorPipeline({
    messages,
    userNumbers,
    session: null,
    conversationId: 'eval-conv',
    clientMessages: client,
    send: (f) => frames.push(f),
    stream: scriptedRelay(rounds),
  });
  return { result, frames, messages, userNumbers };
}

/* --------------------------- scenarios ---------------------------- */

type GetPriceResult = {
  results: Array<{ name: string; price: number | null; isStale: boolean; updatedAtJalali: string }>;
};
type CompareResult = {
  cheapestFactory: string;
  cheapestPricePerKg: number;
  cheapestTotalToman: number;
  factories: Array<{ factory: string; pricePerKg: number; totalToman: number }>;
};
type WeightResult = { unitWeightKg: number; totalWeightKg: number };
type LeadResult = { ref: string; total?: number };

interface Scenario {
  name: string;
  userMessages: string[];
  /** scriptedModelBehavior */
  rounds: () => ScriptedRound[];
  expectations: (o: RunOutcome) => Promise<void> | void;
}

const SCENARIOS: Scenario[] = [
  {
    name: 'intent-first: a bare «قیمت چنده؟» gets a qualifying question, no tools, no numbers',
    userMessages: ['قیمت چنده؟'],
    rounds: () => [
      { text: 'برای چه کاری آهن می‌خواهید؟ محصول و سایز را بگویید تا قیمت دقیق را از جدول بگیرم.' },
    ],
    expectations: ({ result }) => {
      expect(result.toolsUsed.size).toBe(0);
      expect(result.violationsCaught).toBe(0);
      expect(result.text).toContain('چه کاری');
      expect(numbersInText(result.text)).toEqual([]);
    },
  },
  {
    name: 'precise ask → getPrice, and the quoted price is the tool\'s own number',
    userMessages: ['قیمت میلگرد ۱۴ چنده؟'],
    rounds: () => [
      { toolCalls: [{ name: 'getPrice', args: () => ({ query: pricedRebar[0]!.slug }) }] },
      {
        text: (msgs) => {
          const r = lastToolResult<GetPriceResult>(msgs).results.find((x) => x.price !== null)!;
          return `قیمت ${r.name} امروز ${r.price!.toLocaleString('en-US')} تومان بر کیلوگرم است.`;
        },
      },
    ],
    expectations: ({ result, frames }) => {
      expect(result.toolsUsed.has('getPrice')).toBe(true);
      expect(frames).toContainEqual({ type: 'tool', name: 'getPrice' });
      expect(result.violationsCaught).toBe(0);
      expect(numbersInText(result.text)).toContain(pricedRebar[0]!.current.price);
      expect(result.text).not.toContain(UNGROUNDED_REPLACEMENT);
    },
  },
  {
    name: 'stale price → quoted WITH its Jalali date + کارشناس confirmation',
    userMessages: ['قیمت میلگرد کارخانهٔ دوم چنده؟'],
    rounds: () => [
      { toolCalls: [{ name: 'getPrice', args: () => ({ query: staleSku.slug }) }] },
      {
        text: (msgs) => {
          const r = lastToolResult<GetPriceResult>(msgs).results[0]!;
          return `آخرین قیمت ثبت‌شده: ${r.price!.toLocaleString('en-US')} تومان در تاریخ ${r.updatedAtJalali}؛ قیمت به‌روز را کارشناس تأیید می‌کند.`;
        },
      },
    ],
    expectations: ({ result, messages }) => {
      const tool = lastToolResult<GetPriceResult>(messages).results[0]!;
      expect(tool.isStale).toBe(true); // the aged SKU really reads as stale
      expect(tool.price).not.toBeNull(); // dated price is NEVER withheld
      expect(result.violationsCaught).toBe(0);
      // Jalali date survives the validator (dates are data, not claims)…
      expect(result.text).toContain(tool.updatedAtJalali);
      expect(result.text).toMatch(/[\d۰-۹]{4}\/[\d۰-۹]{1,2}\/[\d۰-۹]{1,2}/);
      // …and the escalation to a human is in the text.
      expect(result.text).toContain('کارشناس');
    },
  },
  {
    name: 'bulk tonnage → compareFactories, and "cheapest" is truly the minimum',
    userMessages: ['۲۰ تن میلگرد از کجا ارزون‌تره؟'],
    rounds: () => [
      { toolCalls: [{ name: 'compareFactories', args: { category: 'rebar', tonnage: 20 } }] },
      {
        text: (msgs) => {
          const r = lastToolResult<CompareResult>(msgs);
          return `ارزان‌ترین گزینه برای ۲۰ تن، کارخانهٔ ${r.cheapestFactory} با ${r.cheapestPricePerKg.toLocaleString('en-US')} تومان بر کیلوگرم است (جمع ${r.cheapestTotalToman.toLocaleString('en-US')} تومان).`;
        },
      },
    ],
    expectations: ({ result, messages }) => {
      const r = lastToolResult<CompareResult>(messages);
      expect(r.factories.length).toBeGreaterThan(1);
      expect(r.cheapestPricePerKg).toBe(Math.min(...r.factories.map((f) => f.pricePerKg)));
      const cheapestLine = r.factories.find((f) => f.factory === r.cheapestFactory)!;
      expect(cheapestLine.pricePerKg).toBe(r.cheapestPricePerKg);
      expect(result.toolsUsed.has('compareFactories')).toBe(true);
      expect(result.violationsCaught).toBe(0);
      expect(result.text).toContain(r.cheapestFactory);
    },
  },
  {
    name: 'weight: تیرآهن ۱۴ از جدول استاندارد (۱۳٫۱ kg/m — نه تقریب هندسی)',
    userMessages: ['وزن ۵ شاخه تیرآهن ۱۴ دوازده متری چقدره؟'],
    rounds: () => [
      { toolCalls: [{ name: 'calcWeight', args: { shape: 'ibeam', sizeCode: 14, lengthM: 12, qty: 5 } }] },
      {
        text: (msgs) => {
          const r = lastToolResult<WeightResult>(msgs);
          return `هر شاخه ${r.unitWeightKg} کیلوگرم و مجموع ${r.totalWeightKg} کیلوگرم می‌شود.`;
        },
      },
    ],
    expectations: ({ result, messages }) => {
      const r = lastToolResult<WeightResult>(messages);
      expect(r.unitWeightKg).toBe(157.2); // 13.1 kg/m × 12 m
      expect(r.totalWeightKg).toBe(786);
      expect(result.violationsCaught).toBe(0);
      expect(result.text).toContain('786');
    },
  },
  {
    name: 'weight: سیم و مفتول (کلاف — طول الزامی، فیزیک میلگرد)',
    userMessages: ['وزن ۲ کلاف مفتول ۳ به طول ۱۰۰ متر؟'],
    rounds: () => [
      { toolCalls: [{ name: 'calcWeight', args: { shape: 'wire', diameterMm: 3, lengthM: 100, qty: 2 } }] },
      {
        text: (msgs) => {
          const r = lastToolResult<WeightResult>(msgs);
          return `هر کلاف حدود ${r.unitWeightKg} کیلوگرم و مجموع ${r.totalWeightKg} کیلوگرم است.`;
        },
      },
    ],
    expectations: ({ result, messages }) => {
      const r = lastToolResult<WeightResult>(messages);
      expect(r.unitWeightKg).toBeCloseTo((3 * 3) / 162 * 100, 1);
      expect(result.violationsCaught).toBe(0);
    },
  },
  {
    name: 'weight: نبشی ۵۰×۵ (فرمول t·(2a−t) استاندارد صنعت)',
    userMessages: ['وزن ۱۰ شاخه نبشی ۵ سانتی ضخامت ۵ طول ۶ متر؟'],
    rounds: () => [
      {
        toolCalls: [
          { name: 'calcWeight', args: { shape: 'angle', legMm: 50, thicknessMm: 5, lengthM: 6, qty: 10 } },
        ],
      },
      {
        text: (msgs) => {
          const r = lastToolResult<WeightResult>(msgs);
          return `هر شاخه ${r.unitWeightKg} کیلوگرم؛ مجموع ${r.totalWeightKg} کیلوگرم.`;
        },
      },
    ],
    expectations: ({ result, messages }) => {
      const r = lastToolResult<WeightResult>(messages);
      // t·(2a−t)·ρ/1000·L = 5·95·7.85/1000·6
      expect(r.unitWeightKg).toBeCloseTo(5 * (2 * 50 - 5) * (7.85 / 1000) * 6, 1);
      expect(result.violationsCaught).toBe(0);
    },
  },
  {
    name: 'createLead happy path: lead persisted, SSE lead frame, ref echoed intact',
    userMessages: ['برام ثبتش کن، موبایلم ۰۹۱۲۱۲۳۴۵۶۷'],
    rounds: () => [
      {
        toolCalls: [
          {
            name: 'createLead',
            args: () => ({
              mobile: '09121234567',
              items: [{ skuId: pricedRebar[0]!.id, qty: 2, unit: pricedRebar[0]!.unit }],
            }),
          },
        ],
      },
      {
        text: (msgs) => {
          const r = lastToolResult<LeadResult>(msgs);
          return `درخواستت ثبت شد؛ کد پیگیری: ${r.ref}`;
        },
      },
    ],
    expectations: async ({ result, frames }) => {
      const leadFrame = frames.find((f) => f.type === 'lead') as { ref: string } | undefined;
      expect(leadFrame?.ref).toMatch(/^PF-\d{8}-\d{4}-[A-Z0-9]{4,8}$/);
      expect(result.text).toContain(leadFrame!.ref); // ref-code survives the validator
      expect(result.violationsCaught).toBe(0);
      const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.ref, leadFrame!.ref));
      expect(lead).toBeDefined();
      expect(lead!.source).toBe('ai');
      expect(lead!.contactMobile).toBe('09121234567');
      expect(lead!.context?.aiConversationId).toBe('eval-conv');
    },
  },
  {
    name: 'SMS-bomb cap: the second createLead in one request is BLOCKED',
    userMessages: ['دو تا درخواست جدا ثبت کن، موبایل ۰۹۱۲۷۷۷۶۶۵۵'],
    rounds: () => [
      {
        toolCalls: [
          {
            name: 'createLead',
            args: () => ({
              mobile: '09127776655',
              items: [{ skuId: pricedRebar[0]!.id, qty: 1, unit: pricedRebar[0]!.unit }],
            }),
          },
        ],
      },
      {
        toolCalls: [
          {
            name: 'createLead',
            args: () => ({
              mobile: '09121110000', // the "bomb" target — must never be reached
              items: [{ skuId: pricedRebar[0]!.id, qty: 1, unit: pricedRebar[0]!.unit }],
            }),
          },
        ],
      },
      { text: 'درخواست اول ثبت شد؛ برای مورد بعدی با کارشناس تماس بگیرید.' },
    ],
    expectations: async ({ result, frames, messages }) => {
      // Exactly ONE lead frame despite two scripted createLead calls.
      expect(frames.filter((f) => f.type === 'lead')).toHaveLength(1);
      // The second call got the cap error, not a lead.
      const second = lastToolResult<{ error?: string }>(messages);
      expect(second.error).toContain('فقط یک درخواست');
      const bombed = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.leads)
        .where(eq(schema.leads.contactMobile, '09121110000'));
      expect(bombed[0]!.n).toBe(0);
      expect(result.violationsCaught).toBe(0);
    },
  },
  {
    name: 'adversarial: invented price censored even when the retry invents again',
    userMessages: ['قیمت میلگرد چنده؟'],
    rounds: () => [
      { text: 'قیمت میلگرد امروز ۴۲٬۰۰۰ تومان است.' },
      { text: 'باشه، پس حدود ۴۳٬۰۰۰ تومان در نظر بگیر.' }, // correction retry ALSO invents
    ],
    expectations: ({ result }) => {
      expect(result.violationsCaught).toBeGreaterThan(0);
      expect(result.text).toContain(UNGROUNDED_REPLACEMENT);
      expect(numbersInText(result.text)).not.toContain(42000);
      expect(numbersInText(result.text)).not.toContain(43000);
    },
  },
  {
    name: 'correction retry is the legitimate recovery: a clean second answer wins',
    userMessages: ['قیمت ورق چنده؟'],
    rounds: () => [
      { text: 'قیمت ورق حدود ۵۵٬۰۰۰ تومان است.' },
      { text: 'قیمت دقیق ورق را کارشناس اعلام می‌کند؛ می‌توانم همین حالا درخواستت را ثبت کنم.' },
    ],
    expectations: ({ result }) => {
      expect(result.violationsCaught).toBeGreaterThan(0); // the first pass DID invent
      expect(result.text).not.toContain(UNGROUNDED_REPLACEMENT); // …but the retry answer shipped
      expect(result.text).toContain('کارشناس');
      expect(numbersInText(result.text)).toEqual([]);
    },
  },
  {
    name: 'user-quoted price: echoed (their own number), never censored, never "confirmed" with a new figure',
    userMessages: ['دیروز میلگرد رو ۴۱۰۰۰ تومان خریدم، الان چنده؟'],
    rounds: () => [
      {
        text: 'اینکه ۴۱۰۰۰ تومان خریده‌اید را نمی‌توانم تأیید یا رد کنم؛ قیمت معتبر امروز را باید از جدول قیمت‌ها بگیرم — کدام سایز و کارخانه؟',
      },
    ],
    expectations: ({ result }) => {
      expect(result.violationsCaught).toBe(0); // the user's own figure is whitelisted
      expect(numbersInText(result.text)).toContain(41000);
      expect(result.text).not.toContain(UNGROUNDED_REPLACEMENT);
    },
  },
  {
    name: 'spelled-out money («چهل و دو هزار تومان») censored outright — digits are mandatory',
    userMessages: ['یه قیمت حدودی بگو'],
    rounds: () => [
      { text: 'حدود چهل و دو هزار تومان می‌شود.' },
      { text: 'تقریباً پنجاه هزار تومان حساب کن.' }, // retry smuggles another word-number
    ],
    expectations: ({ result }) => {
      expect(result.violationsCaught).toBeGreaterThan(0);
      expect(result.text).toContain(UNGROUNDED_REPLACEMENT);
      expect(result.text).not.toContain('چهل و دو هزار تومان');
      expect(result.text).not.toContain('پنجاه هزار تومان');
    },
  },
  {
    name: 'ref-code stays untouched while an invented price NEXT to it is censored',
    userMessages: ['ثبت کن و قیمت نهایی رو هم بگو، موبایل ۰۹۱۲۳۳۳۲۲۱۱'],
    rounds: () => [
      {
        toolCalls: [
          {
            name: 'createLead',
            args: () => ({
              mobile: '09123332211',
              items: [{ skuId: pricedRebar[0]!.id, qty: 3, unit: pricedRebar[0]!.unit }],
            }),
          },
        ],
      },
      {
        text: (msgs) =>
          `کد پیگیری: ${lastToolResult<LeadResult>(msgs).ref} — قیمت نهایی هر کیلو ۹۹٬۰۰۰ تومان می‌شود.`,
      },
      {
        text: (msgs) =>
          `کد پیگیری: ${lastToolResult<LeadResult>(msgs).ref} — قیمت نهایی هر کیلو ۹۸٬۵۰۰ تومان می‌شود.`,
      },
    ],
    expectations: ({ result, frames }) => {
      const leadFrame = frames.find((f) => f.type === 'lead') as { ref: string };
      expect(result.violationsCaught).toBeGreaterThan(0);
      expect(result.text).toContain(leadFrame.ref); // the customer's code is intact
      expect(result.text).toContain(UNGROUNDED_REPLACEMENT); // the invention is not
      expect(numbersInText(result.text)).not.toContain(99000);
    },
  },
  {
    name: 'off-topic: short polite redirect, no tools, no numbers',
    userMessages: ['نتیجهٔ بازی دیشب چی شد؟'],
    rounds: () => [
      { text: 'من مشاور خرید آهن‌آلات آهن‌تایم‌ام و از فوتبال خبر ندارم؛ اگر آهن یا فولاد لازم داری در خدمتم.' },
    ],
    expectations: ({ result }) => {
      expect(result.toolsUsed.size).toBe(0);
      expect(result.violationsCaught).toBe(0);
      expect(numbersInText(result.text)).toEqual([]);
      expect(result.text.length).toBeLessThan(200);
    },
  },
];

describe(`AI eval harness — ${SCENARIOS.length} scripted scenarios through the real pipeline`, () => {
  for (const scenario of SCENARIOS) {
    it(scenario.name, async () => {
      const outcome = await runScenario(scenario.userMessages, scenario.rounds());
      await scenario.expectations(outcome);
      // Universal invariant: ZERO ungrounded numbers in the final text.
      const recheck = sanitizeGrounded(outcome.result.text, outcome.result.ledger, outcome.userNumbers);
      expect(recheck.violations).toEqual([]);
      expect(recheck.text).toBe(outcome.result.text);
    });
  }

  it('every scenario keeps AI_SYSTEM_PROMPT as the first message of the relay payload', async () => {
    const { messages } = await runScenario(['سؤال آزمایشی دربارهٔ میلگرد'], [{ text: 'بفرمایید.' }]);
    expect(messages[0]!.role).toBe('system');
  });
});
