/**
 * Price-alert (قیمت‌سنج) client helpers — shared between the creation trigger
 * (`AlertBellButton`) and the account list (`AlertsList`) so target-matching,
 * value formatting and the tier-limit upsell copy can't drift between the
 * two surfaces (W22).
 */
import type { Alert, MarketKey } from '@/lib/types/domain';
import type { AppLocale } from '@/i18n/config';
import { routes } from '@/lib/routes';
import { formatToman, toPersianDigits, localizeDigits } from './format';

export type AlertTarget = Alert['target'];

/** Display unit per market index — a fixed real-world fact (ounce is quoted
 *  in USD by convention), not an admin-configurable number, so it's safe to
 *  encode here (matches the same assumption in BilletCard's admin ticker list). */
const MARKET_UNIT: Record<MarketKey, string> = {
  usd: 'تومان',
  eur: 'تومان',
  gold18: 'تومان',
  billet: 'تومان',
  ounce: 'دلار',
};

export function marketUnit(key: MarketKey): string {
  return MARKET_UNIT[key];
}

/** Stable string key for a target — used to find "does an alert already
 *  exist for this exact SKU/market" without a per-row network call. */
export function alertTargetKey(target: AlertTarget): string {
  return target.type === 'sku' ? `sku:${target.skuId}` : `market:${target.key}`;
}

export function sameTarget(a: AlertTarget, b: AlertTarget): boolean {
  return alertTargetKey(a) === alertTargetKey(b);
}

/** The user's own ACTIVE alert for a target, if any (drives the filled/outline
 *  bell state — mirrors the favorites heart-icon pattern). */
export function findActiveAlert(alerts: Alert[] | undefined, target: AlertTarget): Alert | undefined {
  if (!alerts) return undefined;
  return alerts.find((a) => a.status === 'active' && sameTarget(a.target, target));
}

/** Format a live value for display, using the right unit for the target type. */
export function formatAlertValue(value: number, target: AlertTarget): string {
  if (target.type === 'sku') return `${formatToman(value, false)} تومان`;
  const unit = marketUnit(target.key);
  if (unit === 'تومان') return `${formatToman(value, false)} تومان`;
  return `${toPersianDigits(value.toLocaleString('en-US').replace(/,/g, '٬'))} ${unit}`;
}

/**
 * Locale-aware sibling of `formatAlertValue` — same unit logic, but with
 * locale-formatted digits and a translated currency word instead of the
 * hardcoded fa "تومان"/"دلار". This is a plain utility module (no React
 * context), so it can't call `useTranslations` itself — the caller passes
 * in `currencyWord`/`usdWord` from `useTranslations('common.unit')`
 * (`currency`/`usd`), the same catalog entries every other translated
 * price display in this app already reuses.
 */
export function formatAlertValueLocalized(
  value: number,
  target: AlertTarget,
  locale: AppLocale,
  currencyWord: string,
  usdWord: string,
): string {
  if (locale === 'fa') return formatAlertValue(value, target);
  if (target.type === 'sku') return `${formatToman(value, false, locale)} ${currencyWord}`;
  const unit = marketUnit(target.key);
  if (unit === 'تومان') return `${formatToman(value, false, locale)} ${currencyWord}`;
  return `${localizeDigits(value.toLocaleString('en-US'), locale)} ${usdWord}`;
}

/** How far the live value is from the alert's threshold, from the customer's
 *  point of view (always a positive "still needs to move by X%" figure).
 *  Returns null when there's nothing live to compare against. */
export function alertDistance(
  currentValue: number | null | undefined,
  threshold: number,
  op: 'below' | 'above',
): { pct: number; near: boolean; crossed: boolean } | null {
  if (currentValue == null || !Number.isFinite(currentValue) || threshold <= 0) return null;
  const pct =
    op === 'below'
      ? ((currentValue - threshold) / threshold) * 100
      : ((threshold - currentValue) / currentValue) * 100;
  return { pct, near: pct > 0 && pct <= 5, crossed: pct <= 0 };
}

/** Smart default threshold — a reasonable percent below/above the current
 *  price rather than a blank field (a known price-alert UX friction point). */
export function defaultThreshold(currentValue: number, op: 'below' | 'above'): number {
  const pct = 0.05;
  const raw = op === 'below' ? currentValue * (1 - pct) : currentValue * (1 + pct);
  return Math.round(raw);
}

