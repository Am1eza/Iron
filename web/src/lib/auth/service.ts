/**
 * Auth service — the OTP login/register + token lifecycle, wiring the OTP store,
 * user repo, JWT signer, refresh-token store, and SMS sender. Server-only.
 * All user-facing errors are Persian; nothing leaks codes/hashes/provider details.
 */
import { CONSTANTS } from '@/lib/config/constants';
import { hasDb } from '@/lib/server/db/client';
import { allowlistedRole } from '@/lib/server/repos/adminAllowlistRepo';
import type { AuthUser, IssuedTokens } from './types';
import { sha256, randomToken, randomOtp, timingSafeEqual, requiredSecret } from './crypto';
import { signAccessToken } from './jwt';
import { sendOtpSms } from './sms';
import {
  userByMobile,
  userById,
  createUser,
  setOtp,
  getOtp,
  clearOtp,
  incrementOtpAttempts,
  getRate,
  setRate,
  clearRate,
  saveRefresh,
  findRefresh,
  claimRefresh,
  revokeRefresh,
  revokeFamily,
} from './store';
import { reuseMode, reuseGraceMs } from './refreshPolicy';
import { reportError } from '@/lib/errors/report';

export class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    /** Seconds the client should wait (rate-limit / lockout). */
    public retryAfter?: number,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

const HOUR = 60 * 60 * 1000;
// Shares jwt.ts#getSecret's fail-in-production guard (via requiredSecret) —
// without it, a production deploy missing SESSION_SECRET would silently
// hash/verify OTPs against the hardcoded dev literal, making every OTP hash
// trivially offline-crackable from a DB dump rather than failing loudly.
const pepper = () => requiredSecret(process.env.SESSION_SECRET, 'dev-pepper');

/* ----------------------------- request OTP ----------------------------- */
export async function requestOtp(
  mobile: string,
  name?: string,
  /** True when the request came from the panel host — see the gate below. */
  panelOnly = false,
): Promise<{ ttl: number; devCode?: string; isNewUser: boolean }> {
  const now = Date.now();

  // Panel login is invitation-only: a number that isn't in the staff access
  // registry never receives a panel code. This is the real entry gate — the
  // permission layer would only reject a stranger AFTER a full login — and it
  // also stops anyone from burning SMS credit on the panel's login form.
  // Checked BEFORE any rate/OTP state is written, so a rejected stranger
  // leaves no trace and consumes no quota.
  if (panelOnly && hasDb()) {
    const granted = await allowlistedRole(mobile);
    if (!granted) {
      throw new AuthError(
        'not_staff',
        'این شماره اجازهٔ ورود به پنل را ندارد. برای دریافت دسترسی با مدیر سیستم تماس بگیرید.',
        403,
      );
    }
  }

  const rate = await getRate(mobile);

  if (rate.lockedUntil && rate.lockedUntil > now) {
    throw new AuthError(
      'locked',
      'به دلیل تلاش زیاد، چند دقیقه صبر کنید.',
      429,
      Math.ceil((rate.lockedUntil - now) / 1000),
    );
  }

  // Resend cooldown.
  const lastSend = rate.sends[rate.sends.length - 1];
  const cooldownMs = CONSTANTS.OTP_RESEND_COOLDOWN_SECONDS * 1000;
  if (lastSend && now - lastSend < cooldownMs) {
    throw new AuthError(
      'cooldown',
      'برای ارسال مجدد کمی صبر کنید.',
      429,
      Math.ceil((cooldownMs - (now - lastSend)) / 1000),
    );
  }

  // Max sends per hour.
  const recentSends = rate.sends.filter((t) => now - t < HOUR);
  if (recentSends.length >= CONSTANTS.OTP_MAX_RESEND_PER_HOUR) {
    throw new AuthError('too_many', 'تعداد درخواست‌ها زیاد است. بعداً تلاش کنید.', 429, 3600);
  }

  const code = randomOtp(CONSTANTS.OTP_LENGTH);
  const hash = await sha256(code, pepper());
  // Resend keeps the PREVIOUS still-unexpired code valid (its own original
  // expiry). SMS delivery to Iranian MVNOs measures ~5 minutes; without this,
  // every resend invalidates the code that then arrives, and a user on a slow
  // operator can never log in. Only the most recent previous code is kept
  // (window of 2), and the shared 5-attempt cap covers both.
  const existing = await getOtp(mobile);
  const prevStillValid = existing && existing.expiresAt > now;
  await setOtp(mobile, {
    hash,
    expiresAt: now + CONSTANTS.OTP_TTL_SECONDS * 1000,
    attempts: prevStillValid ? existing.attempts : 0,
    name,
    prevHash: prevStillValid ? existing.hash : undefined,
    prevExpiresAt: prevStillValid ? existing.expiresAt : undefined,
  });
  await setRate(mobile, { sends: [...recentSends, now], lockedUntil: rate.lockedUntil });

  const sms = await sendOtpSms(mobile, code);
  if (!sms.ok) throw new AuthError('sms_failed', 'ارسال پیامک ناموفق بود. دوباره تلاش کنید.', 502);

  // Lets the client only ask for a name on a genuinely new account instead
  // of every login (the LoginForm bug this exists for) — verifyOtp ignores
  // reg.firstName/lastName entirely for an existing user anyway, so this is
  // purely a "what should the UI ask for" signal, not a security boundary.
  const isNewUser = !(await userByMobile(mobile));

  return { ttl: CONSTANTS.OTP_TTL_SECONDS, devCode: sms.devCode, isNewUser };
}

