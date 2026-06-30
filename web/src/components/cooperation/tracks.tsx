import type { ReactNode } from 'react';
import { ChartIcon, TagIcon, StarIcon } from '@/components/primitives/icons';

/** The three همکاری tracks — the single source of truth for both pages. */
export type TrackKey = 'analysis' | 'supply' | 'sell';

export type TrackContent = {
  key: TrackKey;
  /** Short label used in cards, breadcrumbs and metadata. */
  title: string;
  /** One-line summary for the index card. */
  summary: string;
  /** "Who is this for" footnote on the index card. */
  audience: string;
  /** CTA label on the index card. */
  cta: string;
  /** Icon for the card + track header. */
  icon: ReactNode;
  /** Eyebrow on the track page. */
  eyebrow: string;
  /** Lead paragraph on the track page (under the title). */
  lead: string;
  /** What you get / how it works — short bullet list on the track page. */
  points: string[];
  /** Helper line above the lead form. */
  formNote: string;
  /** SEO description for the track page. */
  metaDescription: string;
};

export const TRACKS: Record<TrackKey, TrackContent> = {
  analysis: {
    key: 'analysis',
    title: 'تحلیل بازار',
    summary: 'گزارش و تحلیل اختصاصی بازار فولاد، متناسب با پروژه و سبد خرید شما.',
    audience: 'مناسب پیمانکاران، انبوه‌سازان و واحدهای تأمین',
    cta: 'درخواست تحلیل',
    icon: <ChartIcon size={24} />,
    eyebrow: 'همکاری · تحلیل بازار',
    lead: 'تیم تحلیل آهن‌تایم روند قیمت میلگرد، تیرآهن، ورق و دیگر مقاطع را همراه با عوامل مؤثر بازار رصد می‌کند و گزارشی اختصاصی متناسب با نیاز شما آماده می‌کند تا خریدتان را در زمان درست انجام دهید.',
    points: [
      'تحلیل روند قیمت و نوسان مقاطع موردنظر شما در بازه‌های کوتاه و میان‌مدت.',
      'بررسی عوامل اثرگذار: نرخ ارز، قیمت شمش، عرضهٔ بورس کالا و سیاست‌های کارخانه‌ها.',
      'پیشنهاد زمان مناسب خرید برای کنترل هزینهٔ تمام‌شدهٔ پروژه.',
      'گزارش دوره‌ای قابل تنظیم، مخصوص سبد محصولات و حجم خرید شما.',
    ],
    formNote: 'محصولات و بازهٔ زمانی موردنظرتان را در توضیحات بنویسید تا گزارش دقیق‌تری آماده کنیم.',
    metaDescription:
      'گزارش و تحلیل اختصاصی بازار فولاد آهن‌تایم؛ روند قیمت، عوامل مؤثر و زمان مناسب خرید برای پروژهٔ شما.',
  },
  supply: {
    key: 'supply',
    title: 'تأمین از شما',
    summary: 'تولیدکننده یا تأمین‌کننده‌اید؟ محصولتان را به آهن‌تایم بسپارید و به خریداران سراسر کشور برسانید.',
    audience: 'مناسب کارخانه‌ها، بنگاه‌ها و تأمین‌کنندگان',
    cta: 'ثبت همکاری تأمین',
    icon: <TagIcon size={24} />,
    eyebrow: 'همکاری · تأمین از شما',
    lead: 'اگر تولیدکننده یا تأمین‌کنندهٔ مقاطع فولادی هستید، می‌توانید محصولات‌تان را در آهن‌تایم عرضه کنید. ما کالای شما را به شبکهٔ گستردهٔ خریداران، پیمانکاران و سازندگان می‌رسانیم و فرایند استعلام تا تحویل را مدیریت می‌کنیم.',
    points: [
      'معرفی و نمایش محصولات شما در کنار قیمت روز بازار به هزاران خریدار.',
      'دریافت استعلام و سرنخ‌های فروش واقعی، بدون نیاز به تیم فروش گسترده.',
      'هماهنگی قیمت، موجودی و زمان تحویل از طریق کارشناسان آهن‌تایم.',
      'همکاری شفاف و بلندمدت با تسویهٔ روشن و گزارش عملکرد.',
    ],
    formNote: 'نوع محصول، ظرفیت تولید یا موجودی و محل تحویل را در توضیحات بنویسید.',
    metaDescription:
      'تولیدکننده یا تأمین‌کنندهٔ فولاد هستید؟ محصولتان را در آهن‌تایم عرضه کنید و به خریداران سراسر کشور برسانید.',
  },
  sell: {
    key: 'sell',
    title: 'فروش از ما',
    summary: 'نمایندهٔ فروش آهن‌تایم شوید و با اعتبار یک بازار شناخته‌شده، فروش‌تان را رشد دهید.',
    audience: 'مناسب بنگاه‌ها، فروشندگان و کارشناسان فروش',
    cta: 'درخواست نمایندگی فروش',
    icon: <StarIcon size={24} />,
    eyebrow: 'همکاری · فروش از ما',
    lead: 'به‌عنوان نمایندهٔ فروش آهن‌تایم، با تکیه بر قیمت‌های شفاف، تأمین مستقیم از کارخانه و اعتبار برند ما، می‌توانید به مشتریان منطقهٔ خود خدمات بدهید و درآمد پایدار بسازید.',
    points: [
      'استفاده از قیمت روز، کاتالوگ محصولات و ابزارهای فروش آهن‌تایم.',
      'پشتیبانی کارشناسی برای استعلام، پیش‌فاکتور و نهایی‌سازی سفارش.',
      'تأمین مطمئن از کارخانه و تحویل هماهنگ‌شده برای مشتریان شما.',
      'مدل همکاری شفاف با پورسانت روشن و رشد متناسب با عملکرد.',
    ],
    formNote: 'منطقهٔ فعالیت و سابقهٔ فروش خود را در توضیحات بنویسید تا سریع‌تر بررسی کنیم.',
    metaDescription:
      'نمایندهٔ فروش آهن‌تایم شوید؛ با قیمت‌های شفاف، تأمین مستقیم از کارخانه و اعتبار برند، فروش‌تان را رشد دهید.',
  },
};

export const TRACK_ORDER: TrackKey[] = ['analysis', 'supply', 'sell'];

export function isTrackKey(value: string): value is TrackKey {
  return value === 'analysis' || value === 'supply' || value === 'sell';
}
