/**
 * Conversation memory — the part that stops the advisor asking a buyer the
 * same question three times.
 *
 * The two functions worth pinning hardest are the extractors, because they are
 * the ones a wrong answer escapes from silently: a city here becomes a road
 * distance, then a freight figure, then a Toman total on a card the customer
 * reads as a quote. Getting «تهران» when they said «اصفهان» is not a cosmetic
 * bug.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Redis is the shared path in production and simply absent in tests; stubbing
// it here keeps these unit tests about the merge/extraction logic rather than
// about a cache client. The in-process Map is the real fallback the Docker
// deploy relies on anyway (one long-lived Node process).
vi.mock('@/lib/server/redis', () => ({
  cacheGetJson: vi.fn(async () => null),
  cacheSetJson: vi.fn(async () => undefined),
}));

import { detectCity, detectTonnage, getMemory, memoryFact, rememberFacts } from './memory';

const user = (content: string) => ({ role: 'user', content });
const bot = (content: string) => ({ role: 'assistant', content });

describe('detectCity', () => {
  it('finds a city the freight table actually knows', () => {
    expect(detectCity([user('۲۰ تن میلگرد می‌خوام تحویل مشهد')])).toBe('مشهد');
  });

  it('takes the LATEST one, so a correction wins', () => {
    // A first-match scan would pin the visitor's mistake for the whole chat.
    expect(
      detectCity([user('تحویل تهران'), bot('باشه'), user('ببخشید، اصفهان درست است')]),
    ).toBe('اصفهان');
  });

  it('ignores a city we cannot price', () => {
    // Not in CITIES ⇒ no road distance ⇒ no honest freight figure. A city we
    // cannot price is worse than no city.
    expect(detectCity([user('تحویل در زابل')])).toBeUndefined();
  });

  it('never reads a city out of the ADVISOR’s own words', () => {
    // The advisor says «انبار شادآباد تهران» constantly; treating that as the
    // customer's delivery city would price every order to Tehran.
    expect(detectCity([bot('همهٔ بارها از انبار شادآباد تهران ارسال می‌شود')])).toBeUndefined();
  });

  it('prefers the longer name when two overlap', () => {
    expect(
      detectCity([user('تحویل بندرعباس')], [{ name: 'بندرعباس' }, { name: 'عباس' }]),
    ).toBe('بندرعباس');
  });
});

describe('detectTonnage', () => {
  it('reads Persian digits, which is how people actually type', () => {
    expect(detectTonnage([user('۲۰ تن میلگرد')])).toBe(20);
  });

  it('takes the latest figure', () => {
    expect(detectTonnage([user('۵ تن'), bot('باشه'), user('نه، ۱۲ تن')])).toBe(12);
  });

  it('accepts a decimal tonnage', () => {
    expect(detectTonnage([user('۲.۵ تن ورق')])).toBe(2.5);
  });

  it('ignores a number that is not a tonnage', () => {
    expect(detectTonnage([user('میلگرد ۱۴ چند؟')])).toBeUndefined();
  });
});

describe('rememberFacts', () => {
  beforeEach(async () => {
    // Each test uses its own conversation id, so the module-level Map cannot
    // leak state between them.
  });

  it('merges rather than replaces — a later turn cannot erase an earlier fact', async () => {
    const id = `conv-merge-${Math.random()}`;
    await rememberFacts(id, { city: 'مشهد' });
    await rememberFacts(id, { size: '۱۴' });
    const mem = await getMemory(id);
    // This IS the "don't make me repeat myself" bug, as a unit test.
    expect(mem?.city).toBe('مشهد');
    expect(mem?.size).toBe('۱۴');
  });

  it('lets a new value overwrite an old one', async () => {
    const id = `conv-over-${Math.random()}`;
    await rememberFacts(id, { city: 'تهران' });
    await rememberFacts(id, { city: 'اصفهان' });
    expect((await getMemory(id))?.city).toBe('اصفهان');
  });

  it('distinguishes "not mentioned" from "cleared"', async () => {
    const id = `conv-clear-${Math.random()}`;
    await rememberFacts(id, { city: 'تهران', size: '۱۴' });
    await rememberFacts(id, { size: undefined }); // this turn said nothing about size
    expect((await getMemory(id))?.size).toBe('۱۴');
    await rememberFacts(id, { size: null }); // …and this one withdrew it
    expect((await getMemory(id))?.size).toBeUndefined();
  });

  it('is a no-op without a conversation id, rather than throwing', async () => {
    expect(await rememberFacts(undefined, { city: 'تهران' })).toBeNull();
    expect(await getMemory(undefined)).toBeNull();
  });
});

describe('memoryFact', () => {
  it('says nothing when nothing has been established', () => {
    expect(memoryFact(null)).toBeNull();
    expect(memoryFact({ updatedAt: Date.now() })).toBeNull();
  });

  it('tells the model what to DO with the facts, not just what they are', async () => {
    // Stating them alone was not enough in practice: the model would read
    // «شهر تحویل: مشهد» and still open with «شهر تحویل را بگو».
    const line = memoryFact({ city: 'مشهد', size: '۱۴', updatedAt: Date.now() })!;
    expect(line).toContain('مشهد');
    expect(line).toContain('۱۴');
    expect(line).toContain('دوباره از کاربر نپرس');
  });

  it('names the specific product once one is pinned, instead of its category', () => {
    const line = memoryFact({
      category: 'میلگرد',
      sub: 'آجدار',
      product: 'میلگرد ۱۴ آجدار ذوب‌آهن',
      updatedAt: Date.now(),
    })!;
    expect(line).toContain('میلگرد ۱۴ آجدار ذوب‌آهن');
    // The broader category is redundant once the exact row is known, and
    // repeating both invites the model to re-open a settled question.
    expect(line).not.toContain('دستهٔ محصول');
  });

  it('carries no price and no identity — it is context, never a number source', () => {
    const line = memoryFact({
      product: 'میلگرد ۱۴',
      city: 'مشهد',
      tonnage: 20,
      updatedAt: Date.now(),
    })!;
    expect(line).not.toMatch(/تومان/);
    expect(line).not.toMatch(/09\d|۰۹/);
  });
});
