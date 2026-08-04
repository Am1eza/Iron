/**
 * International phone parsing/validation, built on libphonenumber-js (the
 * industry-standard JS port of Google's libphonenumber — used by the
 * majority of production phone-input components).
 *
 * Iran keeps going through the existing `normalizeMobile()` unchanged — same
 * 09XXXXXXXXX storage format every current user row, OTP row, and SMS.ir
 * call already expects — so selecting the default country changes nothing
 * about current behavior. Every other country is genuinely new capability:
 * stored as full E.164 (no legacy data to stay compatible with).
 *
 * OTP delivery (SMS.ir's Verify API) is Iran-only today — see
 * GEO-ROUTING.md's phone-input note. `isOtpEligible()` is the single place
 * that constraint is encoded, so the UI can accept any country's number for
 * contact/lead forms while the login flow can give a clear, honest message
 * instead of silently failing to text a code that will never arrive.
 *
 * ── Bundle split ──────────────────────────────────────────────────────────
 * The ~124KB of libphonenumber country metadata lives in `./phoneMeta`, which
 * this module reaches ONLY through the dynamic `loadPhoneMeta()` below. Every
 * Iran path here is metadata-free, so /login's first paint no longer pays for
 * the country list of a field whose default — and, for OTP, only eligible —
 * country is Iran.
 *
 * `CountryCode` is imported as a TYPE only; type imports are erased at
 * compile time, so this does not pull the metadata back in.
 */
import type { CountryCode } from 'libphonenumber-js/min';
import { normalizeDigits, normalizeMobile } from './format';
import type * as PhoneMeta from './phoneMeta';

export type { CountryCode };
export type PhoneMetaModule = typeof PhoneMeta;

export const DEFAULT_PHONE_COUNTRY: CountryCode = 'IR';

/** Iran's dial code and example number, hardcoded so the default country
 *  renders correctly with zero metadata loaded. These two constants are the
 *  entire reason the common case costs nothing. */
export const DEFAULT_DIAL_CODE = '+98';
const IR_PLACEHOLDER = '0912 345 6789';

let metaPromise: Promise<PhoneMetaModule> | null = null;
let metaCache: PhoneMetaModule | null = null;

/** The metadata module if it has already landed, else null. Synchronous. */
export function getLoadedPhoneMeta(): PhoneMetaModule | null {
  return metaCache;
}

/** Fetch (once) the country-metadata chunk. Idempotent and cached; a failed
 *  load is retried on the next call rather than poisoning the cache. */
export function loadPhoneMeta(): Promise<PhoneMetaModule> {
  metaPromise ??= import('./phoneMeta').then(
    (m) => {
      metaCache = m;
      return m;
    },
    (err) => {
      metaPromise = null;
      throw err;
    },
  );
  return metaPromise;
}

/** Dial code for a country. `+98` needs no metadata; anything else returns
 *  null until the chunk has landed (the UI shows the ISO code meanwhile). */
export function dialCode(country: CountryCode): string | null {
  if (country === DEFAULT_PHONE_COUNTRY) return DEFAULT_DIAL_CODE;
  return metaCache?.dialCode(country) ?? null;
}

/** A realistic-looking national-format placeholder, e.g. "912 345 6789". */
export function phonePlaceholder(country: CountryCode): string {
  if (country === DEFAULT_PHONE_COUNTRY) return IR_PLACEHOLDER;
  return metaCache?.phonePlaceholder(country) ?? '';
}

export type ParsedPhone = {
  /** Canonical stored form — see module header comment for the Iran/other split. */
  normalized: string;
  country: CountryCode;
  /** Whether OTP delivery works for this number today (SMS.ir is Iran-only). */
  otpEligible: boolean;
};

/**
 * Parse a national-number string typed against a selected country into the
 * app's canonical storage format. Returns null when it isn't a valid number
 * for that country.
 *
 * Stays SYNCHRONOUS on purpose — three forms validate on every keystroke or
 * inside a sync submit handler. The invariant that makes that safe: `country`
 * can only be something other than Iran if the user picked it in
 * `CountrySelect`, and `CountrySelect` cannot offer a country until the
 * metadata chunk has resolved. The `loadPhoneMeta()` kick below is belt and
 * braces for the impossible case (e.g. a country restored from state while
 * the chunk request is still in flight): the number reads as not-yet-valid
 * for that one render, and the component re-renders when the chunk lands.
 */
export function parsePhone(rawInput: string, country: CountryCode): ParsedPhone | null {
  const digits = normalizeDigits(rawInput);
  if (country === DEFAULT_PHONE_COUNTRY) {
    const mobile = normalizeMobile(digits);
    return mobile ? { normalized: mobile, country, otpEligible: true } : null;
  }
  if (!metaCache) {
    void loadPhoneMeta().catch(() => {});
    return null;
  }
  const normalized = metaCache.parseInternational(digits, country);
  return normalized ? { normalized, country, otpEligible: false } : null;
}

/** True if `mobile` (already in canonical storage form) can receive an OTP today. */
export function isOtpEligible(mobile: string): boolean {
  return /^09\d{9}$/.test(mobile);
}

/**
 * Best-effort split of a canonical stored mobile back into {country,
 * national} for re-populating the PhoneField (e.g. showing a logged-in
 * user's existing number). Iran numbers always parse cleanly since they're
 * always in 09XXXXXXXXX form and need no metadata; anything else needs the
 * chunk, so this one is async.
 */
export async function splitPhone(
  mobile: string,
): Promise<{ country: CountryCode; national: string }> {
  if (/^09\d{9}$/.test(mobile)) {
    return { country: DEFAULT_PHONE_COUNTRY, national: mobile };
  }
  const meta = await loadPhoneMeta();
  return meta.splitInternational(mobile) ?? { country: DEFAULT_PHONE_COUNTRY, national: mobile };
}
