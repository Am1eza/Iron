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
import { ProductsMenu, columnsFor } from './ProductsMenu';
import type { Category } from '@/lib/types/domain';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('@/components/catalog/ProductImage', () => ({ ProductImage: () => null }));
vi.mock('@/components/catalog/CategoryArt', () => ({ CategoryArt: () => null }));

const cat = (slug: string, name: string, order: number, description?: string): Category => ({
  id: slug,
  slug,
  name,
  order,
  iconId: '',
  isActive: true,
  ...(description ? { description } : {}),
});

const categories = [
  cat('profile', 'پروفیل و قوطی', 1, 'قوطی و پروفیل چهارپهلو، مبلی و ستونی — برای سازهٔ سبک.'),
  // Deliberately without one: the description is admin-authored and a
  // category that has never been given one must render nothing at all rather
  // than an empty paragraph or a generated stand-in.
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

  it('shows every top-level category in the rail, and its count to SCREEN READERS only', () => {
    render(<ProductsMenu categories={categories} subs={subs} />);
    const rail = document.querySelector('nav[aria-label="دسته‌بندی‌های اصلی"]') as HTMLElement;
    const items = rail.querySelectorAll('li');
    expect(items).toHaveLength(categories.length);
    // The count used to be a visible pill beside every row — internal metadata
    // in a shop window. It still reaches an assistive technology, because
    // "how much is behind this row" is worth knowing before you open it, but
    // every element carrying a digit must be visually-hidden: a digit that
    // renders is the regression this asserts against.
    for (const item of items) {
      const painted = [...item.querySelectorAll('*')].filter(
        (el) =>
          !el.classList.contains('visually-hidden') &&
          !el.closest('.visually-hidden') &&
          [...el.childNodes].some((n) => n.nodeType === 3 && /[۰-۹]/.test(n.textContent ?? '')),
      );
      expect(painted).toHaveLength(0);
    }
    // Persian digits, per the localisation rules, still in the accessible name.
    expect(items[0]!.textContent).toContain('۳');
    expect(items[1]!.textContent).toContain('۱');
    expect(items[0]!.querySelector('.visually-hidden')?.textContent).toContain('زیردسته');
  });

  it('gives a grouped list columns for the LINES it draws, not for its group count', () => {
    // The regression this guards: ورق's nineteen sub-categories collapse into
    // five labelled groups, and the old expression (`groups.length <= 4 ? 1 :
    // …`) then asked for a two-column layout for twenty-four lines — or, at
    // four groups, for a SINGLE 16rem column, stacking the whole category down
    // a panel that caps at 34rem and scrolls. Columns follow the line count.
    const sheet = [cat('sheet', 'ورق', 1)];
    const nineteen = [
      ['black', 'سیاه', 'ورق سیاه و روغنی'],
      ['oiled', 'روغنی', 'ورق سیاه و روغنی'],
      ['pickled', 'اسیدشویی', 'ورق سیاه و روغنی'],
      ['checkered', 'آجدار', 'ورق سیاه و روغنی'],
      ['galvanized', 'گالوانیزه', 'ورق‌های روکش‌دار'],
      ['colored', 'رنگی', 'ورق‌های روکش‌دار'],
      ['aluzinc', 'آلوزینک (گالوالوم)', 'ورق‌های روکش‌دار'],
      ['tin-coated', 'قلع‌اندود', 'ورق‌های روکش‌دار'],
      ['alloy', 'آلیاژی', 'ورق‌های آلیاژی و خاص'],
      ['steel', 'ورق استیل', 'ورق‌های آلیاژی و خاص'],
      ['wear-resistant', 'ورق ضد سایش', 'ورق‌های آلیاژی و خاص'],
      ['marine', 'ورق دریایی', 'ورق‌های آلیاژی و خاص'],
      ['deck', 'عرشه فولادی', 'ورق سقف و سوله'],
      ['sandwich-panel', 'ساندویچ پانل', 'ورق سقف و سوله'],
      ['corrugated', 'ورق کرکره', 'ورق سقف و سوله'],
      ['roofing', 'ورق شیروانی', 'ورق سقف و سوله'],
      ['strip', 'تسمه', 'فرآورده‌های ورق'],
      ['grating', 'گریتینگ', 'فرآورده‌های ورق'],
      ['perforated-black', 'ورق پانچ سیاه', 'فرآورده‌های ورق'],
    ].map(([slug, name, groupLabel]) => ({ slug: slug!, name: name!, groupLabel: groupLabel! }));

    render(<ProductsMenu categories={sheet} subs={{ sheet: nineteen }} />);
    const flow = document.querySelector('[data-cols]') as HTMLElement;
    // 19 links + 5 headings = 24 lines.
    expect(flow.getAttribute('data-cols')).toBe('3');
    // Every label nothing is named renders as a text heading, never a link.
    const headings = [...document.querySelectorAll('p')]
      .map((el) => el.textContent)
      .filter((t) => t?.startsWith('ورق') || t?.startsWith('فرآورده'));
    expect(headings).toHaveLength(5);
    // …and no sub-category was dropped on the way through the grouping.
    expect([...document.querySelectorAll('a[href^="/prices/sheet/"]')]).toHaveLength(19);
  });

  it('scales columns with the line count at the documented boundaries', () => {
    expect(columnsFor(1)).toBe('1');
    expect(columnsFor(4)).toBe('1');
    expect(columnsFor(5)).toBe('2');
    expect(columnsFor(9)).toBe('2');
    expect(columnsFor(10)).toBe('3');
    expect(columnsFor(24)).toBe('3');
  });

  it('never asks for more columns than there are unbreakable blocks to fill them', () => {
    // فلزات رنگی: 13 items in two groups → 15 lines, but `break-inside:
    // avoid` means those two blocks can only ever occupy two columns. Asking
    // for three left the third empty AND, because data-cols=3 is the one
    // bucket with no width cap, pushed آلومینیوم and مس a third of a panel
    // apart.
    expect(columnsFor(15, 2)).toBe('2');
    expect(columnsFor(24, 5)).toBe('3');
    expect(columnsFor(15, 4)).toBe('3');
    // A single group, however long, is one column.
    expect(columnsFor(20, 1)).toBe('1');
    // An ungrouped category is unchanged: every line is its own block.
    expect(columnsFor(19, 19)).toBe('3');
  });

  it('draws a section glyph at GROUP level, hidden from assistive tech', () => {
    render(<ProductsMenu categories={categories} subs={subs} />);
    const links = [...document.querySelectorAll('a[href^="/prices/profile/"]')];
    expect(links).toHaveLength(3);
    const byHref = Object.fromEntries(links.map((a) => [a.getAttribute('href'), a]));

    // «چهارپهلو» is the member promoted to head its own group — a heading, so
    // it carries the glyph…
    expect(
      byHref['/prices/profile/chaharpahlu']!.querySelector('[aria-hidden="true"]'),
    ).not.toBeNull();
    // …and «چهارپهلو آلیاژی», a member of that group, does not. #215 drew one
    // on all nineteen of ورق's rows, which is texture rather than a scanning
    // aid; an icon earns its place where it labels a section.
    expect(
      byHref['/prices/profile/chaharpahlu-alloy']!.querySelector('[aria-hidden="true"]'),
    ).toBeNull();
    // «پروفیل Z» is ungrouped — a one-member group — so it keeps its glyph.
    // This is what stops a shallow category losing its icons to the rule.
    expect(
      byHref['/prices/profile/profil-z']!.querySelector('[aria-hidden="true"]'),
    ).not.toBeNull();

    for (const a of links) {
      // The Persian label stays the link's whole accessible name — an icon
      // that contributed text would make a screen reader say it twice.
      expect(a.textContent?.trim()).not.toBe('');
    }
  });

  it('gives a text group label its own glyph, resolved from a MEMBER not the label', () => {
    // Every ورق group label contains the word «ورق», and resolution is
    // name-first — so labelling from the label itself would draw the same
    // plate glyph over all five groups. The first member is what carries the
    // distinguishing slug (`sheet/galvanized` → the coated-plate drawing).
    const sheet = [cat('sheet', 'ورق', 1)];
    render(
      <ProductsMenu
        categories={sheet}
        subs={{
          sheet: [
            { slug: 'galvanized', name: 'گالوانیزه', groupLabel: 'ورق‌های روکش‌دار' },
            { slug: 'colored', name: 'رنگی', groupLabel: 'ورق‌های روکش‌دار' },
          ],
        }}
      />,
    );
    const heading = [...document.querySelectorAll('p')].find((el) =>
      el.textContent?.includes('ورق‌های روکش‌دار'),
    )!;
    expect(heading.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
    // …and neither member repeats it.
    for (const a of document.querySelectorAll('a[href^="/prices/sheet/"]')) {
      expect(a.querySelector('[aria-hidden="true"]')).toBeNull();
    }
  });

  it('does not let a stray hover swap the panel out from under a keyboard user', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const { fireEvent } = await import('@testing-library/react');
    const user = userEvent.setup();
    render(<ProductsMenu categories={categories} subs={subs} />);
    await user.click(screen.getByRole('button', { name: /محصولات/ }));

    // Keyboard user is inside پروفیل's panel…
    const link = screen.getByRole('link', { name: 'پروفیل Z' });
    link.focus();
    expect(document.activeElement).toBe(link);

    // …and the pointer brushes across the نبشی و ناودانی rail row. Swapping
    // the panel would give پروفیل's `hidden`, which is a display:none, and
    // the browser would drop focus to <body> with nothing announced.
    const rail = document.querySelector('nav[aria-label="دسته‌بندی‌های اصلی"]')!;
    fireEvent.mouseEnter(rail.querySelectorAll('a')[1]!);

    expect(document.activeElement).toBe(link);
    const panel = document.querySelector('[data-active-panel]') as HTMLElement;
    expect(within(panel).getByRole('heading', { level: 2 })).toHaveTextContent('پروفیل و قوطی');
  });

  it('renders the admin-authored category description, and nothing when there is none', () => {
    render(<ProductsMenu categories={categories} subs={subs} />);
    // The panels are `hidden` while the menu is closed, so this is a DOM
    // question — the same reason the link test above queries the DOM directly.
    const text = [...document.querySelectorAll('p')].map((el) => el.textContent);
    expect(text).toContain('قوطی و پروفیل چهارپهلو، مبلی و ستونی — برای سازهٔ سبک.');
    // نبشی و ناودانی's panel exists but contributes no description paragraph.
    expect(text.filter((t) => t && t.includes('—'))).toHaveLength(1);
  });
});
