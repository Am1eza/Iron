import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ArticleCard } from './ArticleCard';
import type { Article } from '@/lib/types/domain';

const article: Article = {
  id: 'a1',
  slug: 'rebar-price-forecast-tir',
  type: 'blog',
  title: 'پیش‌بینی قیمت میلگرد در تیرماه ۱۴۰۵',
  excerpt: 'بررسی عوامل مؤثر بر قیمت میلگرد و چشم‌انداز بازار در هفته‌های پیش‌رو.',
  status: 'published',
  source: 'human',
  publishAt: '2026-06-26T07:00:00.000Z',
  updatedAt: '2026-06-26T07:00:00.000Z',
  tags: [],
};

describe('ArticleCard', () => {
  // The card used to BE the link, so its accessible name was
  // kicker + title + excerpt + date concatenated with no separators — ~35
  // running-together words announced per card while tabbing the grid.
  it('names the link with the title alone', () => {
    render(<ArticleCard article={article} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAccessibleName(article.title);
    expect(link.getAttribute('href')).toBe(`/blog/${article.slug}`);
  });

  it('still shows the excerpt and date as readable text', () => {
    render(<ArticleCard article={article} />);
    expect(screen.getByText(article.excerpt!)).toBeInTheDocument();
    expect(screen.getByRole('link').textContent).not.toContain(article.excerpt);
    expect(document.querySelector('time')).toHaveAttribute('datetime', article.publishAt!);
  });

  it('exposes exactly one link per card', () => {
    render(<ArticleCard article={article} />);
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('links a news item into the news section', () => {
    render(<ArticleCard article={{ ...article, type: 'news' }} />);
    expect(screen.getByRole('link').getAttribute('href')).toBe(`/news/${article.slug}`);
  });

  it('shows a read-time badge when readingMinutes is present', () => {
    render(<ArticleCard article={{ ...article, readingMinutes: 4 }} />);
    expect(screen.getByText('4 دقیقه')).toBeInTheDocument();
  });

  it('omits the read-time badge when readingMinutes is absent — mock catalog has no body', () => {
    render(<ArticleCard article={article} />);
    expect(screen.queryByText(/دقیقه/)).not.toBeInTheDocument();
  });
});
