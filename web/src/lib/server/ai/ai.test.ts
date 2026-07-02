import { describe, it, expect } from 'vitest';
import { GroundingLedger, numbersInText, sanitizeGrounded, UNGROUNDED_REPLACEMENT } from './grounding';
import { executeTool, resolveCategory } from './tools';
import { runAdvisorTurn, trimHistory, chunkText, FALLBACK_MESSAGE, type AdvisorEvent } from './engine';
import { getRows } from '@/lib/mock/catalogData';
import { CONSTANTS } from '@/lib/config/constants';

/* ------------------------- grounding validator ------------------------- */

describe('GroundingLedger + sanitizeGrounded (AC-D-3)', () => {
  it('passes numbers that came from tools', () => {
    const ledger = new GroundingLedger();
    ledger.add(38500);
    const r = sanitizeGrounded('قیمت میلگرد ۳۸,۵۰۰ تومان بر کیلوگرم است.', ledger, new Set());
    expect(r.violations).toEqual([]);
    expect(r.text).toContain('۳۸,۵۰۰');
  });

  it('censors an invented price', () => {
    const ledger = new GroundingLedger();
    ledger.add(38500);
    const r = sanitizeGrounded('قیمت حدوداً ۴۲٬۰۰۰ تومان است.', ledger, new Set());
    expect(r.violations).toEqual([42000]);
    expect(r.text).toContain(UNGROUNDED_REPLACEMENT);
    expect(r.text).not.toContain('۴۲٬۰۰۰');
  });

  it('allows the «هزار تومان» scaled form of a grounded price', () => {
    const ledger = new GroundingLedger();
    ledger.add(38000);
    const r = sanitizeGrounded('حدود ۳۸ هزار تومان بر کیلو.', ledger, new Set());
    expect(r.violations).toEqual([]);
  });

  it('censors an INVENTED «هزار تومان» scaled price (adversarial)', () => {
    const ledger = new GroundingLedger();
    ledger.add(38000); // only 38k is real
    const r = sanitizeGrounded('حدود ۴۵ هزار تومان بر کیلو.', ledger, new Set());
    expect(r.violations).toEqual([45]);
    expect(r.text).toContain(UNGROUNDED_REPLACEMENT);
  });

  it('allows the «میلیون تومان» scaled form of a grounded total', () => {
    const ledger = new GroundingLedger();
    ledger.add(820_000_000);
    const r = sanitizeGrounded('جمع کل حدود ۸۲۰ میلیون تومان می‌شود.', ledger, new Set());
    expect(r.violations).toEqual([]);
  });

  it('allows user-typed numbers (their own inputs are not invented)', () => {
    const user = new Set(numbersInText('یه خونهٔ ۱۲۰ متری ۲ طبقه، بودجه ۵۰۰,۰۰۰,۰۰۰ تومان'));
    const r = sanitizeGrounded('برای ۱۲۰ متر و بودجهٔ ۵۰۰٬۰۰۰٬۰۰۰ تومانی‌ات…', new GroundingLedger(), user);
    expect(r.violations).toEqual([]);
  });

  it('leaves small non-claim numbers (sizes, floors, counts) alone', () => {
    const r = sanitizeGrounded('میلگرد ۱۴ برای سقف ۲ طبقه گزینهٔ خوبی است.', new GroundingLedger(), new Set());
    expect(r.violations).toEqual([]);
  });

  it('censors a small number glued to a money unit', () => {
    const r = sanitizeGrounded('فقط ۹۵ تومان اختلاف دارد.', new GroundingLedger(), new Set());
    expect(r.violations).toEqual([95]);
  });

  it('records every number of a nested tool result', () => {
    const ledger = new GroundingLedger();
    ledger.addFromJson({ a: [{ price: 41000 }], b: { total: 820000000 } });
    expect(ledger.has(41000)).toBe(true);
    expect(ledger.has(820000000)).toBe(true);
  });
});

/* ------------------------------ tools ------------------------------ */

describe('grounded tools', () => {
  it('resolves Persian and English category aliases', () => {
    expect(resolveCategory('میلگرد آجدار')?.slug).toBe('rebar');
    expect(resolveCategory('rebar')?.slug).toBe('rebar');
    expect(resolveCategory('تیراهن ۱۸')?.slug).toBe('ibeam');
    expect(resolveCategory('چیز نامربوط')).toBeNull();
  });

  it('get_prices returns real catalog prices and registers them', () => {
    const ledger = new GroundingLedger();
    const out = executeTool('get_prices', JSON.stringify({ category: 'میلگرد', size: '14' }), ledger);
    const r = out.result as { prices?: { pricePerKgToman: number }[]; error?: string };
    expect(r.error).toBeUndefined();
    expect(r.prices!.length).toBeGreaterThan(0);
    const catalogPrices = new Set(getRows('rebar').map((x) => x.current.price));
    for (const p of r.prices!) {
      expect(catalogPrices.has(p.pricePerKgToman)).toBe(true); // never invents
      expect(ledger.has(p.pricePerKgToman)).toBe(true); // and registers
    }
  });

  it('unknown specs return a graceful error, not a guess (AC-D-4)', () => {
    const out = executeTool('get_prices', JSON.stringify({ category: 'میلگرد', size: '999' }), new GroundingLedger());
    expect((out.result as { error?: string }).error).toBeTruthy();
  });

  it('estimate_project produces a card whose totals are code-computed (BR-D3.2)', () => {
    const ledger = new GroundingLedger();
    const out = executeTool('estimate_project', JSON.stringify({ area_m2: 120, floors: 2 }), ledger);
    expect(out.card?.kind).toBe('estimate');
    const r = out.result as { items: { weightKg: number; costToman: number }[]; totalWeightKg: number; totalCostToman: number };
    expect(r.totalWeightKg).toBe(r.items.reduce((s, i) => s + i.weightKg, 0));
    expect(r.totalCostToman).toBe(r.items.reduce((s, i) => s + i.costToman, 0));
    expect(ledger.has(r.totalCostToman)).toBe(true);
  });

  it('compare_factories flags the cheapest mill', () => {
    const out = executeTool('compare_factories', JSON.stringify({ category: 'میلگرد', tonnage: 20 }), new GroundingLedger());
    const r = out.result as { cheapest: { pricePerKg: number }; lines: { pricePerKg: number }[] };
    expect(r.cheapest.pricePerKg).toBe(Math.min(...r.lines.map((l) => l.pricePerKg)));
  });

  it('malformed args and unknown tools fail safe', () => {
    expect((executeTool('get_prices', '{oops', new GroundingLedger()).result as { error?: string }).error).toBeTruthy();
    expect((executeTool('nope', '{}', new GroundingLedger()).result as { error?: string }).error).toBeTruthy();
  });
});

