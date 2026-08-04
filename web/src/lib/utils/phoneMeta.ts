/**
 * The libphonenumber-js half of `./phone.ts`, split out so it can be reached
 * ONLY through a dynamic `import()`.
 *
 * Why the split: `libphonenumber-js/min` plus `examples.mobile.json` is ~124KB
 * of country metadata, and it was statically imported by `phone.ts`, which is
 * imported by `PhoneField`, which is imported by `LoginForm`. That made
 * /login — a page with a single phone field on it — the heaviest public route
 * on the site at 228KB gzip, and every byte of the metadata was downloaded,
 * parsed and executed before first paint even though the default country is
 * Iran and Iran never touches this module at all (see `phone.ts`'s IR fast
 * path).
 *
 * Nothing may import this file statically. `phone.ts` owns the one dynamic
 * import and the module-level cache; import from there.
 */
import {
  parsePhoneNumberFromString,
  getCountries,
  getCountryCallingCode,
  getExampleNumber,
  type CountryCode,
} from 'libphonenumber-js/min';
import examples from 'libphonenumber-js/examples.mobile.json';

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

/** Parse + validate a non-Iranian national number. Iran never reaches here. */
export function parseInternational(digits: string, country: CountryCode): string | null {
  const parsed = parsePhoneNumberFromString(digits, country);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

/** Split a stored non-Iranian E.164 number back into {country, national}. */
export function splitInternational(
  mobile: string,
): { country: CountryCode; national: string } | null {
  const parsed = parsePhoneNumberFromString(mobile);
  if (!parsed?.country) return null;
  return { country: parsed.country, national: parsed.formatNational() };
}