/* ------------------------------ verify OTP ----------------------------- */
/** Registration fields applied only on FIRST login (account creation). The
 *  client holds these across the whole login flow, so they ride in on verify
 *  rather than needing extra columns on the OTP record. */
export interface RegistrationInput {
  firstName?: string;
  lastName?: string;
  inviteCode?: string;
}

export async function verifyOtp(
  mobile: string,
  code: string,
  reg?: RegistrationInput,
): Promise<{ user: AuthUser; tokens: IssuedTokens; isNew: boolean }> {
  // Claim an attempt atomically BEFORE checking the code — a plain
  // read-then-write (getOtp + setOtp) lets concurrent verify requests for the
  // same mobile all read the same `attempts` value and each independently
  // conclude they're still under the cap, so a burst of parallel guesses
  // could exceed OTP_MAX_ATTEMPTS before any single request's write lands.
  // incrementOtpAttempts is one atomic UPDATE...RETURNING that also returns
  // the record's hash/expiresAt/name, so this needs no separate getOtp call.
  const record = await incrementOtpAttempts(mobile);
  if (!record || record.expiresAt < Date.now()) {
    throw new AuthError('expired', 'کد منقضی شده. کد جدید بگیرید.', 410);
  }
  if (record.attempts > CONSTANTS.OTP_MAX_ATTEMPTS) {
    await clearOtp(mobile);
    await lock(mobile);
    throw new AuthError('locked', 'تلاش بیش از حد. چند دقیقه بعد دوباره وارد شوید.', 429);
  }

  const hash = await sha256(code, pepper());
  // Accept the current code OR the previous still-unexpired one (kept across
  // a resend — see requestOtp). Both share the same attempt counter, so the
  // brute-force budget is unchanged.
  const matchesCurrent = timingSafeEqual(hash, record.hash);
  const matchesPrev =
    !matchesCurrent &&
    !!record.prevHash &&
    (record.prevExpiresAt ?? 0) > Date.now() &&
    timingSafeEqual(hash, record.prevHash);
  if (!matchesCurrent && !matchesPrev) {
    const left = CONSTANTS.OTP_MAX_ATTEMPTS - record.attempts;
    throw new AuthError(
      'wrong_code',
      left > 0 ? 'کد اشتباه است. دوباره تلاش کنید.' : 'کد اشتباه است.',
      401,
    );
  }

  await clearOtp(mobile);
  // A successful login resets the send throttle for this number.
  await clearRate(mobile);

  // Login or register (first OTP for a new mobile creates the account).
  const existing = await userByMobile(mobile);
  const isNew = !existing;
  let user = existing;
  if (!user) {
    // Resolve an optional invite code to a referrer (no self-referral). Lazy
    // import keeps the service importable without the server-repo graph in
    // mock mode; resolveReferrer is a no-op there (no DB → no match).
    let referredBy: string | undefined;
    if (reg?.inviteCode?.trim()) {
      try {
        const { resolveReferrer } = await import('@/lib/server/repos/verificationRepo');
        referredBy = (await resolveReferrer(reg.inviteCode, mobile)) ?? undefined;
      } catch {
        /* invite is best-effort — never block registration on it */
      }
    }
    const firstName = reg?.firstName?.trim() || undefined;
    const lastName = reg?.lastName?.trim() || undefined;
    user = await createUser({
      mobile,
      name: [firstName, lastName].filter(Boolean).join(' ').trim() || record.name,
      firstName,
      lastName,
      referredBy,
    });
  }

  // Admin allowlist sync (both directions): an allowlisted mobile receives
  // the admin role on login; a mobile no longer listed loses it. Lazy import
  // keeps this service importable without the server-repo graph in mock mode.
  const { syncAdminRoleOnLogin } = await import('@/lib/server/repos/adminAllowlistRepo');
  user = await syncAdminRoleOnLogin(user);

  const tokens = await issueTokens(user);
  return { user, tokens, isNew };
}

