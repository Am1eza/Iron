import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ArticleChart } from './ArticleChart';
import type { ChartAttrs } from '@/lib/content/richDoc';

const base: ChartAttrs = {
  kind: 'bar',
  title: 'قیمت میلگرد',
  unit: 'تومان',
  labels: ['فروردین', 'اردیبهشت', 'خرداد'],
  series: [{ label: 'اصفهان', values: [24000, 25000, 23000] }],
};

describe('ArticleChart (US-12.4)', () => {
  it('ships no data that is only available as a colour — the table is always there', () => {
    render(<ArticleChart attrs={base} idBase="c1" />);
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: /اصفهان/ })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: 'فروردین' })).toBeInTheDocument();
  });

  it('names the plot for assistive tech instead of leaving a bare <svg>', () => {
    render(<ArticleChart attrs={base} idBase="c2" />);
    const plot = screen.getByRole('img');
    expect(plot).toHaveAccessibleName(expect.stringContaining('قیمت میلگرد') as unknown as string);
  });

  it('shows a legend as soon as identity matters, and not before', () => {
    const { rerender, container } = render(<ArticleChart attrs={base} idBase="c3" />);
    // One series: the title already names it, so a legend box would be noise.
    expect(container.querySelector('ul')).toBeNull();
    rerender(
      <ArticleChart
        attrs={{ ...base, series: [...base.series, { label: 'یزد', values: [1, 2, 3] }] }}
        idBase="c3"
      />,
    );
    expect(container.querySelector('ul')).not.toBeNull();
    expect(screen.getAllByText('یزد').length).toBeGreaterThan(0);
  });

  it('draws a missing figure as a gap, never as a zero', () => {
    const { container } = render(
      <ArticleChart
        attrs={{ ...base, kind: 'line', series: [{ label: 'اصفهان', values: [10, null, 30] }] }}
        idBase="c4"
      />,
    );
    // Two separate move-tos = the line is broken at the gap rather than
    // dipping to the floor and back.
    const path = container.querySelector('path[stroke-width="2"]')!;
    expect((path.getAttribute('d') ?? '').match(/M /g)).toHaveLength(2);
    expect(screen.getAllByRole('cell').map((c) => c.textContent)).toContain('—');
  });

  it('anchors bars to zero — a truncated baseline is how a bar chart lies', () => {
    const { container } = render(
      <ArticleChart attrs={{ ...base, series: [{ label: 'x', values: [100, 102, 101] }] }} idBase="c5" />,
    );
    // With a zero baseline the axis has to include 0; a zoomed one would start
    // near 100 and make a 2% spread look like a fivefold difference.
    const axisLabels = Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
    expect(axisLabels).toContain('۰');
  });

  it('says so plainly when there is nothing to draw yet', () => {
    render(<ArticleChart attrs={{ ...base, labels: [], series: [] }} idBase="c6" />);
    expect(screen.getByText(/هنوز داده‌ای/)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders the source line when one is given', () => {
    render(<ArticleChart attrs={{ ...base, source: 'بورس کالا' }} idBase="c7" />);
    expect(screen.getByText(/بورس کالا/)).toBeInTheDocument();
  });
});
