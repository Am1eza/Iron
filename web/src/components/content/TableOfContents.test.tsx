import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TableOfContents, tocItems } from './TableOfContents';
import type { RichDoc } from '@/lib/content/richDoc';

const doc = (content: RichDoc['content']): RichDoc => ({ type: 'doc', content });
const text = (t: string) => ({ type: 'text' as const, text: t });
const p = (t: string) => ({ type: 'paragraph' as const, content: [text(t)] });
const h = (level: 2 | 3, t: string) => ({ type: 'heading' as const, attrs: { level }, content: [text(t)] });

describe('TableOfContents', () => {
  it('lists every non-empty heading with an anchor to its block index', () => {
    render(
      <TableOfContents
        doc={doc([p('مقدمه'), h(2, 'بخش اول'), p('...'), h(2, 'بخش دوم'), h(3, 'زیربخش')])}
      />,
    );
    const l1 = screen.getByRole('link', { name: 'بخش اول' });
    const l2 = screen.getByRole('link', { name: 'بخش دوم' });
    const l3 = screen.getByRole('link', { name: 'زیربخش' });
    // ids are the block index in doc.content — the same scheme RichContent stamps.
    expect(l1).toHaveAttribute('href', '#heading-1');
    expect(l2).toHaveAttribute('href', '#heading-3');
    expect(l3).toHaveAttribute('href', '#heading-4');
  });

  it('renders nothing for an article with fewer than 3 headings', () => {
    const { container } = render(<TableOfContents doc={doc([h(2, 'یک'), h(2, 'دو'), p('متن')])} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('skips empty headings rather than emitting dead links', () => {
    const items = tocItems(doc([h(2, 'الف'), { type: 'heading', attrs: { level: 2 } }, h(2, 'ب'), h(3, 'ج')]));
    expect(items.map((i) => i.text)).toEqual(['الف', 'ب', 'ج']);
    // the empty heading at index 1 leaves a gap; surviving ids stay index-true.
    expect(items.map((i) => i.id)).toEqual(['heading-0', 'heading-2', 'heading-3']);
  });
});
