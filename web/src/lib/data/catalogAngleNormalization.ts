/**
 * The four equal-leg angle rows whose physical sections are independently
 * verified by matching published 6 m branch weights.
 *
 * The legacy values («۶», «۸», …) are centimetre shorthand. They omit both
 * the second equal leg and the wall thickness, so they are not a complete
 * product identity and cannot safely coexist with unequal-leg sections. The
 * replacements state the real millimetre section `leg×leg×thickness`.
 *
 * Deliberately exhaustive and closed: ۱۴/۱۶/۱۸ have no matching physical
 * specification, and unequal-leg/لقمه rows require different evidence. They
 * must not enter this map until a supplier or technical table identifies the
 * exact section behind the current price.
 */
export const EQUAL_ANGLE_NORMALIZATION = [
  {
    oldSlug: 'angle-channel-angle-1',
    newSlug: 'angle-channel-angle-60x60x6',
    oldSize: '۶',
    newSize: '۶۰×۶۰×۶',
    oldName: 'نبشی بال مساوی ۶',
    newName: 'نبشی بال مساوی ۶۰×۶۰×۶',
    factory: 'سپهر ایرانیان',
    theoreticalWeightKg: 34,
  },
  {
    oldSlug: 'angle-channel-angle-2',
    newSlug: 'angle-channel-angle-80x80x8',
    oldSize: '۸',
    newSize: '۸۰×۸۰×۸',
    oldName: 'نبشی بال مساوی ۸',
    newName: 'نبشی بال مساوی ۸۰×۸۰×۸',
    factory: 'ظهوریان مشهد',
    theoreticalWeightKg: 60.4,
  },
  {
    oldSlug: 'angle-channel-angle-3',
    newSlug: 'angle-channel-angle-100x100x10',
    oldSize: '۱۰',
    newSize: '۱۰۰×۱۰۰×۱۰',
    oldName: 'نبشی بال مساوی ۱۰',
    newName: 'نبشی بال مساوی ۱۰۰×۱۰۰×۱۰',
    factory: 'ناب تبریز',
    theoreticalWeightKg: 94.3,
  },
  {
    oldSlug: 'angle-channel-angle-4',
    newSlug: 'angle-channel-angle-120x120x12',
    oldSize: '۱۲',
    newSize: '۱۲۰×۱۲۰×۱۲',
    oldName: 'نبشی بال مساوی ۱۲',
    newName: 'نبشی بال مساوی ۱۲۰×۱۲۰×۱۲',
    factory: 'ناب تبریز',
    theoreticalWeightKg: 135.8,
  },
] as const;

export function equalAnglePath(slug: string): string {
  return `/prices/angle-channel/nabshi/${slug}`;
}
