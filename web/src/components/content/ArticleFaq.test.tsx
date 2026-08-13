import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ArticleFaq } from './ArticleFaq';

describe('ArticleFaq', () => {
  it('renders nothing when there is no FAQ', () => {
    const { container } = render(<ArticleFaq items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders each question and answer', () => {
    render(
      <ArticleFaq
        items={[
          { question: 'میلگرد چیست؟', answer: 'یک مقطع فولادی برای تقویت بتن.' },
          { question: 'گرید A3 چیست؟', answer: 'یک استاندارد کیفیت میلگرد آجدار.' },
        ]}
      />,
    );
    expect(screen.getByText('میلگرد چیست؟')).toBeInTheDocument();
    expect(screen.getByText('یک مقطع فولادی برای تقویت بتن.')).toBeInTheDocument();
    expect(screen.getByText('گرید A3 چیست؟')).toBeInTheDocument();
  });

  it('renders each question closed by default, as a real disclosure', () => {
    const { container } = render(
      <ArticleFaq items={[{ question: 'میلگرد چیست؟', answer: 'یک مقطع فولادی برای تقویت بتن.' }]} />,
    );
    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    // Closed by default — the redesign's whole point is that a reader lands
    // on a scannable list of questions, not every answer pre-expanded.
    expect(details).not.toHaveAttribute('open');
    // A single heading as summary's child, not a hand-rolled button+aria-
    // expanded pair — <details> gets keyboard operability for free.
    expect(details!.querySelector('summary h3')).toHaveTextContent('میلگرد چیست؟');
  });

  it('emits FAQPage JSON-LD matching the visible questions', () => {
    const { container } = render(
      <ArticleFaq items={[{ question: 'سوال؟', answer: 'پاسخ.' }]} />,
    );
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const data = JSON.parse(script!.textContent!);
    expect(data['@type']).toBe('FAQPage');
    expect(data.mainEntity[0].name).toBe('سوال؟');
  });
});