/* ----------------------------- refresh flow ---------------------------- */
const invalidRefresh = () =>
  new AuthError('invalid_refresh', 'نشست نامعتبر است. دوباره وارد شوید.', 401);

/**
 * Rotate a refresh token, with token-family reuse detection (W29, area 2).
 *
 * ── The race this is designed around ──────────────────────────────────────
 * Middleware bounces an expired access cookie through /api/auth/silent, and
 * the browser can very easily fire that twice with the SAME refresh cookie —
 * two tabs restored together, a link prefetch alongside the click, a user
 * double-submitting. Neither request has seen the other's `Set-Cookie` yet, so
 * both legitimately present token T. A naive "T was already spent ⇒ theft"
 * rule reads that as an attack and kills the session of a real staff member —
 * the exact failure the audit warned about, and the one that costs an SMS.
 *
 * Three mechanisms, in order, make that safe:
 *
 *  1. The spend is ONE atomic conditional write (`claimRefresh`), not a
 *     read-then-write. Of N concurrent rotations of T exactly one is the
 *     claimer. Without this, two requests could both read T as unspent and
 *     both proceed — which would ALSO mean a genuine reuse could ride in
 *     alongside a legitimate rotation undetected.
 *  2. The losers of that claim are not errors. Inside a grace window
 *     (REFRESH_REUSE_GRACE_SECONDS, default 60s) a second presentation of a
 *     just-spent token is served normally: it mints a SIBLING token in the
 *     same family rather than re-rotating the parent. Two live siblings is
 *     fine — they belong to one browser, whichever `Set-Cookie` lands last
 *     wins, and the orphan simply expires. Re-issuing the identical token is
 *     not an option: only its hash is stored, by design.
 *  3. Only OUTSIDE that window is a spent token treated as reuse, and even
 *     then the revocation is gated behind REFRESH_REUSE_DETECTION, which
 *     defaults to report-only. See refreshPolicy.ts.
 *
 * A token that was never issued (or has expired, or was logged out) still
 * gets a plain 401 and touches nobody's family — an attacker must not be able
 * to log a user out by POSTing garbage.
 */
