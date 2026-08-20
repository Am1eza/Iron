/**
 * «محصولات» mega-menu — the two properties that were actually broken.
 *
 * 1. Every category's sub-category links are in the DOM whether or not the
 *    menu is open. The menu used to be `ssr: false` AND mounted-on-open, so
 *    ~90 internal links existed only after a hover; nothing that reads HTML
 *    ever saw the catalog.
 * 2. A group whose label is also the name of one of its members renders that
 *    member AS the heading — one link — instead of a dead «چهارپهلو» caption
 *    stacked on an identical «چهارپهلو» link.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ProductsMenu } from './ProductsMenu';
import type { Category } from '@/lib/types/domain';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('@/components/catalog/ProductImage', () => ({ ProductImage: () => null }));
vi.mock('@/components/catalog/CategoryArt', () => ({ CategoryArt: () => null }));

const cat = (slug: string, name: string, order: number): Category => ({
  id: slug,
  slug,
  name,
  order,
  iconId: '',
  isActive: true,
});

const categories = [
  cat('profile', 'پروفیل و قوطی', 1),
  cat('angle-channel', 'نبشی و ناودانی', 2),
];

const subs = {
  profile: [
    { slug: 'chaharpahlu', name: 'چهارپهلو', groupLabel: 'چهارپهلو' },
    { slug: 'chaharpahlu-alloy', name: 'چهارپهلو آلیاژی', groupLabel: 'چهارپهلو' },
    { slug: 'profil-z', name: 'پروفیل Z', groupLabel: null },
  ],
  'angle-channel': [{ slug: 'nabshi', name: 'نبشی', groupLabel: null }],
};

describe('ProductsMenu', () => {
  it('puts every category and sub-category link in the DOM without opening the menu', () => {
    render(<ProductsMenu categories={categories} subs={subs} />);
    // Menu is closed: the panel is `hidden`, so getByRole would (correctly)
    // not find these. The point of the test is that the ANCHORS exist for a
    // crawler, which is a DOM question, not an accessibility-tree one.
    const hrefs = [...document.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(
      expect.arrayContaining([
        '/prices/profile',
        '/prices/profile/chaharpahlu',
        '/prices/profile/chaharpahlu-alloy',
        '/prices/profile/profil-z',
        '/prices/angle-channel',
        '/prices/angle-channel/nabshi',
      ]),
    );
  });

  it('renders a group whose label names one of its members as a single link, not a duplicate', () => {
    render(<ProductsMenu categories={categories} subs={subs} />);
    const named = [...document.querySelectorAll('a')].filter(
      (a) => a.textContent?.trim() === 'چهارپهلو',
    );
    // Exactly one «چهارپهلو» — the heading IS the link. Before the fix there
    // was a plain-text «چهارپهلو» heading plus a «چهارپهلو» link beneath it.
    expect(named).toHaveLength(1);
    expect(named[0]).toHaveAttribute('href', '/prices/profile/chaharpahlu');
    expect(
      [...document.querySelectorAll('p')].filter((p) => p.textContent?.trim() === 'چهارپهلو'),
    ).toHaveLength(0);
  });

  it('opens on click and names the panel by the active category', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<ProductsMenu categories={categories} subs={subs} />);

    const trigger = screen.getByRole('button', { name: /محصولات/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // First category is active by default when the path matches none.
    const panel = document.querySelector('[data-active-panel]') as HTMLElement;
    expect(within(panel).getByRole('heading', { level: 2 })).toHaveTextContent('پروفیل و قوطی');
    // Descriptive "see all" text, not a generic «مشاهده».
    expect(within(panel).getByRole('link', { name: /قیمت روز پروفیل و قوطی/ })).toHaveAttribute(
      'href',
      '/prices/profile',
    );
  });

  it('shows every top-level category in the rail with its sub-category count', () => {
    render(<ProductsMenu categories={categories} subs={subs} />);
    const rail = document.querySelector('nav[aria-label="دسته‌بندی‌های اصلی"]') as HTMLElement;
    const items = rail.querySelectorAll('li');
    expect(items).toHaveLength(categories.length);
    // Persian digits, per the localisation rules.
    expect(items[0]!.textContent).toContain('۳');
    expect(items[1]!.textContent).toContain('۱');
  });
});
