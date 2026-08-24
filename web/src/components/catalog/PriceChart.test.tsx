import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PriceChart } from './PriceChart';

/**
 * Regression for the 2026-08-14 area-fill bug: the closing path used to jump
 * from the last plotted point straight across to the baseline under the
 * FIRST point (the opposite edge of the chart), instead of dropping straight
 * down to the baseline under itself. Visually that drew a diagonal wedge
 * slicing across the jagged line instead of a fill that hugs it.
 */
describe('PriceChart — area fill traces the line, not a diagonal across the whole width', () => {
  it('closes straight down from the last plotted point, then along the baseline to the first', () => {
    const series = [100, 140, 90, 130, 110, 150, 95, 120];
    const { container } = render(<PriceChart series={series} />);
    const paths = container.querySelectorAll('svg path');
    // paths[0] is the fill (`area`), paths[1] is the stroked line (`line`).
    const areaD = paths[0]!.getAttribute('d')!;
    const lineD = paths[1]!.getAttribute('d')!;

    // The area path must start with the exact same points as the line.
    expect(areaD.startsWith(lineD)).toBe(true);

    const tail = areaD.slice(lineD.length).trim();
    const closingCommands = tail.match(/L [\d.]+ 152(?:\.0)?/g);
    expect(closingCommands).toHaveLength(2);

    // The FIRST closing command must share its x with the LAST point on the
    // line — a straight drop, not a jump to the opposite edge.
    const lastLineX = lineD.trim().split(' L ').pop()!.trim().split(' ')[0];
    const firstClosingX = closingCommands![0]!.split(' ')[1];
    expect(firstClosingX).toBe(lastLineX);

    expect(areaD.trim().endsWith('Z')).toBe(true);
  });
});

/**
 * Regression for the 2026-08-23 fabricated-history bug. `catalog.priceSeries`
 * used to fall back to the mock random walk whenever a SKU had no
 * `price_points`, so an unpriced product published invented numbers. With that
 * fallback gone the component receives an empty series, and everything below
 * the guard indexes `data[0]` and divides by it — an unguarded empty series
 * renders «از NaN تومان به NaN تومان» over an empty path.
 */
describe('PriceChart — no history', () => {
  it('says so instead of plotting an empty series', () => {
    const { container, getByText } = render(<PriceChart series={[]} />);
    expect(getByText('هنوز سابقهٔ قیمتی برای این کالا ثبت نشده است.')).toBeTruthy();
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).not.toContain('NaN');
  });
});
