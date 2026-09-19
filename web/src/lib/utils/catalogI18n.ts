/**
 * Display-time localization for the catalog's Persian-first DATA and labels.
 *
 * `catalogLabels.ts` and the SKU rows the API returns are Persian strings
 * («سایز», «وزن شاخه», «۲۴ ساعت», «برش‌خورده», …) shared with the admin panel,
 * the AI advisor and the proforma, so they must stay Persian at the source.
 * The public price pages call this at the point of RENDER instead: every
 * non-fa locale gets the translated word, Latin digits and a Gregorian date,
 * so an /en price page reads as an English page rather than an English shell
 * around a Persian table (which is what a crawler saw: 30–47 % Persian text).
 *
 * A phrase this file does not know is returned as-is (still Persian, never
 * blank or broken) — the same graceful-degradation rule as
 * `localizedNames.ts`. `catalogI18n.test.ts` pins every label and every value
 * the live catalog held on 2026-09-19 so a typo or a dropped entry fails CI.
 */
import type { AppLocale } from '@/i18n/config';
import { toPersianDigits } from './format';

type NonFa = Exclude<AppLocale, 'fa'>;
type Tr = Record<NonFa, string>;

const t = (en: string, ar: string, zh: string): Tr => ({ en, ar, zh });

/**
 * Longest phrase wins, so «وزن شاخه» is matched before «شاخه» and
 * «متر مربع» before «متر». Keys are matched on whole words only.
 */
const PHRASES: Record<string, Tr> = {
  // Column / row labels (catalogLabels.ts)
  'سایز': t('Size', 'المقاس', '规格'),
  'ارتفاع': t('Height', 'الارتفاع', '高度'),
  'ضخامت': t('Thickness', 'السماكة', '厚度'),
  'ابعاد': t('Dimensions', 'الأبعاد', '尺寸'),
  'عرض': t('Width', 'العرض', '宽度'),
  'بال': t('Flange', 'الجناح', '翼缘'),
  'گرید': t('Grade', 'الدرجة', '牌号'),
  'استاندارد': t('Standard', 'المواصفة', '标准'),
  'رده': t('Schedule', 'الفئة (Schedule)', '壁厚等级'),
  'کارخانه': t('Mill', 'المصنع', '钢厂'),
  'برند': t('Brand', 'العلامة التجارية', '品牌'),
  'وزن': t('Weight', 'الوزن', '重量'),
  'وزن شاخه': t('Branch weight', 'وزن القضيب', '单支重量'),
  'طول شاخه': t('Branch length', 'طول القضيب', '定尺长度'),
  'طول سفارشی': t('Custom length', 'طول مخصص', '定制长度'),
  'طول': t('Length', 'الطول', '长度'),
  'آلیاژ': t('Alloy', 'السبيكة', '合金'),
  'حالت': t('Condition', 'الحالة', '状态'),
  'رنگ': t('Color', 'اللون', '颜色'),
  'محل تولید': t('Origin', 'مكان الإنتاج', '产地'),
  'بر اساس سفارش': t('Made to order', 'حسب الطلب', '按订单生产'),
  'نامشخص': t('Unspecified', 'غير محدد', '未知'),
  'سایر': t('Other', 'أخرى', '其他'),

  // Units and price basis
  'تومان': t('Toman', 'تومان', '土曼'),
  'کیلوگرم': t('kg', 'كغ', '公斤'),
  'شاخه': t('bar', 'قضيب', '支'),
  'برگ': t('sheet', 'لوح', '张'),
  'عدد': t('pcs', 'قطعة', '件'),
  'کلاف': t('coil', 'لفة', '卷'),
  'کویل': t('coil', 'لفة', '卷'),
  'متر مربع': t('m²', 'م²', '平方米'),
  'متر': t('m', 'م', '米'),
  'میل': t('mil', 'ميل', '毫米'),
  'اینچ': t('in', 'بوصة', '英寸'),

  // Delivery time
  'ساعت': t('hours', 'ساعة', '小时'),
  'روز': t('days', 'أيام', '天'),
  'تحویل فوری': t('Immediate delivery', 'تسليم فوري', '现货即发'),

  // Sub-category group headings (menu, drawer, price-table sub filter)
  'هاش': t('H-Beam', 'عارضة H', 'H型钢'),
  'پروفیل استیل': t('Stainless Steel Profile', 'بروفيل ستانلس ستيل', '不锈钢型材'),
  'ورق گرم': t('Hot-Rolled Sheet', 'صفائح مدلفنة على الساخن', '热轧钢板'),
  'ورق سرد و پوشش دار': t('Cold-Rolled & Coated Sheet', 'صفائح مدلفنة على البارد ومطلية', '冷轧及涂层钢板'),
  'ساندویچ پانل': t('Sandwich Panel', 'ألواح الساندويتش', '夹芯板'),
  'ورق استیل': t('Stainless Steel Sheet', 'صفائح ستانلس ستيل', '不锈钢板'),
  'لوله بدون درز': t('Seamless Pipe', 'أنابيب بدون لحام', '无缝钢管'),
  'لوله درزدار': t('Welded Pipe', 'أنابيب ملحومة', '焊接钢管'),
  'لوله استیل': t('Stainless Steel Pipe', 'أنبوب ستانلس ستيل', '不锈钢管'),
  'نبشی': t('Angle', 'زاوية', '角钢'),
  'ناودانی': t('Channel', 'قناة', '槽钢'),
  'لوله و پروفیل استیل': t('Stainless Steel Pipe & Profile', 'أنابيب وبروفيلات ستانلس ستيل', '不锈钢管与型材'),
  'مقاطع استیل': t('Stainless Steel Sections', 'مقاطع ستانلس ستيل', '不锈钢型材类'),
  'توری و مش استیل': t('Stainless Steel Mesh & Wire Cloth', 'شبك ومش ستانلس ستيل', '不锈钢网'),
  'اتصالات و قطعات استیل': t('Stainless Steel Fittings & Parts', 'تجهيزات وقطع ستانلس ستيل', '不锈钢管件及零件'),
  'آلومینیوم': t('Aluminum', 'ألومنيوم', '铝'),
  'مس': t('Copper', 'نحاس', '铜'),

  // Values the live catalog holds today (condition / standard / grade / region)
  'رول': t('Roll', 'رول', '卷材'),
  'برش‌خورده': t('Cut', 'مقطوع', '已切割'),
  'شیت': t('Sheet', 'شيت', '平板'),
  'ضد سایش': t('Wear-resistant', 'مقاوم للتآكل', '耐磨'),
  'گالوانیزه': t('Galvanized', 'مجلفن', '镀锌'),
  'آبی': t('Blue', 'أزرق', '蓝色'),
  'قرمز': t('Red', 'أحمر', '红色'),
  'سفید یخچالی': t('Refrigerator white', 'أبيض الثلاجات', '冰箱白'),
  'ماشینکاری': t('Machined', 'مشغّل', '机加工'),
  'نوردی': t('Rolled', 'مدرفل', '轧制'),
  'انبار شادآباد تهران': t('Shadabad warehouse, Tehran', 'مستودع شادآباد، طهران', '德黑兰沙达巴德仓库'),
  'اصفهان': t('Isfahan', 'أصفهان', '伊斯法罕'),
  'مشهد': t('Mashhad', 'مشهد', '马什哈德'),
  'تهران': t('Tehran', 'طهران', '德黑兰'),
  'بدون تغییر': t('Unchanged', 'دون تغيير', '持平'),
  'افزایش': t('Up', 'ارتفاع', '上涨'),
  'کاهش': t('Down', 'انخفاض', '下跌'),
};

