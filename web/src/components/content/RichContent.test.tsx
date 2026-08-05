import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { RichContent } from './RichContent';
import type { RichDoc } from '@/lib/content/richDoc';

const doc = (content: RichDoc['content']): RichDoc => ({ type: 'doc', content });
const text = (t: string) => ({ type: 'text' as const, text: t });
const p = (t: string) => ({ type: 'paragraph' as const, content: [text(t)] });

describe('RichContent — blocks (US-12.4)', () => {
  it('renders headings at the levels the schema allows and no others', () => {
    render(
      <RichContent
        doc={doc([
          { type: 'heading', attrs: { level: 2 }, content: [text('عنوان')] },
          { type: 'heading', attrs: { level: 3 }, content: [text('زیرعنوان')] },
        ])}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'عنوان' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'زیرعنوان' })).toBeInTheDocument();
    // h1 belongs to the article title, which the PAGE renders — a body that
    // could emit one would break the document outline on every article.
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('does not render ProseMirror’s trailing empty paragraph as a blank line', () => {
    const { container } = render(<RichContent doc={doc([p('متن'), { type: 'paragraph' }])} />);
    expect(container.querySelectorAll('p')).toHaveLength(1);
  });

  it('gives a table a real <thead> when its first row is all header cells', () => {
    render(
      <RichContent
        doc={doc([
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  { type: 'tableHeader', content: [p('سایز')] },
                  { type: 'tableHeader', content: [p('وزن')] },
                ],
              },
              {
                type: 'tableRow',
                content: [
                  { type: 'tableCell', content: [p('۱۴')] },
                  { type: 'tableCell', content: [p('۱٫۲۱')] },
                ],
              },
            ],
          },
        ])}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'سایز' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '۱۴' })).toBeInTheDocument();
    // The scroll container must be reachable by keyboard (WCAG 2.1.1) and
    // must announce itself when it is.
    expect(screen.getByRole('region', { name: 'جدول مطلب' })).toHaveAttribute('tabindex', '0');
  });

  it('honours colspan without inventing one for ordinary cells', () => {
    render(
      <RichContent
        doc={doc([
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  { type: 'tableCell', attrs: { colspan: 2 }, content: [p('کل')] },
                  { type: 'tableCell', content: [p('تک')] },
                ],
              },
            ],
          },
        ])}
      />,
    );
    expect(screen.getByRole('cell', { name: 'کل' })).toHaveAttribute('colspan', '2');
    expect(screen.getByRole('cell', { name: 'تک' })).not.toHaveAttribute('colspan');
  });

  it('associates a caption with its picture through <figure>', () => {
    const { container } = render(
      <RichContent
        doc={doc([{ type: 'image', attrs: { src: '/uploads/a.png', alt: 'میلگرد آجدار', caption: 'انبار مرکزی' } }])}
      />,
    );
    const figure = container.querySelector('figure')!;
    expect(within(figure).getByRole('img', { name: 'میلگرد آجدار' })).toBeInTheDocument();
    expect(figure.querySelector('figcaption')).toHaveTextContent('انبار مرکزی');
  });

  it('keeps a deliberately decorative image out of the accessibility tree', () => {
    render(<RichContent doc={doc([{ type: 'image', attrs: { src: '/uploads/a.png', alt: '', decorative: true } }])} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('refuses to build an <img> from a scheme that can execute', () => {
    render(<RichContent doc={doc([{ type: 'image', attrs: { src: 'javascript:alert(1)', alt: 'x' } }])} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('marks external links nofollow and leaves internal ones clean', () => {
    render(
      <RichContent
        doc={doc([
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'بیرونی', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
              { type: 'text', text: 'داخلی', marks: [{ type: 'link', attrs: { href: '/prices' } }] },
            ],
          },
        ])}
      />,
    );
    expect(screen.getByRole('link', { name: 'بیرونی' }).getAttribute('rel')).toContain('nofollow');
    expect(screen.getByRole('link', { name: 'داخلی' }).getAttribute('rel')).not.toContain('nofollow');
  });

  it('renders a chart block through the shared chart component', () => {
    render(
      <RichContent
        doc={doc([
          {
            type: 'chart',
            attrs: {
              kind: 'bar',
              title: 'قیمت میلگرد',
              unit: 'تومان',
              labels: ['فروردین', 'اردیبهشت'],
              series: [{ label: 'اصفهان', values: [24000, 25000] }],
            },
          },
        ])}
      />,
    );
    expect(screen.getByText('قیمت میلگرد')).toBeInTheDocument();
    expect(screen.getByRole('img')).toBeInTheDocument();
  });
});
