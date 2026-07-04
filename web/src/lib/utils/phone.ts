/**
 * International phone parsing/validation, built on libphonenumber-js (the
 * industry-standard JS port of Google's libphonenumber — used by the
 * majority of production phone-input components). Uses the `/min` metadata
 * build to keep bundle size down (matters on the Cloudflare Workers
 * deployment, which has a hard bundle-size cap).
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
 */
import {
  parsePhoneNumberFromString,
  getCountries,
  getCountryCallingCode,
  getExampleNumber,
  type CountryCode,
} from 'libphonenumber-js/min';
import examples from 'libphonenumber-js/examples.mobile.json';
import { normalizeDigits, normalizeMobile } from './format';

export type { CountryCode };

export const DEFAULT_PHONE_COUNTRY: CountryCode = 'IR';

/** Every ISO country libphonenumber-js knows, with Iran pinned first. */
export function listPhoneCountries(): CountryCode[] {
  const all = getCountries();
  return [DEFAULT_PHONE_COUNTRY, ...all.filter((c) => c !== DEFAULT_PHONE_COUNTRY)];
}

export function dialCode(country: CountryCode): string {
  return `+${getCountryCallingCode(country)}`;
}

/** A realistic-looking national-format placeholder, e.g. "912 345 6789". */
export function phonePlaceholder(country: CountryCode): string {
  const example = getExampleNumber(country, examples);
  return example ? example.formatNational() : '';
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
 */
export function parsePhone(rawInput: string, country: CountryCode): ParsedPhone | null {
  const digits = normalizeDigits(rawInput);
  if (country === DEFAULT_PHONE_COUNTRY) {
    const mobile = normalizeMobile(digits);
    return mobile ? { normalized: mobile, country, otpEligible: true } : null;
  }
  const parsed = parsePhoneNumberFromString(digits, country);
  if (!parsed || !parsed.isValid()) return null;
  return { normalized: parsed.number, country, otpEligible: false };
}

/** True if `mobile` (already in canonical storage form) can receive an OTP today. */
export function isOtpEligible(mobile: string): boolean {
  return /^09\d{9}$/.test(mobile);
}

/**
 * Best-effort split of a canonical stored mobile back into {country,
 * national} for re-populating the PhoneField (e.g. showing a logged-in
 * user's existing number). Iran numbers always parse cleanly since they're
 * always in 09XXXXXXXXX form; anything else is parsed via libphonenumber-js.
 */
export function splitPhone(mobile: string): { country: CountryCode; national: string } {
  if (/^09\d{9}$/.test(mobile)) {
    return { country: DEFAULT_PHONE_COUNTRY, national: mobile };
  }
  const parsed = parsePhoneNumberFromString(mobile);
  if (parsed?.country) {
    return { country: parsed.country, national: parsed.formatNational() };
  }
  return { country: DEFAULT_PHONE_COUNTRY, national: mobile };
}
