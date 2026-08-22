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

/**
 * The display tiers the icon system defines a stroke for. Kept as a literal
 * rather than imported from the component: the point of the test is to pin
 * the spec independently of the implementation that has to meet it.
 */
const TIERS: Array<[size: number, renderedStroke: number]> = [
  [16, 1.25],
  [20, 1.5],
  [24, 1.75],
  [32, 2],
  [64, 2],
];

describe('CategoryArt', () => {
  const defaultMarkup = render(<CategoryArt slug="__not_a_real_category__" />).container.innerHTML;

  it.each(REAL_CATEGORY_SLUGS)(
    'renders bespoke artwork for "%s", not the generic fallback circle',
    (slug) => {
      const { container } = render(<CategoryArt slug={slug} />);
      expect(container.innerHTML).not.toBe(defaultMarkup);
    },
  );

  /**
   * The reason the drawings were normalised, and now the reason they stay
   * normalised: these icons are always seen side by side (the mega-menu rail,
   * the search page's row of category chips), so a primary outline that once
   * ranged 4→9 across them read as one category being emphasised over
   * another. The replacement set carries ONE weight, declared once on the
   * root `<svg>` — so the invariant is now stricter than "an allowed list of
   * two values": no descendant may set `stroke-width` at all.
   */
  it.each(REAL_CATEGORY_SLUGS)(
    'draws "%s" with exactly one stroke weight, set on the root svg',
    (slug) => {
      const { container } = render(<CategoryArt slug={slug} size={24} />);
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('stroke-width')).toBe('1.75');
      expect(container.querySelectorAll('svg *[stroke-width]')).toHaveLength(0);
    },
  );

  /**
   * Opacity was the previous set's second, undeclared weight axis (0.4–0.95),
   * which is what made neighbours in one rail look like different families.
   * Nothing in the family may reintroduce it.
   */
  it.each(REAL_CATEGORY_SLUGS)('draws "%s" with no opacity anywhere', (slug) => {
    const { container } = render(<CategoryArt slug={slug} size={24} />);
    expect(
      container.querySelectorAll('[opacity], [fill-opacity], [stroke-opacity]'),
    ).toHaveLength(0);
  });

  /**
   * Optical sizing: the stroke is recomputed per display size rather than
   * scaled with the drawing, so a 16px icon does not render a hairline and a
   * 64px one does not render a slab. The attribute is in viewBox units, so
   * the assertion converts back to the rendered pixel value.
   */
  it.each(TIERS)('renders a %ipx icon at a %fpx stroke', (size, expected) => {
    const { container } = render(<CategoryArt slug="ibeam" size={size} />);
    const svg = container.querySelector('svg')!;
    const units = Number(svg.getAttribute('stroke-width'));
    expect((units * size) / 24).toBeCloseTo(expected, 5);
  });

  /**
   * The micro master. At 16/20px the section profiles drop their wall
   * thickness and become their own centreline, which is what keeps نبشی,
   * ناودانی and سپری apart in a dense menu row. At/below 20 must therefore
   * draw something different from 24 — if the two ever converge, the micro
   * master has been lost and the dense sizes silently regress.
   */
  const geometryAt = (slug: string, size: number) =>
    [...render(<CategoryArt slug={slug} size={size} />).container.querySelectorAll('svg > *')]
      .map((el) => `${el.tagName}:${el.getAttribute('d') ?? ''}`)
      .join('|');

  it.each(['ibeam', 'angle-channel', 'pipe', 'profile'])(
    'gives "%s" a distinct micro master at 20px',
    (slug) => {
      expect(geometryAt(slug, 20)).not.toBe(geometryAt(slug, 24));
    },
  );

  it('uses the same micro master at 16 and 20, and the same full master at 24 and 64', () => {
    expect(geometryAt('ibeam', 16)).toBe(geometryAt('ibeam', 20));
    expect(geometryAt('ibeam', 24)).toBe(geometryAt('ibeam', 64));
  });

  it('still falls back to the generic circle for an unknown slug', () => {
    const { container } = render(<CategoryArt slug="totally-made-up" />);
    expect(container.innerHTML).toBe(defaultMarkup);
  });
});
