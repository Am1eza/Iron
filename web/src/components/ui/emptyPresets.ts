/**
 * Empty-state presets — the exact, on-brand copy from empty-states.md §5 wired to
 * typed routes. Pass the result straight to <EmptyState {...preset} />. Keeps copy
 * consistent everywhere and prevents ad-hoc «خالی» dead-ends.
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

export const emptyPresets = {
  /** Price table — filters returned nothing. */
  filterNoResults: (onClear?: () => void): Preset => ({
    headline: 'موردی پیدا نشد',
    body: 'با این فیلترها محصولی نیست. فیلترها را ساده‌تر کنید یا از آهن‌تایم بپرسید.',
    primary: { label: 'حذف فیلترها', onClick: onClear },
    showAi: true,
  }),

  /** Price table — category has no SKUs yet. */
  emptyCategory: (): Preset => ({
    headline: 'به‌زودی در این دسته',
    body: 'هنوز محصولی در این دسته ثبت نشده. درخواست بدهید تا کارشناس کمک کند.',
    primary: { label: 'ثبت درخواست', href: routes.request() },
    secondary: { label: 'دسته‌های دیگر', href: routes.prices() },
  }),

  /** SKU — no or stale price. */
  noPrice: (phone: string): Preset => ({
    headline: 'قیمت لحظه‌ای بگیرید',
    body: 'قیمت این محصول را کارشناس به‌روز اعلام می‌کند.',
    primary: { label: 'ثبت درخواست', href: routes.request() },
    secondary: { label: `تماس ${phone}`, href: `tel:${phone}` },
  }),

  /** Site search — no results for the query. */
  searchNoResults: (q: string): Preset => ({
    headline: 'چیزی پیدا نشد',
    body: `برای «${q}» نتیجه‌ای نبود. املا را بررسی کنید یا از آهن‌تایم بپرسید.`,
    primary: { label: 'پرسش از آهن‌تایم', href: routes.ai() },
    secondary: { label: 'مشاهدهٔ دسته‌ها', href: routes.prices() },
  }),

  /** AI relay down. */
  aiRelayDown: (onRetry?: () => void): Preset => ({
    tone: 'error',
    headline: 'الان نمی‌توانم محاسبه کنم',
    body: 'چند لحظهٔ دیگر دوباره امتحان کنید، یا درخواست بدهید تا کارشناس تماس بگیرد.',
    primary: { label: 'ثبت درخواست', href: routes.request() },
    secondary: { label: 'تلاش دوباره', onClick: onRetry },
  }),

  /** Account — favorites empty. */
  favoritesEmpty: (): Preset => ({
    headline: 'علاقه‌مندی‌ای ندارید',
    body: 'محصول‌ها را با ♡ ذخیره کنید تا اینجا ببینیدشان.',
    primary: { label: 'مشاهدهٔ قیمت‌ها', href: routes.prices() },
  }),

  /** Account — requests/history empty. */
  requestsEmpty: (): Preset => ({
    headline: 'هنوز درخواستی ثبت نکرده‌اید',
    body: 'از جدول قیمت یا آهن‌تایم، درخواست بدهید تا اینجا پیگیری کنید.',
    primary: { label: 'مشاهدهٔ قیمت‌ها', href: routes.prices() },
    showAi: true,
  }),

  /** Account — alerts empty. */
  alertsEmpty: (): Preset => ({
    headline: 'هشداری ندارید',
    body: 'برای هر محصول یا دلار/طلا هشدار بگذارید تا خبرتان کنیم.',
    primary: { label: 'ساخت هشدار', href: routes.account('alerts') },
  }),

  /** Inquiry cart — empty. */
  cartEmpty: (): Preset => ({
    headline: 'سبد استعلام خالی است',
    body: 'محصول‌ها را به سبد اضافه کنید تا یک‌جا پیش‌فاکتور بگیرید.',
    primary: { label: 'بازگشت به قیمت‌ها', href: routes.prices() },
    showAi: true,
  }),

  /** Chart — not enough history. */
  chartInsufficient: (): Preset => ({
    headline: 'تاریخچهٔ کافی نیست',
    body: 'به‌محض ثبت قیمت‌های بیشتر، نمودار اینجا نمایش داده می‌شود.',
  }),

  /** 404. */
  notFound: (): Preset => ({
    headline: 'این صفحه پیدا نشد',
    body: 'شاید آدرس عوض شده. از جستجو یا آهن‌تایم کمک بگیرید.',
    primary: { label: 'بازگشت به خانه', href: routes.home() },
    secondary: { label: 'مشاهدهٔ قیمت‌ها', href: routes.prices() },
    showAi: true,
  }),

  /** 500 / server error. */
  serverError: (onRetry?: () => void): Preset => ({
    tone: 'error',
    headline: 'مشکلی پیش آمد',
    body: 'از طرف ما بود. چند لحظهٔ دیگر دوباره امتحان کنید.',
    primary: { label: 'تلاش دوباره', onClick: onRetry },
    secondary: { label: 'تماس با ما', href: routes.contact() },
  }),

  /** Offline. */
  offline: (onRetry?: () => void): Preset => ({
    tone: 'error',
    headline: 'اتصال اینترنت قطع است',
    body: 'به‌محض وصل‌شدن، خودش به‌روز می‌شود.',
    primary: { label: 'تلاش دوباره', onClick: onRetry },
  }),

  /** Auth required. */
  authRequired: (next?: string): Preset => ({
    headline: 'برای ادامه وارد شوید',
    body: 'با شمارهٔ موبایل و کد پیامکی وارد شوید.',
    primary: { label: 'ورود', href: routes.login(next) },
  }),
} as const;
