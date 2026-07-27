/**
 * i18n entry point. `t()` resolves a shared string key (fa dictionary), with simple
 * `{name}` interpolation. Number/date localization lives in `lib/utils/format.ts`
 * (Persian digits, Toman, Jalali) — re-exported here so views import one module.
 */
import { fa, type StringKey } from './strings';

export { LOCALES, DEFAULT_LOCALE, activeLocale } from './locale';
export type { LocaleCode, LocaleConfig } from './locale';
export {
  toPersianDigits,
  normalizeDigits,
  formatToman,
  formatMovement,
} from '@/lib/utils/format';
// Separate module on purpose — re-exporting it from here would pull
// date-fns-jalali back into every importer of this barrel. See utils/jalali.ts.
export { formatJalali } from '@/lib/utils/jalali';

/** Translate a shared key; supports `{token}` substitution from `vars`. */
export function t(key: StringKey, vars?: Record<string, string | number>): string {
  let str: string = fa[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return str;
}
