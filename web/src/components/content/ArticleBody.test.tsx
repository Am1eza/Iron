import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarkdownProse } from './ArticleBody';

describe('MarkdownProse — inline formatting (W25)', () => {
  it('renders bold and italic without one swallowing the other', () => {
    render(<MarkdownProse md="این **پررنگ** و این *مورب* است." />);
    const strong = screen.getByText('پررنگ');
    expect(strong.tagName).toBe('STRONG');
    const em = screen.getByText('مورب');
    expect(em.tagName).toBe('EM');
  });

  it('does not italicise a lone `*` left inside an unbalanced bold run', () => {
    // Locks the behaviour of the ES5-compatible `(^|[^*])` guard that replaced
    // the `(?<!\*)` lookbehind (lookbehind is a SYNTAX error in Safari < 16.4,
    // which blanked the whole article page rather than degrading).
    render(<MarkdownProse md="متن **الف*ب** پایان" />);
    expect(document.querySelector('em')).toBeNull();
  });

  it('keeps the character before an italic run instead of eating it', () => {
    render(<MarkdownProse md="الف*ب* پایان" />);
    expect(document.querySelector('em')).toHaveTextContent('ب');
    expect(screen.getByText(/الف/)).toBeInTheDocument();
  });

  it('links an http(s) href and marks external links noreferrer/nofollow', () => {
    render(<MarkdownProse md="[قیمت میلگرد](https://ahantime.com/prices/rebar)" />);
    const a = screen.getByRole('link', { name: 'قیمت میلگرد' });
    expect(a).toHaveAttribute('href', 'https://ahantime.com/prices/rebar');
    expect(a.getAttribute('rel')).toContain('noreferrer');
    expect(a.getAttribute('rel')).toContain('nofollow');
  });

  it('keeps a relative link clean (no nofollow on our own pages)', () => {
    render(<MarkdownProse md="[صفحهٔ قیمت](/prices/rebar)" />);
    const a = screen.getByRole('link', { name: 'صفحهٔ قیمت' });
    expect(a).toHaveAttribute('href', '/prices/rebar');
    expect(a.getAttribute('rel')).not.toContain('nofollow');
  });

  it('rejects a javascript: link but keeps the label as plain text', () => {
    render(<MarkdownProse md="[کلیک کن](javascript:alert(1))" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('کلیک کن')).toBeInTheDocument();
  });

  it('rejects a data: link the same way', () => {
    render(<MarkdownProse md="[باز کن](data:text/html,<script>alert(1)</script>)" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('MarkdownProse — block types (W25)', () => {
  it('renders an h3 and an ordered list', () => {
    render(<MarkdownProse md={'### زیرعنوان\n\n1. اول\n2. دوم'} />);
    expect(screen.getByRole('heading', { level: 3, name: 'زیرعنوان' })).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['اول', 'دوم']);
  });

  it('renders a GFM pipe table — the weight-guide article is named after this', () => {
    render(<MarkdownProse md={'| سایز | وزن |\n| --- | --- |\n| ۱۴ | ۱٫۲۱ |'} />);
    expect(screen.getByRole('columnheader', { name: 'سایز' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '۱۴' })).toBeInTheDocument();
  });

  it('renders a standalone image line as an <img>, not a paragraph', () => {
    render(<MarkdownProse md="![نمودار قیمت](https://ahantime.com/uploads/chart.png)" />);
    const img = screen.getByRole('img', { name: 'نمودار قیمت' });
    expect(img).toHaveAttribute('src', 'https://ahantime.com/uploads/chart.png');
  });

  it('does not turn a javascript: image src into a real <img>', () => {
    render(<MarkdownProse md="![x](javascript:alert(1))" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
