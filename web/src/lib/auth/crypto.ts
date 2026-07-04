/**
 * Crypto helpers (runtime-agnostic — Web Crypto, works in Node 18+ and Edge).
 * Used for OTP/refresh-token hashing and constant-time comparison so we never
 * store or compare secrets in the clear.
 */

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** SHA-256 hex digest (with an optional pepper from SESSION_SECRET). */
export async function sha256(value: string, pepper = ''): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(`${pepper}:${value}`));
  return toHex(digest);
}

/** Cryptographically-random URL-safe token of `bytes` length. */
export function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return toHex(arr.buffer);
}

/** A numeric OTP of the given length (uniform; leading zeros allowed). */
export function randomOtp(length: number): string {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < length; i++) out += String((arr[i] ?? 0) % 10);
  return out;
}

/** Constant-time string compare (avoids timing oracles on hash/code checks). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Shared policy for secrets that MUST be set in production but may fall back
 * to a hardcoded dev-only value locally: throw if missing in production
 * (`NODE_ENV==='production'`), otherwise use `devFallback`. Used by both the
 * JWT signer (jwt.ts) and the OTP hash pepper (service.ts) so the two never
 * silently diverge on this policy.
 */
export function requiredSecret(envVar: string | undefined, devFallback: string): string {
  if (envVar) return envVar;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET is required in production.');
  }
  return devFallback;
}
