/** Tiny typed fetch wrapper with normalized errors. Used by endpoints in "live" mode. */
export const API_MODE = (process.env.NEXT_PUBLIC_API_MODE ?? 'mock') as 'mock' | 'live';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? '';

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = 'خطایی رخ داد. دوباره تلاش کنید.';
    try {
      const body = (await res.json()) as { message?: string };
      if (body?.message) message = body.message;
    } catch {
      /* keep the friendly Persian default — never surface a raw/English error */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}