/* ------------------------------ engine ------------------------------ */

const CFG = { apiKey: 'k', baseUrl: 'https://relay.test/v1', model: 'deepseek-chat' };

function fakeFetchSequence(bodies: unknown[]): typeof fetch {
  let i = 0;
  return (async () => {
    const body = bodies[Math.min(i++, bodies.length - 1)];
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
}

const modelSays = (content: string) => ({ choices: [{ message: { content } }] });
const modelCalls = (name: string, args: unknown) => ({
  choices: [{ message: { content: null, tool_calls: [{ id: 't1', type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }],
});

async function collect(bodies: unknown[], history = [{ role: 'user' as const, text: 'قیمت میلگرد ۱۴ چنده؟' }]) {
  const events: AdvisorEvent[] = [];
  await runAdvisorTurn(CFG, history, (e) => events.push(e), fakeFetchSequence(bodies));
  return events;
}

describe('advisor engine', () => {
  it('tool round → grounded answer streams through untouched', async () => {
    // The cheapest rebar price is always inside the tool's top-8 payload → grounded.
    const price = Math.min(...getRows('rebar').map((r) => r.current.price));
    const events = await collect([
      modelCalls('get_prices', { category: 'میلگرد' }),
      modelSays(`قیمت امروز حدود ${price} تومان بر کیلوگرم است. برای نهایی‌شدن، درخواست ثبت کن.`),
    ]);
    const text = events.filter((e): e is Extract<AdvisorEvent, { type: 'delta' }> => e.type === 'delta').map((e) => e.text).join('');
    expect(text).toContain(String(price));
    expect(text).not.toContain(UNGROUNDED_REPLACEMENT);
    expect(events.at(-1)).toEqual({ type: 'done' });
  });

  it('an invented number is censored even if the retry also invents (adversarial)', async () => {
    const events = await collect([
      modelSays('قیمت میلگرد ۹۹٬۹۹۹ تومان است.'), // no tool call at all
      modelSays('باشه، قیمت ۸۸٬۸۸۸ تومان است.'), // retry disobeys too
    ]);
    const text = events.filter((e): e is Extract<AdvisorEvent, { type: 'delta' }> => e.type === 'delta').map((e) => e.text).join('');
    expect(text).not.toMatch(/[۹9]{2}[٬,]?[۹9]{3}|[۸8]{2}[٬,]?[۸8]{3}/);
    expect(text).toContain(UNGROUNDED_REPLACEMENT);
  });

  it('relay failure → graceful Persian fallback (AC-D-9)', async () => {
    const failingFetch = (async () => new Response('nope', { status: 502 })) as typeof fetch;
    const events: AdvisorEvent[] = [];
    await runAdvisorTurn(CFG, [{ role: 'user', text: 'سلام' }], (e) => events.push(e), failingFetch);
    expect(events).toEqual([{ type: 'error', message: FALLBACK_MESSAGE }]);
  });

  it('estimate tool emits a card event after the text', async () => {
    const events = await collect(
      [
        modelCalls('estimate_project', { area_m2: 100, floors: 2 }),
        modelSays('برآورد تخمینی آماده است؛ جزئیات در کارت زیر.'),
      ],
      [{ role: 'user', text: 'یه خونهٔ ۱۰۰ متری دو طبقه می‌سازم' }],
    );
    expect(events.some((e) => e.type === 'card' && e.card.kind === 'estimate')).toBe(true);
  });

  it('trimHistory caps message count and length (cost guard)', () => {
    const long = Array.from({ length: 30 }, (_, i) => ({ role: 'user' as const, text: `پیام ${i} `.repeat(200) }));
    const trimmed = trimHistory(long);
    expect(trimmed.length).toBe(CONSTANTS.AI_HISTORY_MAX_MESSAGES);
    for (const m of trimmed) expect((m.content as string).length).toBeLessThanOrEqual(CONSTANTS.AI_MESSAGE_MAX_CHARS);
  });

  it('chunkText reassembles exactly', () => {
    const s = 'سلام دنیا! '.repeat(20);
    expect(chunkText(s).join('')).toBe(s);
  });
});
