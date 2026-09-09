/**
 * Empty-state presets — the exact, on-brand copy from empty-states.md §5 wired to
 * typed routes. Pass the result straight to <EmptyState {...preset} />. Keeps copy
 * consistent everywhere and prevents ad-hoc «خالی» dead-ends.
 *
 * A plain (non-React) module can't call `useTranslations` itself, so every
 * preset takes two translator functions as its first args — `t`, scoped to
 * `emptyPresets` (one sub-key per preset), and `tAction`, scoped to the
 * shared `common.action` namespace for CTA labels repeated across presets
 * (`submitRequest`/`askAi`/`viewPrices`/`retry`/`login`, …) — the same two-
 * translator split `NotFoundEmptyState.tsx` already uses for the one preset
 * (`notFound`) that predates this file being translated at all. Callers get
 * both from `useTranslations('emptyPresets')` / `useTranslations('common.action')`
 * once and pass them through to every preset they use.
 */
import { routes } from '@/lib/routes';

type Preset = {
  tone?: 'empty' | 'error';
  headline: string;
  body?: string;
  primary?: { label: string; href?: string; onClick?: () => void };
  secondary?: { label: string; href?: string; onClick?: () => void };
  showAi?: boolean;
};

type T = (key: string, values?: Record<string, string | number | Date>) => string;
type TAction = (key: string) => string;

export const emptyPresets = {
  /** Price table — filters returned nothing. */
  filterNoResults: (t: T, _tAction: TAction, onClear?: () => void): Preset => ({
    headline: t('filterNoResults.headline'),
    body: t('filterNoResults.body'),
    primary: { label: t('filterNoResults.clearFilters'), onClick: onClear },
    showAi: true,
  }),

  /** Price table — category has no SKUs yet. */
  emptyCategory: (t: T, tAction: TAction): Preset => ({
    headline: t('emptyCategory.headline'),
    body: t('emptyCategory.body'),
    primary: { label: tAction('submitRequest'), href: routes.request() },
    secondary: { label: t('emptyCategory.otherCategories'), href: routes.prices() },
  }),

  /** SKU — no or stale price. */
  noPrice: (t: T, tAction: TAction, phone: string): Preset => ({
    headline: t('noPrice.headline'),
    body: t('noPrice.body'),
    primary: { label: tAction('submitRequest'), href: routes.request() },
    secondary: { label: t('noPrice.callWithPhone', { phone }), href: `tel:${phone}` },
  }),

  /** Site search — no results for the query. */
  searchNoResults: (t: T, tAction: TAction, q: string): Preset => ({
    headline: t('searchNoResults.headline'),
    body: t('searchNoResults.body', { q }),
    primary: { label: tAction('askAi'), href: routes.ai() },
    secondary: { label: t('searchNoResults.viewCategories'), href: routes.prices() },
  }),

  /** AI relay down. */
  aiRelayDown: (t: T, tAction: TAction, onRetry?: () => void): Preset => ({
    tone: 'error',
    headline: t('aiRelayDown.headline'),
    body: t('aiRelayDown.body'),
    primary: { label: tAction('submitRequest'), href: routes.request() },
    secondary: { label: tAction('retry'), onClick: onRetry },
  }),

  /** Account — favorites empty. */
  favoritesEmpty: (t: T, tAction: TAction): Preset => ({
    headline: t('favoritesEmpty.headline'),
    body: t('favoritesEmpty.body'),
    primary: { label: tAction('viewPrices'), href: routes.prices() },
  }),

  /** Account — requests/history empty. */
  requestsEmpty: (t: T, tAction: TAction): Preset => ({
    headline: t('requestsEmpty.headline'),
    body: t('requestsEmpty.body'),
    primary: { label: tAction('viewPrices'), href: routes.prices() },
    showAi: true,
  }),

  /** Account — alerts empty. Creation now lives on the bell (🔔) trigger next
   *  to every price row (PriceTable), the SKU page hero and the market board
   *  — not a dead self-link back here anymore (W22 fixed the actual gap; this
   *  CTA just routes to a surface that now has the control on it). */
  alertsEmpty: (t: T, tAction: TAction): Preset => ({
    headline: t('alertsEmpty.headline'),
    body: t('alertsEmpty.body'),
    primary: { label: tAction('viewPrices'), href: routes.prices() },
  }),

  /** Inquiry cart — empty. */
  cartEmpty: (t: T): Preset => ({
    headline: t('cartEmpty.headline'),
    body: t('cartEmpty.body'),
    primary: { label: t('cartEmpty.backToPrices'), href: routes.prices() },
    showAi: true,
  }),

  /** Chart — not enough history. */
  chartInsufficient: (t: T): Preset => ({
    headline: t('chartInsufficient.headline'),
    body: t('chartInsufficient.body'),
  }),

  /** 404 — unused (superseded by `NotFoundEmptyState.tsx`, which builds its
   *  translated preset inline rather than calling this) but left in its
   *  original fa-only shape rather than touched, per this pass's scope. */
  notFound: (): Preset => ({
    headline: 'این صفحه پیدا نشد',
    body: 'شاید آدرس عوض شده. از جستجو یا آهن‌تایم کمک بگیرید.',
    primary: { label: 'بازگشت به خانه', href: routes.home() },
    secondary: { label: 'مشاهدهٔ قیمت‌ها', href: routes.prices() },
    showAi: true,
  }),

  /** 500 / server error. */
  serverError: (t: T, tAction: TAction, onRetry?: () => void): Preset => ({
    tone: 'error',
    headline: t('serverError.headline'),
    body: t('serverError.body'),
    primary: { label: tAction('retry'), onClick: onRetry },
    secondary: { label: t('serverError.contactUs'), href: routes.contact() },
  }),

  /** Offline. */
  offline: (t: T, tAction: TAction, onRetry?: () => void): Preset => ({
    tone: 'error',
    headline: t('offline.headline'),
    body: t('offline.body'),
    primary: { label: tAction('retry'), onClick: onRetry },
  }),

  /** Auth required. */
  authRequired: (t: T, tAction: TAction, next?: string): Preset => ({
    headline: t('authRequired.headline'),
    body: t('authRequired.body'),
    primary: { label: tAction('login'), href: routes.login(next) },
  }),
} as const;
