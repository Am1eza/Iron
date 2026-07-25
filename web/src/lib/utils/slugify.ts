/**
 * Persian → URL slug. Transliterates common Persian/Arabic letters to Latin,
 * keeps digits, collapses everything else to hyphens. Used by the admin forms
 * to AUTO-GENERATE the slug from the Persian name — the admin never has to
 * know what a "slug" is; the field stays editable for overrides.
 */
const MAP: Record<string, string> = {
  'آ': 'a', 'ا': 'a', 'أ': 'a', 'إ': 'e', 'ب': 'b', 'پ': 'p', 'ت': 't', 'ث': 's',
  'ج': 'j', 'چ': 'ch', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'z', 'ر': 'r', 'ز': 'z',
  'ژ': 'zh', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'z', 'ط': 't', 'ظ': 'z', 'ع': 'a',
  'غ': 'gh', 'ف': 'f', 'ق': 'gh', 'ک': 'k', 'ك': 'k', 'گ': 'g', 'ل': 'l', 'م': 'm',
  'ن': 'n', 'و': 'v', 'ه': 'h', 'ة': 'h', 'ی': 'y', 'ي': 'y', 'ئ': 'y', 'ء': '',
  '\u200c': '-', // ZWNJ → hyphen (نیم‌فاصله separates words)
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

export function slugify(input: string): string {
  const translit = [...input.trim().toLowerCase()].map((ch) => MAP[ch] ?? ch).join('');
  return translit
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
