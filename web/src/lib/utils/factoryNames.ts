/**
 * Latin display names for the mills/origins the catalog lists (the `factory`
 * column is free Persian text with no per-locale column, unlike categories).
 *
 * en and zh show the same Latin transliteration — Chinese B2B listings keep a
 * foreign mill's name in Latin. ar has no entry on purpose: Persian and Arabic
 * share a script and the Persian name is what an Arabic reader can search for,
 * so it is kept (and marked `lang="fa"` by the caller).
 *
 * An unknown factory falls back to the Persian original, so a newly added mill
 * degrades to "still Persian", never to a blank cell. The pinning test in
 * `factoryNames.test.ts` holds the full list the live catalog had on
 * 2026-09-19.
 */
const LATIN: Record<string, string> = {
  'فولاد مبارکه': 'Mobarakeh Steel',
  'کویر کاشان': 'Kavir Kashan',
  'ذوب‌آهن اصفهان': 'Esfahan Steel (Zob Ahan)',
  'فایکو': 'Faico',
  'باهنر': 'Bahonar',
  'ظفر بناب': 'Zafar Bonab',
  'آلوم طرح پاسارگاد': 'Alum Tarh Pasargad',
  'آناهیتا گیلان': 'Anahita Gilan',
  'امیرکبیر خزر': 'Amirkabir Khazar',
  'بافق یزد': 'Bafgh Yazd',
  'راد همدان': 'Rad Hamedan',
  'شاهرود': 'Shahrood',
  'شاهین بناب': 'Shahin Bonab',
  'هیربد': 'Hirbod',
  'کاوه تیکمه داش': 'Kaveh Tikmeh Dash',
  'ابرکوه': 'Abarkouh',
  'صبا فولاد زاگرس': 'Saba Foolad Zagros',
  'نیشابور': 'Neyshabour',
  'پرشین فولاد': 'Persian Steel',
  'کالوپ': 'Kaloup',
  'ابهر': 'Abhar',
  'قائم اصفهان': 'Ghaem Esfahan',
  'پارس': 'Pars',
  'فولاد متین': 'Foolad Matin',
  'اراک': 'Arak',
  'آلومین گستر': 'Alumin Gostar',
  'چینی': 'Chinese',
  'تهران شرق': 'Tehran Sharq',
  'نورد لوله و پوشش نیزار': 'Nourd Louleh & Pooshesh Neyzar',
  'یزد': 'Yazd',
  'فولاد سبا': 'Foolad Saba',
  'سپهر ایرانیان': 'Sepehr Iranian',
  'بابک': 'Babak',
  'مهر اصل': 'Mehr Asl',
  'تاراز': 'Taraz',
  'لوله سپاهان': 'Louleh Sepahan',
  'خلیج فارس': 'Persian Gulf',
  'کیان پرشیا': 'Kian Persia',
  'ظهوریان مشهد': 'Zohourian Mashhad',
  'ورق شهرکرد': 'Varagh Shahrekord',
  'امیرکبیر کاشان': 'Amirkabir Kashan',
  'هفت الماس': 'Haft Almas',
  'هفت‌الماس': 'Haft Almas',
  'وارداتی': 'Imported',
  'سپنتا': 'Sepanta',
  'ناب تبریز': 'Nab Tabriz',
  'اهواز': 'Ahvaz',
  'سپاهان': 'Sepahan',
  'لوله سمنان': 'Louleh Semnan',
  'لوله‌سازی اهواز': 'Louleh Sazi Ahvaz',
  'دهشیر یزد': 'Dehshir Yazd',
  'جهان فولاد غرب': 'Jahan Foolad Gharb',
  'چین': 'China',
  'کاویان اهواز': 'Kavian Ahvaz',
  'قطعات اصفهان': 'Ghataat Esfahan',
  'فولاد گیلان': 'Foolad Gilan',
  'اکسین اهواز': 'Oxin Ahvaz',
  'دشتستان': 'Dashtestan',
  'شهرکرد': 'Shahrekord',
  'کاشان': 'Kashan',
  'لوله بهفلز سپاهان': 'Louleh Behfelez Sepahan',
  'درپاد تهران': 'Darpad Tehran',
  'نورد لوله ساوه': 'Nourd Louleh Saveh',
  'آریان فولاد': 'Arian Foolad',
  'جاوید بناب': 'Javid Bonab',
  'فولاد میانه': 'Foolad Mianeh',
  'فولاد شاهرود': 'Foolad Shahrood',
  'فولاد نیشابور': 'Foolad Neyshabour',
  'فولاد کویر کاشان': 'Foolad Kavir Kashan',
  'سیادن ابهر': 'Siadan Abhar',
};

/** Persian names that have a Latin form — exposed for the pinning test. */
export const KNOWN_FACTORY_NAMES: readonly string[] = Object.keys(LATIN);

/**
 * The mill name to show for `locale`. `fa` and `ar` keep the Persian original;
 * `en` and `zh` get the Latin form when one is on file.
 */
export function localizedFactoryName(name: string, locale: string): string {
  if (locale !== 'en' && locale !== 'zh') return name;
  return LATIN[name] ?? name;
}
