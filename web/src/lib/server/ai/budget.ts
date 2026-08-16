/**
 * Daily token budget for the AI relay (W29, audit area 29).
 *
 * `ai_usage` has recorded every completion's token counts since the feature
 * shipped and NOTHING has ever read it to enforce anything — the table was
 * reporting-only. Meanwhile /api/ai/chat's only guard is `limit: 10 /
 * 5min` per IP, i.e. 2880 requests a day from a single address, times however
 * many addresses. The relay sitting at HTTP 402 (credit exhausted) is exactly
 * the failure that an absent cap produces.
 *
 * Deliberately a TOKEN budget, not a request budget: cost is tokens, and one
 * tool-heavy conversation can spend more than a hundred greetings.
 *
 * The count is cached briefly. The budget is a spend guard, not an accounting
 * ledger — being up to a minute stale can overspend by at most a minute of
 * traffic, which is far cheaper than an aggregate query on every request.
 */
import { gte, sql } from 'drizzle-orm';
import { getDb, hasDb } from '@/lib/server/db/client';
import { aiUsage } from '@/lib/server/db/schema';

/** Generous enough that no honest day of traffic hits it, small enough that a
 *  scripted abuser cannot drain the account overnight. Tune with the real
 *  numbers from /admin's usage console once there are a few weeks of them. */
export const DEFAULT_DAILY_TOKEN_BUDGET = 400_000;

const CACHE_MS = 60_000;

export function dailyTokenBudget(env: Partial<NodeJS.ProcessEnv> = process.env): number {
  const text = env.AI_DAILY_TOKEN_BUDGET?.trim();
  // An EMPTY value means "unset", not zero. `.env.example` ships this key
  // commented out, but a blank `AI_DAILY_TOKEN_BUDGET=` is the natural typo —
  // and `Number('')` is 0, which would have switched the AI advisor off across
  // the whole site with no error anywhere.
  if (!text) return DEFAULT_DAILY_TOKEN_BUDGET;
  const raw = Number(text);
  // 0 IS a legitimate explicit value ("stop all AI spend"); a negative or
  // non-numeric one is a typo and must not silently disable the cap either.
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_DAILY_TOKEN_BUDGET;
  return Math.floor(raw);
}

let cache: { at: number; tokens: number } | null = null;

/** Prompt + completion tokens spent since local midnight. */
export async function tokensUsedToday(now = Date.now()): Promise<number> {
  if (cache && now - cache.at < CACHE_MS) return cache.tokens;
  const since = new Date(now);
  since.setHours(0, 0, 0, 0);
  const rows = await getDb()
    .select({
      // Cache-hit tokens are a SUBSET of prompt tokens (they are the cached
      // part of the same prompt), so adding them would double-count. They are
      // also the cheap ones — counting them against the budget would punish
      // the caching this app deliberately optimises for.
      total: sql<number>`coalesce(sum(${aiUsage.promptTokens} + ${aiUsage.completionTokens}), 0)::int`,
    })
    .from(aiUsage)
    .where(gte(aiUsage.createdAt, since));
  const tokens = rows[0]?.total ?? 0;
  cache = { at: now, tokens };
  return tokens;
}

/**
 * True when today's spend has reached the cap. Fails OPEN on a DB error: the
 * budget protects a bill, and taking the advisor down because one aggregate
 * query blipped would trade a small cost risk for a real outage. The relay's
 * own 402 is the backstop in that (already unlikely) case.
 */
export async function budgetExhausted(now = Date.now()): Promise<boolean> {
  const budget = dailyTokenBudget();
  if (budget === 0) return true;
  if (!hasDb()) return false;
  try {
    return (await tokensUsedToday(now)) >= budget;
  } catch {
    return false;
  }
}

/** Test-only — the cache is module-level by design. */
export function resetBudgetCache(): void {
  cache = null;
}
