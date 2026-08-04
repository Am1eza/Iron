/**
 * Refresh-token reuse policy (W29, audit area 2) — read from env on every
 * call, never captured at module load, so a test (and a container restart)
 * can change it without a rebuild.
 *
 * ── Why this is a flag and not just "on" ──────────────────────────────────
 * The revocation path is the single most dangerous code in this repo: a false
 * positive logs a real staff member out and costs an OTP SMS to recover, and
 * that has already happened once here for an unrelated reason. So the
 * MECHANISM (families, `rotatedAt`, the grace window) ships unconditionally
 * and is exercised on every rotation, but the ACTION defaults to reporting
 * only. Enforcement is a one-word env change once the owner has seen a week
 * of logs with zero `refresh_token_reuse` reports.
 *
 *   REFRESH_REUSE_DETECTION=detect   (default) report the reuse, kill nothing.
 *                                    Externally IDENTICAL to the old
 *                                    behaviour: the caller still gets 401.
 *   REFRESH_REUSE_DETECTION=enforce  additionally revoke the whole family, so
 *                                    a victim's re-login evicts the thief.
 *   REFRESH_REUSE_DETECTION=off      no report either (escape hatch if the
 *                                    reports ever become noise).
 */
export type ReuseMode = 'off' | 'detect' | 'enforce';

export function reuseMode(env: Partial<NodeJS.ProcessEnv> = process.env): ReuseMode {
  const raw = env.REFRESH_REUSE_DETECTION?.trim().toLowerCase();
  return raw === 'enforce' || raw === 'off' ? raw : 'detect';
}

/** Default grace window, seconds. See `reuseGraceMs` for the reasoning. */
export const DEFAULT_REUSE_GRACE_SECONDS = 60;

/**
 * How long after a token was legitimately spent a SECOND presentation of it
 * is still treated as the same client racing itself rather than as theft.
 *
 * This window is the entire safety margin for the concurrent-refresh race:
 * two tabs (or a navigation plus a prefetch) both bounce through
 * /api/auth/silent with the same cookie, because neither has seen the other's
 * `Set-Cookie` yet. The loser of the atomic claim lands here. 60s is far
 * beyond any plausible in-flight overlap, while still being short enough that
 * a stolen token is essentially always used outside it — a thief has no way
 * to know the victim's refresh happened, let alone land inside a one-minute
 * window of it.
 */
export function reuseGraceMs(env: Partial<NodeJS.ProcessEnv> = process.env): number {
  const raw = Number(env.REFRESH_REUSE_GRACE_SECONDS);
  const seconds = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_REUSE_GRACE_SECONDS;
  return seconds * 1000;
}
