/**
 * Customer-club tier DISPLAY metadata — names, taglines, and the concrete
 * perks each tier unlocks. Shared by the public landing, the in-account
 * ClubPanel, and admin so the perk copy can never drift between them. The
 * numeric thresholds live server-side in the CLUB_CONFIG setting
 * (clubPoints.ts); this is the human-facing layer only.
 */
export type ClubTierKey = 'iron' | 'steel' | 'poolad';

export interface ClubTierMeta {
  key: ClubTierKey;
  name: string;
  tagline: string;
  perks: string[];
  /** The standout tier — soft emphasis in the UI. */
  featured?: boolean;
}

export const CLUB_TIER_META: Record<ClubTierKey, ClubTierMeta> = {
  iron: {
    key: 'iron',
    name: 'آهنی',
    tagline: 'نقطهٔ شروع هر همکاری',
    perks: [
      'دسترسی به قیمت‌های روز و آرشیو نوسان',
      'ثبت استعلام و دریافت پیش‌فاکتور',
      'پشتیبانی تلفنی کارشناسان',
    ],
  },
  steel: {
    key: 'steel',
    name: 'فولادی',
    tagline: 'برای خریدهای منظم و حرفه‌ای',
    perks: [
      'تخفیف پلکانی روی حجم خرید',
      'اولویت در تأمین و تحویل',
      // W22: alert creation shipped with a real per-tier cap (see
      // alertsRepo.ts's DEFAULT_ALERT_TIER_CAPS) — kept qualitative here
      // instead of hardcoding the live number, since the admin can retune
      // the actual cap from Settings without this copy drifting out of sync.
      'هشدار قیمت روی چند محصول هم‌زمان (نه فقط یکی)',
      'پیش‌فاکتور سریع‌تر',
    ],
    featured: true,
  },
  poolad: {
    key: 'poolad',
    name: 'پولادی',
    tagline: 'بالاترین سطح وفاداری',
    perks: [
      'بیشترین تخفیف پلکانی',
      'تأمین تضمینی با اولویت کامل',
      'بیشترین سقف هشدار قیمت در بین همهٔ سطوح',
      'مشاور اختصاصی و خط ارتباطی مستقیم',
      'پیشنهادهای ویژهٔ پیش از عرضهٔ عمومی',
    ],
  },
};

export const CLUB_TIERS_ORDERED: ClubTierMeta[] = [
  CLUB_TIER_META.iron,
  CLUB_TIER_META.steel,
  CLUB_TIER_META.poolad,
];
