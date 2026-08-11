import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NewsTopicRail } from './NewsTopicRail';
import type { NewsTopicRailItem } from '@/lib/server/catalog';

const rates: NewsTopicRailItem = { slug: 'rates-exchange', name: 'نرخ‌ها و بورس کالا', count: 5 };
const production: NewsTopicRailItem = { slug: 'production-mills', name: 'تولید و کارخانه‌ها', count: 2 };

describe('NewsTopicRail', () => {
  it('renders nothing when there are no topics with articles', () => {
    const { container } = render(<NewsTopicRail items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('links each chip to its topic page, with the name and Persian-digit count', () => {
    render(<NewsTopicRail items={[rates]} />);
    const link = screen.getByRole('link', { name: /نرخ‌ها و بورس کالا/ });
    expect(link).toHaveAttribute('href', '/news/topic/rates-exchange');
    expect(screen.getByText('۵')).toBeInTheDocument();
  });

  it('marks the active topic current, and no other', () => {
    render(<NewsTopicRail items={[rates, production]} activeSlug="rates-exchange" />);
    expect(screen.getByRole('link', { name: /نرخ‌ها و بورس کالا/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /تولید و کارخانه‌ها/ })).not.toHaveAttribute('aria-current');
  });
});
