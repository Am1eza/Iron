import { describe, expect, it } from 'vitest';
import { EQUAL_ANGLE_NORMALIZATION, equalAnglePath } from './catalogAngleNormalization';

describe('approved equal-angle normalization plan', () => {
  it('contains exactly the four evidence-backed scalar → physical mappings', () => {
    expect(EQUAL_ANGLE_NORMALIZATION.map(({ oldSize, newSize }) => [oldSize, newSize])).toEqual([
      ['۶', '۶۰×۶۰×۶'],
      ['۸', '۸۰×۸۰×۸'],
      ['۱۰', '۱۰۰×۱۰۰×۱۰'],
      ['۱۲', '۱۲۰×۱۲۰×۱۲'],
    ]);
  });

  it('does not include the deliberately deferred ۱۴/۱۶/۱۸ rows', () => {
    const oldSizes = EQUAL_ANGLE_NORMALIZATION.map((item) => item.oldSize);
    expect(oldSizes).not.toContain('۱۴');
    expect(oldSizes).not.toContain('۱۶');
    expect(oldSizes).not.toContain('۱۸');
  });

  it('builds one old → canonical SKU path pair per changed slug', () => {
    const paths = EQUAL_ANGLE_NORMALIZATION.map((item) => ({
      from: equalAnglePath(item.oldSlug),
      to: equalAnglePath(item.newSlug),
    }));
    expect(new Set(paths.map((path) => path.from)).size).toBe(paths.length);
    expect(new Set(paths.map((path) => path.to)).size).toBe(paths.length);
    expect(paths[0]).toEqual({
      from: '/prices/angle-channel/nabshi/angle-channel-angle-1',
      to: '/prices/angle-channel/nabshi/angle-channel-angle-60x60x6',
    });
  });
});
