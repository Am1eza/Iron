/** Mock-aware form submitters. Mock resolves success (OTP accepts 12345); live calls /api/*. */
import { API_MODE, apiFetch, ApiError } from './client';
import { normalizeDigits, normalizeMobile } from '@/lib/utils/format';

const delay = (ms = 500) => new Promise((r) => setTimeout(r, ms));

export const formsApi = {
  async requestOtp(mobile: string): Promise<{ ok: true; ttl: number }> {
    const m = normalizeMobile(mobile);
    if (!m) throw new ApiError(400, 'شمارهٔ موبایل نامعتبر است.');
    if (API_MODE === 'mock') {
      await delay();
      return { ok: true, ttl: 120 };
    }
    return apiFetch('/api/auth/otp/request', { method: 'POST', body: JSON.stringify({ mobile: m }) });
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
    return apiFetch('/api/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ mobile, code }),
    });
  },

  async submitRequest(payload: unknown): Promise<{ ref: string }> {
    if (API_MODE === 'mock') {
      await delay();
      return { ref: 'PF-۱۴۰۵۰۴۰۵-۰۰۲۱' };
    }
    return apiFetch('/api/leads', { method: 'POST', body: JSON.stringify(payload) });
  },

  async createAlert(payload: unknown): Promise<{ ok: true }> {
    if (API_MODE === 'mock') {
      await delay();
      return { ok: true };
    }
    return apiFetch('/api/alerts', { method: 'POST', body: JSON.stringify(payload) });
  },

  async submitCooperation(payload: unknown): Promise<{ ok: true }> {
    if (API_MODE === 'mock') {
      await delay();
      return { ok: true };
    }
    return apiFetch('/api/cooperation', { method: 'POST', body: JSON.stringify(payload) });
  },

  async submitContact(payload: unknown): Promise<{ ok: true }> {
    if (API_MODE === 'mock') {
      await delay();
      return { ok: true };
    }
    return apiFetch('/api/contact', { method: 'POST', body: JSON.stringify(payload) });
  },
} as const;