export async function rotateRefresh(
  refreshToken: string,
): Promise<{ user: AuthUser; tokens: IssuedTokens }> {
  const hash = await sha256(refreshToken, pepper());
  const now = Date.now();

  // Fast path: claim the token. Exactly one concurrent caller can win this.
  const claimed = await claimRefresh(hash, now);
  if (claimed) {
    const user = await userById(claimed.userId);
    if (!user) {
      await revokeRefresh(hash);
      throw invalidRefresh();
    }
    return { user, tokens: await issueTokens(user, familyOf(hash, claimed), hash) };
  }

  // Nothing to claim: unknown hash, expired, already spent, or logged out.
  const record = await findRefresh(hash);
  if (!record || record.rotatedAt === undefined) throw invalidRefresh();

  const spentAgo = now - record.rotatedAt;
  if (spentAgo <= reuseGraceMs()) {
    // Case 2 — the client racing itself. Mint a sibling; do not re-rotate the
    // parent (it is already spent) and do not report anything.
    const user = await userById(record.userId);
    if (!user) throw invalidRefresh();
    return { user, tokens: await issueTokens(user, familyOf(hash, record), hash) };
  }

  // Case 3 — a token spent long ago is being presented again. Either the
  // token leaked, or a client is holding a stale cookie far past its
  // rotation. Report it either way; act on it only when enforcing.
  const mode = reuseMode();
  const family = familyOf(hash, record);
  if (mode !== 'off') {
    reportError(new Error('refresh_token_reuse'), {
      scope: 'auth',
      fn: 'rotateRefresh',
      userId: record.userId,
      // Hashes, never the token itself — this goes to an error tracker.
      familyId: family,
      spentAgoMs: spentAgo,
      enforced: mode === 'enforce',
    });
  }
  if (mode === 'enforce') await revokeFamily(family);
  throw invalidRefresh();
}

/** The lineage a token belongs to. A row issued before the family columns
 *  existed has no `familyId`; it is its own root, named by its own hash. */
function familyOf(hash: string, record: { familyId?: string }): string {
  return record.familyId ?? hash;
}

/**
 * Logout revokes the whole family, not just the presented token. The grace
 * window above can leave a short-lived sibling alive; revoking one token
 * would leave that sibling as a working session the user believes they ended.
 */
export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  const hash = await sha256(refreshToken, pepper());
  const record = await findRefresh(hash);
  await revokeFamily(record ? familyOf(hash, record) : hash);
  await revokeRefresh(hash);
}

/* ------------------------------- helpers ------------------------------- */
/** `familyId`/`parentHash` are omitted only for a fresh login, which starts a
 *  new lineage named after the token it mints. */
async function issueTokens(
  user: AuthUser,
  familyId?: string,
  parentHash?: string,
): Promise<IssuedTokens> {
  const { token: accessToken, expiresAt: accessExpiresAt } = await signAccessToken(
    {
      sub: user.id,
      mobile: user.mobile,
      role: user.role,
      name: user.name,
      tv: user.tokenVersion ?? 0,
    },
    CONSTANTS.ACCESS_TTL_SECONDS,
  );
  const refreshToken = randomToken(32);
  const refreshExpiresAt = Date.now() + CONSTANTS.SESSION_TTL_DAYS * 24 * HOUR;
  const refreshHash = await sha256(refreshToken, pepper());
  await saveRefresh(refreshHash, {
    userId: user.id,
    expiresAt: refreshExpiresAt,
    // A login with no parent IS the root of its own family, so the root row
    // carries a familyId too and revokeFamily() sweeps it like any child.
    familyId: familyId ?? refreshHash,
    parentHash,
  });
  return { accessToken, accessExpiresAt, refreshToken, refreshExpiresAt };
}

async function lock(mobile: string) {
  const rate = await getRate(mobile);
  await setRate(mobile, { ...rate, lockedUntil: Date.now() + CONSTANTS.OTP_LOCK_MINUTES * 60 * 1000 });
}
