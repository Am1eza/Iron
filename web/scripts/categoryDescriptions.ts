/**
 * The AUTHORED one-line description for each top-level category — the seed
 * copy behind `categories.seo.description`.
 *
 * Extracted out of `seedCategoryDescriptions.ts` (which still owns the "how"
 * — dry run, merge into `seo`, skip an admin-edited row) so that a second
 * script correcting ONE category's copy writes the same sentence the seed
 * would, instead of a near-copy that then drifts. Read that script's header
 * for the voice rules these were written to: one question answered — what is
 * this product line and who buys it — no superlatives, no keyword runs, and
 * every claim checked against what is actually on the rows.
 *
 * This file is a SEED, not a source of truth. From the moment it has run the
 * panel owns the text («ویرایش دسته → توضیح کوتاه دسته»); nothing here
 * overwrites what an admin has since typed.
 */

/** Same cap the admin field and `seoMetaSchema.description` enforce. */
export const CATEGORY_DESCRIPTION_MAX_LEN = 200;

export const CATEGORY_DESCRIPTIONS: Readonly<Record<string, string>> = {
  rebar:
    'میلگرد آجدار A2 و A3، میلگرد ساده، میلگرد حرارتی و کوپلر — پرمصرف‌ترین قلم اسکلت بتنی. خریدارش پیمانکار ساختمان و کارگاه بتن است و قیمت هر کیلوگرم بر پایهٔ سایز و کارخانه اعلام می‌شود.',
  ibeam:
    'تیرآهن IPE، هاش سبک و سنگین (HEA/HEB) و لانه‌زنبوری — مقاطع باربر اسکلت فلزی. قیمت هر کیلوگرم است و وزن شاخهٔ ۱۲ متری کنارش می‌آید تا هزینهٔ واقعی هر شاخه روشن باشد.',
  profile:
    'قوطی و پروفیل چهارپهلو، مبلی، ستونی، Z، کنگره و گالوانیزه — برای سازهٔ سبک، در و پنجره و صنعت مبل. سایز، مقطع بیرونی است؛ ضخامت جدار را هنگام استعلام بگویید.',
  sheet:
    'ورق سیاه، روغنی، گالوانیزه، اسیدشویی، آجدار، رنگی و آلیاژی، همراه عرشه فولادی، گریتینگ و ساندویچ‌پانل — کالای صنایع فلزی، سوله و ورق‌کاری. ابعاد برگ در قیمت اثر دارد.',
  // ناودانی is named here as of 2026-08-22. The original sentence deliberately
  // did NOT claim it — the category is named for ناودانی but its only active
  // sub-categories were نبشی/سپری/وال پست, because the ten priced ناودانی SKUs
  // were stranded on two deactivated rows (see restoreChannelSubCategories.ts,
  // and seedCategoryDescriptions.ts's own note: «If ناودانی is loaded later,
  // the panel is where that sentence gets updated»). It is loaded now.
  'angle-channel':
    'نبشی بال‌مساوی، بال‌نامساوی و لقمه، ناودانی سبک و سنگین، سپری و وال پست — مقاطع قاب‌بندی، اتصال و جداسازی دیوار. نبشی در شاخهٔ ۶ متری قیمت می‌خورد؛ خریدارش کارگاه ساختمانی و سازندهٔ درب و پنجره است.',
  pipe: 'لوله مانیسمان، گازی، صنعتی درزدار، داربستی، گالوانیزه، اسپیرال و جدار چاه — از خط لولهٔ صنعتی تا داربست کارگاه. اندازه به اینچ است؛ رده یا ضخامت جدار را هنگام استعلام بگویید.',
  wire: 'کلاف ساده و آجدار، مفتول سیاه و گالوانیزه، سیم آرماتوربندی و توری — کالای حلقه‌ای که به‌جای شاخه با وزن کلاف خرید و فروش می‌شود. خریدارش کارگاه بتن و صنایع مفتولی است.',
  steel:
    'لوله، پروفیل، نبشی، ناودانی، تسمه، توری و اتصالات استنلس استیل در گریدهای ۲۰۱، ۳۰۴ و ۳۱۶ — برای صنایع غذایی و دارویی و هر جای خورنده. گرید، تعیین‌کنندهٔ قیمت است.',
  'felezat-rangi':
    'آلومینیوم و مس — لوله، ورق، میلگرد، نبشی، پروفیل، تسمه و سیم‌جوش. خریدارش تأسیسات، برق و صنعت درب و پنجره است. لولهٔ مسی به‌صورت کلاف و بقیه بر پایهٔ کیلوگرم قیمت می‌خورد.',
};

/**
 * The «نبشی و ناودانی» sentence exactly as `seedCategoryDescriptions.ts` first
 * wrote it, before ناودانی was added to it.
 *
 * `restoreChannelSubCategories.ts` replaces the stored description ONLY when
 * it still equals this string — i.e. only when it is the seed's own copy and
 * nobody has edited it in the panel since. Anything else is reported and left
 * alone. Delete this constant once the correction is known to have run
 * everywhere it needs to.
 */
export const ANGLE_CHANNEL_DESCRIPTION_BEFORE_CHANNEL =
  'نبشی بال‌مساوی، سپری و وال پست — مقاطع قاب‌بندی، اتصال و جداسازی دیوار. نبشی در شاخهٔ ۶ متری قیمت می‌خورد و خریدارش کارگاه ساختمانی و سازندهٔ درب و پنجره است.';
