/**
 * Auth service — the OTP login/register + token lifecycle, wiring the OTP store,
 * user repo, JWT signer, refresh-token store, and SMS sender. Server-only.
 * All user-facing errors are Persian; nothing leaks codes/hashes/provider details.
 */
import { CONSTANTS } from '@/lib/config/constants';
import type { AuthUser, IssuedTokens } from './types';
import { sha256, randomToken, randomOtp, timingSafeEqual } from './crypto';
import { signAccessToken } from './jwt';
import { sendOtpSms } from './sms';
import {
  userByMobile,
  userById,
  createUser,
  getOtp,
  setOtp,
  clearOtp,
  getRate,
  setRate,
  saveRefresh,
  findRefresh,
  revokeRefresh,
} from './store';

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
const pepper = () => process.env.SESSION_SECRET ?? 'dev-pepper';

/* ----------------------------- request OTP ----------------------------- */
export async function requestOtp(
  mobile: string,
  name?: string,
): Promise<{ ttl: number; devCode?: string }> {
  const now = Date.now();
  const rate = getRate(mobile);

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
  setOtp(mobile, {
    hash,
    expiresAt: now + CONSTANTS.OTP_TTL_SECONDS * 1000,
    attempts: 0,
    name,
  });
  setRate(mobile, { sends: [...recentSends, now], lockedUntil: rate.lockedUntil });

  const sms = await sendOtpSms(mobile, code);
  if (!sms.ok) throw new AuthError('sms_failed', 'ارسال پیامک ناموفق بود. دوباره تلاش کنید.', 502);

  return { ttl: CONSTANTS.OTP_TTL_SECONDS, devCode: sms.devCode };
}

/* ------------------------------ verify OTP ----------------------------- */
export async function verifyOtp(
  mobile: string,
  code: string,
): Promise<{ user: AuthUser; tokens: IssuedTokens; isNew: boolean }> {
  const record = getOtp(mobile);
  if (!record || record.expiresAt < Date.now()) {
    throw new AuthError('expired', 'کد منقضی شده. کد جدید بگیرید.', 410);
  }
  if (record.attempts >= CONSTANTS.OTP_MAX_ATTEMPTS) {
    clearOtp(mobile);
    lock(mobile);
    throw new AuthError('locked', 'تلاش بیش از حد. چند دقیقه بعد دوباره وارد شوید.', 429);
  }

  const hash = await sha256(code, pepper());
  if (!timingSafeEqual(hash, record.hash)) {
    setOtp(mobile, { ...record, attempts: record.attempts + 1 });
    const left = CONSTANTS.OTP_MAX_ATTEMPTS - (record.attempts + 1);
    throw new AuthError(
      'wrong_code',
      left > 0 ? 'کد اشتباه است. دوباره تلاش کنید.' : 'کد اشتباه است.',
      401,
    );
  }

  clearOtp(mobile);
  // Successful verification consumes the pending code, so the resend cooldown
  // no longer protects anything — clear it so an immediate re-login works.
  setRate(mobile, { sends: [], lockedUntil: undefined });

  // Login or register (first OTP for a new mobile creates the account).
  const existing = userByMobile(mobile);
  const isNew = !existing;
  const user = existing ?? createUser({ mobile, name: record.name });

  const tokens = await issueTokens(user);
  return { user, tokens, isNew };
}

/* ----------------------------- refresh flow ---------------------------- */
export async function rotateRefresh(
  refreshToken: string,
): Promise<{ user: AuthUser; tokens: IssuedTokens }> {
  const hash = await sha256(refreshToken, pepper());
  const record = findRefresh(hash);
  if (!record) throw new AuthError('invalid_refresh', 'نشست نامعتبر است. دوباره وارد شوید.', 401);

  const user = userById(record.userId);
  if (!user) {
    revokeRefresh(hash);
    throw new AuthError('invalid_refresh', 'نشست نامعتبر است. دوباره وارد شوید.', 401);
  }

  // Rotate: the old refresh token is single-use.
  revokeRefresh(hash);
  const tokens = await issueTokens(user);
  return { user, tokens };
}

export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  const hash = await sha256(refreshToken, pepper());
  revokeRefresh(hash);
}

/* ------------------------------- helpers ------------------------------- */
async function issueTokens(user: AuthUser): Promise<IssuedTokens> {
  const { token: accessToken, expiresAt: accessExpiresAt } = await signAccessToken({
    sub: user.id,
    mobile: user.mobile,
    role: user.role,
    name: user.name,
  });
  const refreshToken = randomToken(32);
  const refreshExpiresAt = Date.now() + CONSTANTS.SESSION_TTL_DAYS * 24 * HOUR;
  const refreshHash = await sha256(refreshToken, pepper());
  saveRefresh(refreshHash, { userId: user.id, expiresAt: refreshExpiresAt });
  return { accessToken, accessExpiresAt, refreshToken, refreshExpiresAt };
}

function lock(mobile: string) {
  const rate = getRate(mobile);
  setRate(mobile, { ...rate, lockedUntil: Date.now() + CONSTANTS.OTP_LOCK_MINUTES * 60 * 1000 });
}
