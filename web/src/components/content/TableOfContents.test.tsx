import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TableOfContents, tocItems } from './TableOfContents';
import type { RichDoc } from '@/lib/content/richDoc';

const doc = (content: RichDoc['content']): RichDoc => ({ type: 'doc', content });
const text = (t: string) => ({ type: 'text' as const, text: t });
const p = (t: string) => ({ type: 'paragraph' as const, content: [text(t)] });
const h = (level: 2 | 3, t: string) => ({ type: 'heading' as const, attrs: { level }, content: [text(t)] });

describe('TableOfContents', () => {
  it('lists every top-level (h2) heading as a jump link, ids by block index', () => {
    render(
      <TableOfContents
        doc={doc([p('مقدمه'), h(2, 'بخش اول'), p('...'), h(2, 'بخش دوم'), h(3, 'زیربخش')])}
      />,
    );
    const l1 = screen.getByRole('link', { name: 'بخش اول' });
    const l2 = screen.getByRole('link', { name: 'بخش دوم' });
    expect(l1).toHaveAttribute('href', '#heading-1');
    expect(l2).toHaveAttribute('href', '#heading-3');
  });

  it('nests h3s under their parent h2, collapsed by default', () => {
    const { container } = render(
      <TableOfContents
        doc={doc([h(2, 'بخش اول'), h(2, 'بخش دوم'), h(3, 'زیربخش')])}
      />,
    );
    // The h3 link exists in the DOM (still crawlable/no-JS-required to reach
    // via a real click) but sits inside a closed <details> — a 25+ heading
    // article no longer dumps every h2 AND h3 into the first viewport.
    const groupDetails = container.querySelectorAll('details');
    expect(groupDetails).toHaveLength(1);
    expect(groupDetails[0]).not.toHaveAttribute('open');
    const sub = groupDetails[0]!.querySelector('a[href="#heading-2"]');
    expect(sub).toHaveTextContent('زیربخش');
    // An h2 with no h3 children gets no disclosure at all.
    expect(screen.getByRole('link', { name: 'بخش اول' }).closest('li')?.querySelector('details')).toBeNull();
  });

  it('caps the default top-level list and tucks the rest behind one more disclosure', () => {
    const headings = Array.from({ length: 10 }, (_, i) => h(2, `بخش ${i + 1}`));
    const { container } = render(<TableOfContents doc={doc(headings)} />);
    // 8 visible h2 links + one "N more" disclosure holding the remaining 2.
    for (let i = 1; i <= 8; i++) expect(screen.getByRole('link', { name: `بخش ${i}` })).toBeInTheDocument();
    const moreDetails = container.querySelectorAll(':scope > nav > ol > li > details');
    // one h3-reveal disclosure doesn't exist here (no h3s) — the only
    // <details> at this level is the "N more" one.
    expect(moreDetails).toHaveLength(1);
    expect(moreDetails[0]).not.toHaveAttribute('open');
    expect(moreDetails[0]!.querySelector('a[href="#heading-8"]')).toHaveTextContent('بخش 9');
    expect(moreDetails[0]!.querySelector('a[href="#heading-9"]')).toHaveTextContent('بخش 10');
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
