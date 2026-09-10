/**
 * Auth service — the OTP login/register + token lifecycle, wiring the OTP store,
 * user repo, JWT signer, refresh-token store, and SMS sender. Server-only.
 * All user-facing errors are Persian; nothing leaks codes/hashes/provider details.
 */
import { CONSTANTS } from '@/lib/config/constants';
import { isObviouslyFakeMobile } from '@/lib/utils/format';
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
  consumeOtp,
  incrementOtpAttempts,
  lockAndClearOtp,
  claimOtpSend,
  clearRate,
  saveRefresh,
  findRefresh,
  rotateRefreshAtomic,
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
const otpPepper = () => requiredSecret(process.env.OTP_SECRET, 'dev-otp-pepper-change-me-0000000000');
const sessionPepper = () => requiredSecret(process.env.SESSION_SECRET, 'dev-pepper');
const sessionPeppers = () => [sessionPepper(), ...(process.env.SESSION_SECRET_PREVIOUS
  ? [requiredSecret(process.env.SESSION_SECRET_PREVIOUS, '')] : [])];
const otpDigest = (mobile: string, code: string) => sha256(`${mobile}:${code}`, otpPepper());

/* ----------------------------- request OTP ----------------------------- */
export async function requestOtp(
  mobile: string,
  name?: string,
  /** True when the request came from the panel host — see the gate below. */
  panelOnly = false,
  combinedRateKey?: string,
): Promise<{ ttl: number; devCode?: string }> {
  // F-134: a structurally-impossible number (all-same or fully sequential
  // digits — never a real subscriber assignment) is rejected before it can
  // burn a resend/hourly quota slot or an SMS credit on a number that was
  // never going to receive it. See isObviouslyFakeMobile's doc comment for
  // why this stops at that narrow check rather than a hardcoded carrier map.
  if (isObviouslyFakeMobile(mobile)) {
    throw new AuthError('invalid_mobile', 'این شماره موبایل معتبر نیست.', 400);
  }

  const now = Date.now();

  const cooldownMs = CONSTANTS.OTP_RESEND_COOLDOWN_SECONDS * 1000;
  const claim=await claimOtpSend(mobile,now,cooldownMs,HOUR,CONSTANTS.OTP_MAX_RESEND_PER_HOUR,combinedRateKey);
  if(!claim.ok) throw new AuthError(claim.reason,claim.reason==='locked'?'به دلیل تلاش زیاد، چند دقیقه صبر کنید.':claim.reason==='cooldown'?'برای ارسال مجدد کمی صبر کنید.':'تعداد درخواست‌ها زیاد است. بعداً تلاش کنید.',429,claim.retryAfter);

  // Panel login is invitation-only: a number that isn't in the staff access
  // registry never receives a panel code. This is the real entry gate — the
  // permission layer would only reject a stranger AFTER a full login — and it
  // also stops anyone from burning SMS credit on the panel's login form.
  //
  // W29 (audit area 2): this used to run BEFORE any rate/OTP state was
  // written, which made the distinct `403 not_staff` (vs `200`) a free,
  // unlimited, trace-free oracle for "is this number staff?" on
  // panel.ahantime.com. The 403 itself is a deliberate UX choice — a staff
  // member who mistypes their number is told so instead of waiting for an SMS
  // that will never arrive — so it is kept, but probing is now neither free
  // nor silent: the attempt is charged to the per-mobile hourly budget before
  // the throw, and it is reported. Charging is cheap for the honest case: the
  // budget is per MOBILE, so what a mistyping staff member burns is the quota
  // of the wrong number they typed, never their own.
  if (panelOnly && hasDb()) {
    const granted = await allowlistedRole(mobile);
    if (!granted) {
      reportError(new Error('panel_otp_not_staff'), {
        scope: 'auth',
        fn: 'requestOtp',
        // `mobile` is redacted by name in lib/errors/report.ts — the report
        // says a probe happened and how many, never who was probed.
        mobile,
        recentAttempts: 'charged',
      });
      throw new AuthError(
        'not_staff',
        'این شماره اجازهٔ ورود به پنل را ندارد. برای دریافت دسترسی با مدیر سیستم تماس بگیرید.',
        403,
      );
    }
  }

  const code = randomOtp(CONSTANTS.OTP_LENGTH);
  const hash = await otpDigest(mobile, code);
  const existing = await getOtp(mobile);
  await setOtp(mobile, {
    hash,
    expiresAt: now + CONSTANTS.OTP_TTL_SECONDS * 1000,
    attempts: existing && existing.expiresAt > now ? existing.attempts : 0,
    name,
  });

  const sms = await sendOtpSms(mobile, code);
  if (!sms.ok) throw new AuthError('sms_failed', 'ارسال پیامک ناموفق بود. دوباره تلاش کنید.', 502);

  // W29 (audit area 2): `isNewUser` used to be returned here so the login form
  // could ask a new account for a name without pestering returning users. It
  // was also a plain user-enumeration oracle on the PUBLIC site — anyone could
  // learn whether a phone number has an account here, with no login and no
  // proof of anything. The UI need is now met from the VERIFY response's
  // `isNew`, which costs a correct one-time code to obtain: the form collects
  // the name after the code is verified, not before. Do not add it back.
  return { ttl: CONSTANTS.OTP_TTL_SECONDS, devCode: sms.devCode };
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
    // F-130: retiring the challenge and setting the resend lockout must be one
    // atomic transition — see lockAndClearOtp's doc comment in store.types.ts.
    await lockAndClearOtp(mobile, Date.now() + CONSTANTS.OTP_LOCK_MINUTES * 60 * 1000);
    throw new AuthError('locked', 'تلاش بیش از حد. چند دقیقه بعد دوباره وارد شوید.', 429);
  }

  const hash = await otpDigest(mobile, code);
  const matchesCurrent = timingSafeEqual(hash, record.hash);
  if (!matchesCurrent) {
    const left = CONSTANTS.OTP_MAX_ATTEMPTS - record.attempts;
    throw new AuthError(
      'wrong_code',
      left > 0 ? 'کد اشتباه است. دوباره تلاش کنید.' : 'کد اشتباه است.',
      401,
    );
  }

  if (!await consumeOtp(mobile, record.hash, record.expiresAt)) {
    throw new AuthError('expired', 'کد مصرف شده یا تغییر کرده است. دوباره تلاش کنید.', 410);
  }
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
  const hashes = await Promise.all(sessionPeppers().map((pepper) => sha256(refreshToken, pepper)));
  const now = Date.now();

  const mode = reuseMode();
  const refreshTokenNext=randomToken(32);
  const refreshHash=await sha256(refreshTokenNext,sessionPepper());
  const refreshExpiresAt=now+CONSTANTS.SESSION_TTL_DAYS*24*HOUR;
  let hash=hashes[0]!;
  let rotation=await rotateRefreshAtomic(hash,refreshHash,{userId:'',expiresAt:refreshExpiresAt},now,reuseGraceMs(),mode==='enforce');
  for(let i=1;rotation.status==='invalid'&&i<hashes.length;i++){hash=hashes[i]!;rotation=await rotateRefreshAtomic(hash,refreshHash,{userId:'',expiresAt:refreshExpiresAt},now,reuseGraceMs(),mode==='enforce');}
  if(rotation.status==='invalid')throw invalidRefresh();
  if(rotation.status==='reuse') {
   if (mode !== 'off') {
    reportError(new Error('refresh_token_reuse'), {
      scope: 'auth',
      fn: 'rotateRefresh',
      userId: rotation.record.userId,
      enforced: mode === 'enforce',
    });
   }
   throw invalidRefresh();
  }
  if (!('record' in rotation)) throw invalidRefresh();
  const record=rotation.record;
  const user=await userById(record.userId);
  if(!user){await revokeFamily(familyOf(hash,record));throw invalidRefresh();}
  const absoluteExpiry=Math.min(record.expiresAt,refreshExpiresAt);
  const {token:accessToken,expiresAt:accessExpiresAt}=await signAccessToken({sub:user.id,mobile:user.mobile,role:user.role,name:user.name,tv:user.tokenVersion??0},CONSTANTS.ACCESS_TTL_SECONDS);
  return {user,tokens:{accessToken,accessExpiresAt,refreshToken:refreshTokenNext,refreshExpiresAt:absoluteExpiry}};
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
  for(const pepper of sessionPeppers()){
    const hash=await sha256(refreshToken,pepper);const record=await findRefresh(hash);
    await revokeFamily(record?familyOf(hash,record):hash);await revokeRefresh(hash);
  }
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
  const refreshHash = await sha256(refreshToken, sessionPepper());
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
