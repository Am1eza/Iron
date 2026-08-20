/**
 * The chart is a pure function of props → SVG, so the branches that actually
 * bite in production (too few points, a perfectly flat series, a year of
 * daily observations) are cheap and worth pinning down here.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PriceHistoryChart, decimate } from './PriceHistoryChart';
import type { PricePoint } from '@/lib/types/domain';

const pt = (i: number, price: number): PricePoint => ({
  id: `p${i}`,
  skuId: 'sku-1',
  price,
  priceBasis: 'kg',
  unit: 'kg',
  at: new Date(Date.UTC(2025, 0, 1 + i, 12)).toISOString(),
});

describe('PriceHistoryChart', () => {
  it('renders the empty state instead of a degenerate line when there are no points', () => {
    const { container } = render(<PriceHistoryChart points={[]} range="90d" />);
    expect(screen.getByText('تاریخچهٔ کافی برای نمودار نیست')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders the empty state for a SINGLE point — one observation is not a trend', () => {
    const { container } = render(<PriceHistoryChart points={[pt(0, 285000)]} range="90d" />);
    expect(screen.getByText('تاریخچهٔ کافی برای نمودار نیست')).toBeInTheDocument();
    expect(container.querySelector('polyline')).toBeNull();
  });

  it('draws a real line as soon as there are two points', () => {
    const { container } = render(<PriceHistoryChart points={[pt(0, 100), pt(1, 200)]} range="90d" />);
    const line = container.querySelector('polyline');
    expect(line).not.toBeNull();
    expect(line!.getAttribute('points')).toMatch(/^[\d.,\s-]+$/);
  });

  it('survives an ALL-EQUAL series without dividing by zero (max - min === 0)', () => {
    const points = [pt(0, 285000), pt(1, 285000), pt(2, 285000), pt(3, 285000)];
    const { container } = render(<PriceHistoryChart points={points} range="30d" />);
    const coords = container.querySelector('polyline')!.getAttribute('points')!;
    expect(coords).not.toMatch(/NaN|Infinity/);
    // A flat series must render flat: every y is identical, and centered.
    const ys = coords.split(' ').map((p) => Number(p.split(',')[1]));
    expect(ys.every((y) => Number.isFinite(y))).toBe(true);
    expect(new Set(ys).size).toBe(1);
  });

  it('reports a 0% range change for a flat series rather than NaN', () => {
    const points = [pt(0, 285000), pt(1, 285000)];
    render(<PriceHistoryChart points={points} range="7d" />);
    expect(screen.queryByText(/NaN|Infinity/)).toBeNull();
  });

  it('never emits NaN in the area path for a flat series either', () => {
    const points = [pt(0, 50), pt(1, 50), pt(2, 50)];
    const { container } = render(<PriceHistoryChart points={points} range="7d" />);
    expect(container.querySelector('path')!.getAttribute('d')).not.toMatch(/NaN|Infinity/);
  });

  it('keeps the SVG LTR — time flows left→right even on an RTL page', () => {
    const { container } = render(<PriceHistoryChart points={[pt(0, 1), pt(1, 2)]} range="90d" />);
    // Direction lives in the shared .comboSvg class (CSS modules are stubbed
    // in tests), so assert the class contract rather than computed style.
    expect(container.querySelector('svg')!.getAttribute('class')).toContain('comboSvg');
  });

  it('renders axis labels as real <text> nodes, not canvas', () => {
    const { container } = render(<PriceHistoryChart points={[pt(0, 100), pt(1, 120)]} range="90d" />);
    expect(container.querySelectorAll('text').length).toBeGreaterThan(0);
    expect(container.querySelector('canvas')).toBeNull();
  });
});

describe('decimate', () => {
  it('leaves a short series untouched', () => {
    const xs = [1, 2, 3];
    expect(decimate(xs, 400)).toBe(xs);
  });

  it('caps a year of daily points at roughly the threshold', () => {
    const xs = Array.from({ length: 900 }, (_, i) => i);
    const out = decimate(xs, 400);
    expect(out.length).toBeLessThanOrEqual(401);
    expect(out.length).toBeGreaterThan(1);
  });

  it('ALWAYS keeps the first and last observation — the last one is the current price', () => {
    const xs = Array.from({ length: 1001 }, (_, i) => i);
    const out = decimate(xs, 400);
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBe(1000);
  });
});
