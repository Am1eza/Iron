import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BreadcrumbJsonLd } from './JsonLd';
import type { Crumb } from '@/components/ui';

type Entry = { '@type': string; position: number; name: string; item?: string };
type Ld = { '@type': string; itemListElement: Entry[] };

/** Parse the single <script type="application/ld+json"> this component emits. */
function ldOf(items: Crumb[]): Ld | null {
  const html = renderToStaticMarkup(<BreadcrumbJsonLd items={items} />);
  if (html === '') return null;
  const body = html.replace(/^.*?ld\+json">/s, '').replace(/<\/script>$/, '');
  // JsonLd escapes every `<` to its JS unicode form so no value can close the
  // tag. That is still valid JSON, so JSON.parse restores it here.
  return JSON.parse(body) as Ld;
}

describe('BreadcrumbJsonLd', () => {
  const trail: Crumb[] = [
    { label: 'خانه', href: '/' },
    { label: 'قیمت‌ها', href: '/prices' },
    { label: 'لوله', href: '/prices/pipe' },
  ];

  it('emits an item for the current page, not just its name', () => {
    // Regression (GSC review, 1405/05): every category, sub-category, facet
    // and article page shipped a terminal ListItem of the shape
    // `{"@type":"ListItem","position":3,"name":"لوله"}` — no `item`.
    const ld = ldOf(trail)!;
    expect(ld['@type']).toBe('BreadcrumbList');
    expect(ld.itemListElement).toHaveLength(3);
    expect(ld.itemListElement[2]).toEqual({
      '@type': 'ListItem',
      position: 3,
      name: 'لوله',
      item: 'https://ahantime.com/prices/pipe',
    });
  });

  it('renders nothing at all for an empty trail', () => {
    expect(ldOf([])).toBeNull();
  });

  it('renders nothing for a trail that reduces to a single node', () => {
    // A one-item BreadcrumbList states no relationship; emitting it is noise
    // Google reports as an incomplete list.
    expect(ldOf([{ label: 'خانه', href: '/' }, { label: 'ابزارها' }])).toBeNull();
  });
});
