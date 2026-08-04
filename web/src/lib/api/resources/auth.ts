import { http } from '../http';
import { ApiError } from '../errors';
import { normalizeMobile } from '@/lib/utils/format';
import type { PublicUser } from '@/lib/auth/publicUser';

/**
 * Auth client — talks to the in-app route handlers (always real; auth isn't part of
 * the mock⇄live data switch). The server sets httpOnly session cookies; these calls
 * only carry/receive the public user. Errors surface as ApiError (Persian message).
 */
export const authApi = {
  /** Request an OTP. `name` is used to register a new account on first login.
   *  Deliberately says NOTHING about whether the number already has an account
   *  (W29): that was free user enumeration. Whether to ask for a name is
   *  decided from `verifyOtp`'s `isNew`, after a correct code. */
  async requestOtp(
    mobile: string,
    name?: string,
  ): Promise<{ ok: true; ttl: number; devCode?: string }> {
    const m = normalizeMobile(mobile);
    if (!m) throw new ApiError(400, 'شمارهٔ موبایل نامعتبر است.');
    return http.post('/api/auth/otp/request', { mobile: m, name });
  },

  /** Verify the code → sets session cookies; returns the user + whether new.
   *  `reg` carries the registration fields applied only when this OTP creates
   *  a new account (name required by the form before the code was requested). */
  async verifyOtp(
    mobile: string,
    code: string,
    reg?: { firstName?: string; lastName?: string; inviteCode?: string },
  ): Promise<{ user: PublicUser; isNew: boolean }> {
    const m = normalizeMobile(mobile) ?? mobile;
    return http.post('/api/auth/otp/verify', { mobile: m, code, ...reg });
  },

  /** Rotate the refresh token → new access token. */
  async refresh(): Promise<{ user: PublicUser }> {
    return http.post('/api/auth/refresh', {});
  },

  /** Revoke the session. */
  async logout(): Promise<{ ok: true }> {
    return http.post('/api/auth/logout', {});
  },

  /** Current user from the session cookie — `user: null` when anonymous.
   *  Anonymous is the site's NORMAL state (almost all traffic), so it is a
   *  200, not a 401: a 401 made every guest page view log a browser console
   *  error, which is both noise and a Lighthouse "best practices" failure. */
  async me(): Promise<{ user: PublicUser | null }> {
    return http.get('/api/me');
  },

  /** Update the signed-in user's name (first + last). */
  async updateProfile(firstName: string, lastName: string): Promise<{ user: PublicUser }> {
    return http.put('/api/me/profile', { firstName, lastName });
  },
};