const PHRASE_KEYS = Object.keys(PHRASES).sort((a, b) => b.length - a.length);
const ESCAPED = PHRASE_KEYS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
// Whole-word match: not glued to another Persian/Arabic letter on either side.
const PHRASE_RE = new RegExp(
  `(?<![\\u0600-\\u06FF\\u200c])(?:${ESCAPED.join('|')})(?![\\u0600-\\u06FF\\u200c])`,
  'g',
);

const NUM = '[\\d\\u06F0-\\u06F9\\u0660-\\u0669][\\d\\u06F0-\\u06F9\\u0660-\\u0669.\\u066B\\u066C٫٬/¼½¾]*';
// «کلاف ۱۵ متری» / «کویل ۱۵ متری» / «شاخه ۴ متری» — a length-qualified noun.
const LENGTH_NOUN_RE = new RegExp(`(کلاف|کویل|شاخه)\\s+(${NUM})\\s*متری`, 'g');
// «۶ متری» — the bare adjective.
const LENGTH_ADJ_RE = new RegExp(`(${NUM})\\s*متری`, 'g');

const M: Tr = t('m', 'م', '米');

/** Persian/Arabic-Indic digits and separators → Latin. */
export function latinDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/٫/g, '.')
    .replace(/٬/g, ',')
    .replace(/٪/g, '%');
}

/**
 * Translate a catalog label or value for a non-fa locale. Persian (`fa`) is
 * returned untouched. Composition rules keep length phrases natural
 * («کلاف ۱۵ متری» → «15 m coil») and every remaining digit becomes Latin.
 */
export function localizeCatalogText(text: string, locale: string): string {
  if (locale === 'fa' || !text) return text;
  const l = locale as NonFa;
  if (!(l in M)) return text;

  let out = text.replace(LENGTH_NOUN_RE, (_m, noun: string, n: string) => {
    const word = PHRASES[noun]![l];
    const len = latinDigits(n);
    return l === 'en' ? `${len} m ${word}` : l === 'zh' ? `${len}${M.zh}${word}` : `${word} ${len} ${M.ar}`;
  });
  out = out.replace(LENGTH_ADJ_RE, (_m, n: string) => `${latinDigits(n)} ${M[l]}`);
  out = out.replace(PHRASE_RE, (k) => PHRASES[k]![l]);
  return latinDigits(out);
}

/**
 * A stored data value (size, dimensions, weight, …) for display: Persian digits
 * for `fa` — exactly what the pages always did — and translated words with
 * Latin digits for every other locale.
 */
export function localizeValue(value: string | number, locale: string): string {
  return locale === 'fa' ? toPersianDigits(value) : localizeCatalogText(String(value), locale);
}

/** True when the text still contains Persian/Arabic letters (an unknown value). */
export function hasUntranslatedScript(text: string): boolean {
  return /[؀-ۿ]/.test(text);
}

/** Every phrase key, exposed for the pinning test. */
export const CATALOG_PHRASE_KEYS: readonly string[] = PHRASE_KEYS;
