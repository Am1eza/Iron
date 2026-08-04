// @vitest-environment node
/**
 * Daily AI token budget + upstream-refusal state (W29, audit area 29).
 *
 * The two together are what stops the relay's HTTP 402 from being a
 * user-visible error on every request: the budget prevents reaching it, and
 * the upstream state means the first 402 is the only round trip spent on it.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { ulid } from 'ulid';
import { createTestDb } from '@/test/db';
import { getDb } from '@/lib/server/db/client';
import { aiUsage } from '@/lib/server/db/schema';
import { budgetExhausted, dailyTokenBudget, tokensUsedToday, resetBudgetCache, DEFAULT_DAILY_TOKEN_BUDGET } from './budget';
import {
  noteUpstreamFailure,
  noteUpstreamOk,
  upstreamUnavailable,
  reasonForStatus,
  isPermanentReason,
  resetUpstreamState,
} from './upstreamState';

let close: () => Promise<void>;

async function spend(promptTokens: number, completionTokens = 0, createdAt = new Date()) {
  await getDb().insert(aiUsage).values({ id: ulid(), promptTokens, completionTokens, createdAt });
  resetBudgetCache();
}

beforeAll(async () => {
  ({ close } = await createTestDb());
});
afterAll(async () => {
  await close();
});
beforeEach(async () => {
  resetBudgetCache();
  resetUpstreamState();
  delete process.env.AI_DAILY_TOKEN_BUDGET;
  await getDb().delete(aiUsage);
});
afterEach(() => {
  delete process.env.AI_DAILY_TOKEN_BUDGET;
});

describe('dailyTokenBudget', () => {
  it('defaults when unset', () => {
    expect(dailyTokenBudget({})).toBe(DEFAULT_DAILY_TOKEN_BUDGET);
  });

  it('reads the env value', () => {
    expect(dailyTokenBudget({ AI_DAILY_TOKEN_BUDGET: '1234' })).toBe(1234);
  });

  it('treats 0 as a real value — "spend nothing", not "no cap"', () => {
    expect(dailyTokenBudget({ AI_DAILY_TOKEN_BUDGET: '0' })).toBe(0);
  });

  it('a typo falls back to the default rather than silently disabling the cap', () => {
    for (const raw of ['', 'lots', '-1', 'NaN']) {
      expect(dailyTokenBudget({ AI_DAILY_TOKEN_BUDGET: raw })).toBe(DEFAULT_DAILY_TOKEN_BUDGET);
    }
  });
});

describe('tokensUsedToday', () => {
  it('sums prompt + completion tokens', async () => {
    await spend(100, 50);
    await spend(10, 5);
    expect(await tokensUsedToday()).toBe(165);
  });

  it('ignores yesterday', async () => {
    const yesterday = new Date(Date.now() - 36 * 60 * 60 * 1000);
    await spend(9_000, 9_000, yesterday);
    await spend(1, 1);
    expect(await tokensUsedToday()).toBe(2);
  });
});

describe('budgetExhausted', () => {
  it('is false under the cap and true at or over it', async () => {
    process.env.AI_DAILY_TOKEN_BUDGET = '1000';
    await spend(400, 400);
    expect(await budgetExhausted()).toBe(false);

    await spend(200, 0);
    expect(await budgetExhausted()).toBe(true);
  });

  it('a budget of 0 stops all spend immediately', async () => {
    process.env.AI_DAILY_TOKEN_BUDGET = '0';
    expect(await budgetExhausted()).toBe(true);
  });

  it('the cap is per DAY — yesterday cannot exhaust today', async () => {
    process.env.AI_DAILY_TOKEN_BUDGET = '100';
    await spend(5_000, 5_000, new Date(Date.now() - 36 * 60 * 60 * 1000));
    expect(await budgetExhausted()).toBe(false);
  });
});

describe('upstream refusal state', () => {
  it('classifies the statuses that matter', () => {
    expect(reasonForStatus(402)).toBe('credit');
    expect(reasonForStatus(401)).toBe('auth');
    expect(reasonForStatus(403)).toBe('auth');
    expect(reasonForStatus(429)).toBe('rate_limit');
    expect(reasonForStatus(500)).toBe('upstream');
    expect(reasonForStatus(undefined)).toBe('upstream');
  });

  it('credit and auth are permanent — no retry can fix them', () => {
    expect(isPermanentReason('credit')).toBe(true);
    expect(isPermanentReason('auth')).toBe(true);
    expect(isPermanentReason('rate_limit')).toBe(false);
    expect(isPermanentReason('upstream')).toBe(false);
  });

  it('reports ONCE per state transition, not once per request', () => {
    // This is the whole point: 1,932 of 1,939 production issues were
    // per-request duplicates of the same condition.
    expect(noteUpstreamFailure('credit')).toBe(true);
    for (let i = 0; i < 500; i++) expect(noteUpstreamFailure('credit')).toBe(false);
  });

  it('a CHANGE of reason is a new transition and is reported', () => {
    expect(noteUpstreamFailure('credit')).toBe(true);
    expect(noteUpstreamFailure('rate_limit')).toBe(true);
    expect(noteUpstreamFailure('rate_limit')).toBe(false);
  });

  it('short-circuits subsequent requests while the refusal is live', () => {
    expect(upstreamUnavailable()).toBeNull();
    noteUpstreamFailure('credit');
    expect(upstreamUnavailable()).toBe('credit');
  });

  it('a transient refusal cools down on its own; a credit one holds much longer', () => {
    const t0 = Date.now();
    noteUpstreamFailure('rate_limit', t0);
    expect(upstreamUnavailable(t0 + 61_000)).toBeNull();

    resetUpstreamState();
    noteUpstreamFailure('credit', t0);
    expect(upstreamUnavailable(t0 + 61_000)).toBe('credit');
    expect(upstreamUnavailable(t0 + 11 * 60_000)).toBeNull();
  });

  it('a success clears it immediately — recovery must not wait out the cooldown', () => {
    noteUpstreamFailure('credit');
    noteUpstreamOk();
    expect(upstreamUnavailable()).toBeNull();
    // …and the next failure is a fresh transition, so a top-up followed by a
    // relapse is reported rather than swallowed.
    expect(noteUpstreamFailure('credit')).toBe(true);
  });
});