export type ClubTier = 'iron' | 'steel' | 'poolad';

/** Copy for the "you hit your alert cap" state — framed as a concrete,
 *  tier-aware upsell (never a raw blocking error), per W22 UX guidance.
 *  Never hardcodes the OTHER tiers' cap numbers (only the admin-configurable
 *  `cap` for the user's own current tier, taken straight from the 409 body). */
export function capLimitCopy(
  cap: number,
  tier: ClubTier | undefined,
  targetLabel: string,
): { headline: string; body: string; cta?: { label: string; href: string } } {
  const capFa = toPersianDigits(cap);
  // W22 review fix: `iron` is a real, distinct membership tier (see
  // CLUB_TIER_META.iron in club.ts) — a joined iron member was previously
  // lumped in with a non-member and told to "join the club" they're
  // already in. Only a genuine non-member (`tier` undefined) gets that copy;
  // an iron member gets pushed toward steel, the same shape steel→poolad
  // already used.
  if (!tier) {
    return {
      headline: `شما به سقف ${capFa} هشدار فعال رسیده‌اید.`,
      body: `برای پیگیری قیمت «${targetLabel}» هم، عضو باشگاه آهن‌تایم شوید؛ عضویت سقف هشدارهای فعال شما را بالا می‌برد.`,
      cta: { label: 'عضویت در باشگاه', href: routes.club() },
    };
  }
  if (tier === 'iron') {
    return {
      headline: `شما به سقف ${capFa} هشدار فعال رسیده‌اید.`,
      body: `برای پیگیری قیمت «${targetLabel}» هم، با ارتقا به سطح فولادی باشگاه، سقف هشدارهای فعال‌تان را بیشتر کنید.`,
      cta: { label: 'مشاهدهٔ باشگاه', href: routes.club() },
    };
  }
  if (tier === 'steel') {
    return {
      headline: `شما به سقف ${capFa} هشدار فعال رسیده‌اید.`,
      body: `برای پیگیری قیمت «${targetLabel}» هم، با ارتقای سطح باشگاه، سقف هشدارهای فعال‌تان را بیشتر کنید.`,
      cta: { label: 'مشاهدهٔ باشگاه', href: routes.club() },
    };
  }
  return {
    headline: `شما در بالاترین سطح باشگاه، به سقف ${capFa} هشدار فعال رسیده‌اید.`,
    body: `برای ثبت هشدار «${targetLabel}»، ابتدا یکی از هشدارهای فعال‌تان را متوقف یا حذف کنید.`,
    cta: { label: 'مدیریت هشدارها', href: routes.account('alerts') },
  };
}

/**
 * Locale-aware sibling of `capLimitCopy`, same tier-branching logic — takes
 * a translation function (`useTranslations('alertBell.limitCap')`) instead
 * of hardcoding fa copy, so it can't call `useTranslations` itself from this
 * plain utility module. Delegates to the original for fa so that path's
 * output is byte-for-byte unchanged.
 */
export function capLimitCopyLocalized(
  cap: number,
  tier: ClubTier | undefined,
  targetLabel: string,
  locale: AppLocale,
  t: (key: string, values?: Record<string, string | number>) => string,
): { headline: string; body: string; cta?: { label: string; href: string } } {
  if (locale === 'fa') return capLimitCopy(cap, tier, targetLabel);
  const capDigits = localizeDigits(cap, locale);
  if (!tier) {
    return {
      headline: t('headlineWithCap', { cap: capDigits }),
      body: t('nonMemberBody', { label: targetLabel }),
      cta: { label: t('nonMemberCta'), href: routes.club() },
    };
  }
  if (tier === 'iron') {
    return {
      headline: t('headlineWithCap', { cap: capDigits }),
      body: t('ironBody', { label: targetLabel }),
      cta: { label: t('upgradeCta'), href: routes.club() },
    };
  }
  if (tier === 'steel') {
    return {
      headline: t('headlineWithCap', { cap: capDigits }),
      body: t('steelBody', { label: targetLabel }),
      cta: { label: t('upgradeCta'), href: routes.club() },
    };
  }
  return {
    headline: t('maxHeadlineWithCap', { cap: capDigits }),
    body: t('maxBody', { label: targetLabel }),
    cta: { label: t('maxCta'), href: routes.account('alerts') },
  };
}
