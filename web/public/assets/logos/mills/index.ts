/**
 * Supplier-mill logos for the «از معتبرترین کارخانه‌های فولاد ایران»
 * (steel mills we source from) strip.
 *
 * `nameFa` is the exact Persian factory name used elsewhere on the site —
 * the mill strip links each entry to `/search?q=<nameFa>`, which matches
 * SKUs by that exact string, so it must never be edited casually.
 *
 * `hasLogo: true`  → an optimized logo file exists in this folder and is shown.
 * `hasLogo: false` → no official logo could be found; the UI falls back to a
 *                    clean name chip and auto-upgrades once a file lands here.
 */
export type MillLogo = {
  slug: string;
  name: string;
  nameFa: string;
  website?: string;
  /** Public path, served from /assets/logos/mills/<slug>.<ext>. */
  file: string;
  hasLogo: boolean;
  monogram: string;
};

export const millLogos: MillLogo[] = [
  { slug: 'mobarakeh-steel', name: 'Mobarakeh Steel Company', nameFa: 'فولاد مبارکه', website: 'https://www.msc.ir', file: '/assets/logos/mills/mobarakeh-steel.webp', hasLogo: true, monogram: 'MSC' },
  { slug: 'esfahan-steel', name: 'Esfahan Steel Company (Zob Ahan)', nameFa: 'ذوب‌آهن اصفهان', website: 'https://www.esfahansteel.ir', file: '/assets/logos/mills/esfahan-steel.webp', hasLogo: true, monogram: 'ESCO' },
  { slug: 'khuzestan-steel', name: 'Khuzestan Steel Company', nameFa: 'فولاد خوزستان', website: 'https://www.ksc.ir', file: '/assets/logos/mills/khuzestan-steel.webp', hasLogo: true, monogram: 'KSC' },
  { slug: 'kaveh-steel', name: 'Kaveh South Kish Steel Company', nameFa: 'فولاد کاوه', website: 'https://www.sksco.ir', file: '/assets/logos/mills/kaveh-steel.svg', hasLogo: true, monogram: 'SKS' },
  { slug: 'neyshabur-steel', name: 'Khorasan Steel Complex', nameFa: 'فولاد نیشابور', website: 'https://kscco.ir', file: '/assets/logos/mills/khorasan-steel.webp', hasLogo: true, monogram: 'KSCCO' },
  { slug: 'arfa-steel', name: 'Arfa Iron & Steel Company', nameFa: 'فولاد ارفع', website: 'https://arfasteel.ir', file: '/assets/logos/mills/arfa-steel.webp', hasLogo: true, monogram: 'ARFA' },
  { slug: 'yazd-rolling', name: 'Yazd Steel (Ahramian)', nameFa: 'نورد یزد', website: 'https://yazdfoulad.com', file: '/assets/logos/mills/yazd-rolling.webp', hasLogo: true, monogram: 'YR' },
  { slug: 'kavir-steel', name: 'Kavir Steel Complex', nameFa: 'فولاد کویر', website: 'https://kavirsteel.ir', file: '/assets/logos/mills/kavir-steel.webp', hasLogo: true, monogram: 'KVR' },
];
