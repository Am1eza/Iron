import { API_MODE } from '../config';
import { http } from '../http';
import { ApiError } from '../errors';
import { normalizeDigits, normalizeMobile } from '@/lib/utils/format';
import { CONSTANTS } from '@/lib/config/constants';

const delay = (ms = 500) => new Promise((r) => setTimeout(r, ms));

export const authApi = {
  async requestOtp(mobile: string): Promise<{ ok: true; ttl: number }> {
    const m = normalizeMobile(mobile);
    if (!m) throw new ApiError(400, 'شمارهٔ موبایل نامعتبر است.');
    if (API_MODE === 'mock') {
      await delay();
      return { ok: true, ttl: CONSTANTS.OTP_TTL_SECONDS };
    }
    return http.post('/api/auth/otp/request', { mobile: m });
  },

  async verifyOtp(
    mobile: string,
    code: string,
  ): Promise<{ user: { id: string; mobile: string; name?: string } }> {
    if (API_MODE === 'mock') {
      await delay();
      if (normalizeDigits(code) !== '12345') throw new ApiError(401, 'کد وارد‌شده اشتباه است.');
      return { user: { id: 'u-mock', mobile: normalizeMobile(mobile) ?? mobile } };
    }
    return http.post('/api/auth/otp/verify', { mobile, code });
  },
};
