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
    unlocks: [
      'قیمت و شرایط عمده‌فروشی',
      'امکان خرید اعتباری',
      'فاکتور رسمی شرکتی',
      'واجد شرایط بالاترین سطح باشگاه',
      'نشان «کسب‌وکار تأییدشده»',
    ],
  },
};
