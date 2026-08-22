import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CategoryArt } from './CategoryArt';

/**
 * Regression test: 7 of the 14 real category slugs (varagh-garm, varagh-sard,
 * varagh-steel, steel, shiralat-sanati, etesalat-felezi, flanj-va-etesalat,
 * felezat-rangi) had no matching `case` in the switch and silently fell
 * through to the generic default circle — invisible in the desktop flyout
 * (rarely reached, most categories have a real product photo covering for
 * it) but exposed the moment CategoryStage started rendering this icon in
 * the always-visible mobile rail list. Asserts each real slug renders
 * something OTHER than the default fallback, not just that it renders at all.
 */
const REAL_CATEGORY_SLUGS = [
  'rebar',
  'ibeam',
  'varagh-garm',
  'varagh-sard',
  'profile',
  'varagh-steel',
  'angle-channel',
  'pipe',
  'wire',
  'steel',
  'shiralat-sanati',
  'etesalat-felezi',
  'flanj-va-etesalat',
  'felezat-rangi',
];

describe('CategoryArt', () => {
  const defaultMarkup = render(<CategoryArt slug="__not_a_real_category__" />).container.innerHTML;

  it.each(REAL_CATEGORY_SLUGS)('renders bespoke artwork for "%s", not the generic fallback circle', (slug) => {
    const { container } = render(<CategoryArt slug={slug} />);
    expect(container.innerHTML).not.toBe(defaultMarkup);
  });

  /**
   * The reason the drawings were normalised: these icons are always seen side
   * by side (the mega-menu rail, the search page's row of category chips), so
   * a primary outline that ranged 4→9 across them read as one category being
   * emphasised over another. Every stroke in the file must now be either the
   * shared primary weight or the single lighter accent step — a third value
   * is what this test exists to catch.
   */
  const ALLOWED_STROKE_WIDTHS = ['5', '3.5'];

  it.each(REAL_CATEGORY_SLUGS)('draws "%s" with only the shared stroke weights', (slug) => {
    const { container } = render(<CategoryArt slug={slug} />);
    const widths = [...container.querySelectorAll('[stroke-width]')].map(
      (el) => el.getAttribute('stroke-width')!,
    );
    expect(widths.every((w) => ALLOWED_STROKE_WIDTHS.includes(w))).toBe(true);
  });

  /**
   * `shiralat-sanati` is the one icon whose body is a FILL (the P&ID bowtie)
   * rather than an outline, so its only strokes are the teal handwheel accent.
   * It has no primary outline to match; everything else does.
   */
  const FILL_BODIED = ['shiralat-sanati'];

  it('gives every outlined icon the SAME primary weight', () => {
    const heaviest = REAL_CATEGORY_SLUGS.filter((slug) => !FILL_BODIED.includes(slug)).map(
      (slug) => {
        const { container } = render(<CategoryArt slug={slug} />);
        const widths = [...container.querySelectorAll('[stroke-width]')].map((el) =>
          Number(el.getAttribute('stroke-width')),
        );
        return Math.max(...widths);
      },
    );
    expect(new Set(heaviest)).toEqual(new Set([5]));
  });

  it('still falls back to the generic circle for an unknown slug', () => {
    const { container } = render(<CategoryArt slug="totally-made-up" />);
    expect(container.innerHTML).toBe(defaultMarkup);
  });
});
