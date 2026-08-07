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

  it('still falls back to the generic circle for an unknown slug', () => {
    const { container } = render(<CategoryArt slug="totally-made-up" />);
    expect(container.innerHTML).toBe(defaultMarkup);
  });
});
