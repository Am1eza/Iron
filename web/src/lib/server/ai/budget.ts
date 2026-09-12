/**
 * Daily token budget for the AI relay (W29, audit area 29; hardened J-235/236/237).
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
 * ── The race this is designed around (J-235/237) ──────────────────────────
 * A pre-flight check against a SUM of completed requests is inherently
 * TOCTOU: the real cost of a request is only known AFTER it finishes, so N
 * concurrent requests can all read "under budget" and all proceed. Cached for
 * 60s and per-process besides, the original version raced across both time
 * and workers. `reserveBudget()` closes this the same way `claimOtpSend` (in
 * auth/store.pg.ts) closes the identical shape of problem for OTP sends: an
 * advisory lock serializes every reservation attempt for the same day, so the
 * "sum real usage + live reservations, then admit one more" decision is
 * atomic instead of racy. The reservation itself is a conservative worst-case
 * ceiling, ages out of the sum on its own if the request never completes
 * (crash, deploy, hung upstream), and is deleted once real usage is recorded.
 *
 * ── Timezone (J-236) ───────────────────────────────────────────────────────
 * "Daily" is the Tehran Jalali day everywhere else in this app (pricing
 * staleness, quote validity) — this budget used Node's local/UTC midnight,
 * ~3.5h off from Tehran with no `TZ` set in the Docker deploy.
 */
import { and, eq, gt, gte, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb, hasDb } from '@/lib/server/db/client';
import { aiUsage, aiBudgetReservations } from '@/lib/server/db/schema';
import { jalaliDayKey, startOfTehranDay } from '@/lib/server/utils/jalali';

/** Generous enough that no honest day of traffic hits it, small enough that a
 *  scripted abuser cannot drain the account overnight. Tune with the real
 *  numbers from /admin's usage console once there are a few weeks of them. */
export const DEFAULT_DAILY_TOKEN_BUDGET = 400_000;

const CACHE_MS = 60_000;

/** Conservative worst-case tokens for ONE request (prompt history + tool
 *  round-trips + the relay's own `max_tokens: 2000` completion cap) — the
 *  ceiling reserved before the real cost is known. Overstating this only
 *  under-utilizes the budget slightly; understating it is what would let the
 *  race back in. */
const RESERVATION_CEILING = 6_000;

/** A reservation older than this is either a genuinely abandoned request
 *  (crash, deploy) or one that ran past AI_TIMEOUT_MS anyway — either way it
 *  should stop counting against the live budget. Comfortably above the
 *  relay's own timeout (45s default) plus its fallback-retry leg. */
const RESERVATION_TTL_MS = 5 * 60_000;

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

/** Prompt + completion tokens spent since Tehran midnight — REPORTING only
 *  (the admin usage console). `reserveBudget()` below re-reads this fresh,
 *  inside its own locked transaction, for the actual spend decision; this
 *  cached version must never be used to gate anything. */
export async function tokensUsedToday(now = Date.now()): Promise<number> {
  if (cache && now - cache.at < CACHE_MS) return cache.tokens;
  const since = startOfTehranDay(new Date(now));
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

export type BudgetReservation = { ok: true; reservationId: string } | { ok: false };

/**
 * Atomically reserve `RESERVATION_CEILING` tokens against today's (Tehran)
 * budget, or refuse if that would exceed the cap. Call BEFORE the upstream
 * request starts; release with `releaseBudgetReservation` once real usage is
 * recorded (success, failure, or abort — always).
 *
 * Fails OPEN on a DB error, same tradeoff `budgetExhausted` documented: the
 * budget protects a bill, and taking the advisor down because one query
 * blipped would trade a small cost risk for a real outage. The relay's own
 * 402 is the backstop in that (already unlikely) case.
 */
export async function reserveBudget(now = Date.now()): Promise<BudgetReservation> {
  const budget = dailyTokenBudget();
  if (budget === 0) return { ok: false };
  if (!hasDb()) return { ok: true, reservationId: '' };
  const day = jalaliDayKey(new Date(now));
  const since = startOfTehranDay(new Date(now));
  try {
    return await getDb().transaction(async (tx) => {
      // Serializes every reservation attempt for THIS Tehran day across every
      // worker/connection — the lock is released automatically at commit.
      // hashtext() collapses the day string to a stable 32-bit lock key.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${day}))`);

      const usedRows = await tx
        .select({ total: sql<number>`coalesce(sum(${aiUsage.promptTokens} + ${aiUsage.completionTokens}), 0)::int` })
        .from(aiUsage)
        .where(gte(aiUsage.createdAt, since));
      const used = usedRows[0]?.total ?? 0;

      const reservedRows = await tx
        .select({ total: sql<number>`coalesce(sum(${aiBudgetReservations.tokens}), 0)::int` })
        .from(aiBudgetReservations)
        .where(
          and(
            eq(aiBudgetReservations.day, day),
            gt(aiBudgetReservations.createdAt, new Date(now - RESERVATION_TTL_MS)),
          ),
        );
      const reserved = reservedRows[0]?.total ?? 0;

      if (used + reserved + RESERVATION_CEILING > budget) return { ok: false } as const;

      const id = ulid();
      await tx.insert(aiBudgetReservations).values({ id, day, tokens: RESERVATION_CEILING, createdAt: new Date(now) });
      return { ok: true, reservationId: id } as const;
    });
  } catch {
    return { ok: true, reservationId: '' };
  }
}

/** Always call once the request is done, on every exit path (success,
 *  failure, abort) — best-effort; a failed release just lets the reservation
 *  age out of the sum on its own after RESERVATION_TTL_MS. */
export async function releaseBudgetReservation(reservationId: string): Promise<void> {
  if (!reservationId || !hasDb()) return;
  try {
    await getDb().delete(aiBudgetReservations).where(eq(aiBudgetReservations.id, reservationId));
  } catch {
    /* best-effort — see doc comment above */
  }
}

/**
 * True when today's spend has reached the cap. Reporting/back-compat only —
 * the real request path uses `reserveBudget()`, which is race-free; this
 * stays for callers that only need a point-in-time read (e.g. status
 * displays), not a spend decision.
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
