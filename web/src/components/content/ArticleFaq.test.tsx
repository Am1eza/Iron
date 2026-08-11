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
