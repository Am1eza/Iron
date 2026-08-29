import { describe, expect, it } from 'vitest';
import {
  PROFILE_Z_LISTING_PATH,
  RETIRED_PROFILE_Z,
  SEEDED_PROFILE_Z,
  retiredProfileZPath,
} from './catalogProfileZReplacement';

describe('profile Z replacement plan', () => {
  it('retires exactly the seven captured box-profile rows', () => {
    expect(RETIRED_PROFILE_Z).toHaveLength(7);
    expect(RETIRED_PROFILE_Z.map((row) => row.size)).toEqual([
      '۲۰×۲۰',
      '۳۰×۳۰',
      '۴۰×۴۰',
      '۴۰×۸۰',
      '۵۰×۵۰',
      '۶۰×۶۰',
      '۷۰×۷۰',
    ]);
  });

  it('seeds the approved 4 heights × 2 thicknesses as eight distinct SKUs', () => {
    expect(SEEDED_PROFILE_Z).toHaveLength(8);
    expect(SEEDED_PROFILE_Z.map(({ size, dimensions }) => [size, dimensions])).toEqual([
      ['Z*۱۶', '۲٫۵'],
      ['Z*۱۶', '۳'],
      ['Z*۱۸', '۲٫۵'],
      ['Z*۱۸', '۳'],
      ['Z*۲۰', '۲٫۵'],
      ['Z*۲۰', '۳'],
      ['Z*۲۲', '۲٫۵'],
      ['Z*۲۲', '۳'],
    ]);
    expect(new Set(SEEDED_PROFILE_Z.map((row) => row.slug)).size).toBe(8);
  });

  it('routes every retired SKU to the category listing, never to a guessed replacement', () => {
    for (const row of RETIRED_PROFILE_Z) {
      expect(retiredProfileZPath(row.slug)).toBe(`${PROFILE_Z_LISTING_PATH}/${row.slug}`);
      expect(PROFILE_Z_LISTING_PATH).toBe('/prices/profile/profil-z');
    }
  });
});
