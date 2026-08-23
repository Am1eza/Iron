/**
 * Progressive-verification DISPLAY metadata — level names and what each level
 * unlocks. Client-safe (no DB) so the profile UI and the server both read the
 * same "why verify" copy. The verification LOGIC (validators, level derivation,
 * DB flow) lives in server/repos/verificationRepo.ts.
 */
export type VerificationLevel = 1 | 2 | 3;

export interface LevelInfo {
  level: VerificationLevel;
  name: string;
  unlocks: string[];
}

/**
 * The customer-facing name of an APPROVED business account (level 3). One
 * constant so the account header, the verification card and the sales-side
 * lead view all say exactly the same thing.
 */
export const BUSINESS_ACCOUNT_LABEL = 'حساب سازمانی تأییدشده';

export const LEVEL_INFO: Record<VerificationLevel, LevelInfo> = {
  1: {
    level: 1,
    name: 'موبایل تأییدشده',
    unlocks: ['مرور قیمت‌ها و ثبت استعلام', 'دریافت پیش‌فاکتور', 'عضویت در باشگاه مشتریان'],
  },
  2: {
    level: 2,
    name: 'هویت شخصی تأییدشده',
    unlocks: ['سقف سفارش بالاتر', 'صدور فاکتور رسمی به نام شما', 'نشان «خریدار تأییدشده»', 'امتیاز باشگاه'],
  },
  3: {
    level: 3,
    name: 'کسب‌وکار تأییدشده',
    /* Every line here must be something the product ACTUALLY does today.
       This list used to promise «قیمت و شرایط عمده‌فروشی» and «امکان خرید
       اعتباری» — neither mechanism exists anywhere in the codebase (no
       tier pricing, no credit limit), so verifying delivered neither and the
       copy was a promise sales could not honour. Do not reintroduce a price
       or discount claim here until the owner has an actual scheme to point
       at. The four below are each backed by real behaviour: the badge
       (VerificationCard + account header), the badge the rep sees on the
       lead (admin lead detail), the stored company identifiers, and the
       level-3 club weight in clubPoints.ts. */
    unlocks: [
      `نشان «${BUSINESS_ACCOUNT_LABEL}» روی حساب شما`,
      'کارشناس فروش هنگام استعلام می‌بیند که کسب‌وکار شما تأییدشده است',
      'مشخصات شرکت برای صدور فاکتور رسمی شرکتی ثبت و آمادهٔ استفاده است',
      'بیشترین امتیاز احراز در باشگاه مشتریان',
    ],
  },
};
