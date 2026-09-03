/** The seven live rows that are square/rectangular box profiles misfiled as Z. */
export const RETIRED_PROFILE_Z = [
  { slug: 'profile-z-18', name: 'پروفیل و قوطی پروفیل Z ۲۰×۲۰', size: '۲۰×۲۰' },
  { slug: 'profile-z-19', name: 'پروفیل و قوطی پروفیل Z ۳۰×۳۰', size: '۳۰×۳۰' },
  { slug: 'profile-z-20', name: 'پروفیل و قوطی پروفیل Z ۴۰×۴۰', size: '۴۰×۴۰' },
  { slug: 'profile-z-21', name: 'پروفیل و قوطی پروفیل Z ۴۰×۸۰', size: '۴۰×۸۰' },
  { slug: 'profile-z-22', name: 'پروفیل و قوطی پروفیل Z ۵۰×۵۰', size: '۵۰×۵۰' },
  { slug: 'profile-z-23', name: 'پروفیل و قوطی پروفیل Z ۶۰×۶۰', size: '۶۰×۶۰' },
  { slug: 'profile-z-24', name: 'پروفیل و قوطی پروفیل Z ۷۰×۷۰', size: '۷۰×۷۰' },
] as const;

/**
 * The eight real Z sections approved from the reference table: four heights,
 * each in the two published gauges. Height and thickness stay separate facts,
 * matching the market table rather than recreating a box-profile dimension.
 */
export const SEEDED_PROFILE_Z = ([16, 18, 20, 22] as const).flatMap((height) =>
  ([2.5, 3] as const).map((thickness) => {
    const thicknessSlug = String(thickness).replace('.', '-');
    const heightFa = String(height).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]!);
    const thicknessFa = String(thickness)
      .replace('.', '٫')
      .replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]!);
    const slug = `profile-z-${height}-t${thicknessSlug}`;
    return {
      id: slug,
      slug,
      name: `پروفیل Z*${heightFa} ضخامت ${thicknessFa} میلی‌متر`,
      size: `Z*${heightFa}`,
      dimensions: thicknessFa,
    };
  }),
);

export const PROFILE_Z_LISTING_PATH = '/prices/profile/profil-z';

export function retiredProfileZPath(slug: string): string {
  return `${PROFILE_Z_LISTING_PATH}/${slug}`;
}
