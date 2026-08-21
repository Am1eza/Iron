/**
 * The «محصولات» branch of the mobile drawer.
 *
 * The drawer is the ONLY product navigation on a phone — the header nav is
 * replaced entirely below the desktop breakpoint — so the properties tested
 * here are the difference between a browsable catalog and a list of nine dead
 * ends: that a category's sub-categories can be revealed IN PLACE, that
 * revealing them never costs the one-tap route to the category's own price
 * table, and that the nested disclosure reports its state to assistive tech.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileDrawer } from './MobileDrawer';
import { useUiStore } from '@/lib/stores/ui';
import type { Category } from '@/lib/types/domain';

// Hoisted so the mock factory (which vitest lifts above the imports) can read
// it, and so one test can put the drawer on a real category page.
const nav = vi.hoisted(() => ({ path: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.path }));

afterEach(() => {
  nav.path = '/';
});

const cat = (slug: string, name: string, order: number): Category => ({
  id: slug,
  slug,
  name,
  order,
  iconId: '',
  isActive: true,
});

const categories = [cat('sheet', 'ورق', 1), cat('rebar', 'میلگرد', 2)];

const subs = {
  sheet: [
    { slug: 'black', name: 'سیاه', groupLabel: 'ورق سیاه و روغنی' },
    { slug: 'oiled', name: 'روغنی', groupLabel: 'ورق سیاه و روغنی' },
    { slug: 'galvanized', name: 'گالوانیزه', groupLabel: 'ورق‌های روکش‌دار' },
  ],
  rebar: [{ slug: 'deformed', name: 'میلگرد آجدار', groupLabel: null }],
};

/**
 * Open the drawer, then its «محصولات» accordion.
 *
 * The store is opened AFTER the first render, not before it: zustand hands
 * React its untouched initial state as the server snapshot, so a `setState`
 * that runs before mount is invisible to that first render and the drawer
 * would come back closed no matter what `getState()` reports.
 */
async function openProducts(user: ReturnType<typeof userEvent.setup>) {
  render(<MobileDrawer categories={categories} subs={subs} />);
  act(() => useUiStore.getState().setDrawerOpen(true));
  await user.click(screen.getByRole('button', { name: 'محصولات' }));
}

describe('MobileDrawer · products', () => {
  it('reveals a category’s sub-categories in place instead of only navigating away', async () => {
    const user = userEvent.setup();
    await openProducts(user);

    // Collapsed: the category is a link to its price table and nothing else.
    expect(screen.queryByRole('link', { name: 'گالوانیزه' })).toBeNull();

    const toggle = screen.getByRole('button', { name: 'زیردسته‌های ورق' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    expect(screen.getByRole('link', { name: 'گالوانیزه' })).toHaveAttribute(
      'href',
      '/prices/sheet/galvanized',
    );
  });

  it('keeps the category’s own price table reachable from inside the expanded list', async () => {
    const user = userEvent.setup();
    await openProducts(user);
    await user.click(screen.getByRole('button', { name: 'زیردسته‌های ورق' }));

    // Both routes survive: the collapsed row's link…
    const row = screen.getByRole('link', { name: /^ورق/ });
    expect(row).toHaveAttribute('href', '/prices/sheet');
    // …and a repeat of it inside the list, because on a phone the row above
    // scrolls out of sight as soon as the list opens.
    // Named the way the desktop menu names the same destination — «قیمت روز
    // ورق», not a generic «مشاهده».
    const all = screen.getByRole('link', { name: /قیمت روز ورق/ });
    expect(all).toHaveAttribute('href', '/prices/sheet');
  });

  it('names its sub-category clusters, so a long list is read in blocks', async () => {
    const user = userEvent.setup();
    await openProducts(user);
    await user.click(screen.getByRole('button', { name: 'زیردسته‌های ورق' }));

    const body = document.querySelector('#mobile-drawer-cat-sheet') as HTMLElement;
    const headings = [...body.querySelectorAll('p')].map((p) => p.textContent);
    expect(headings).toEqual(['ورق سیاه و روغنی', 'ورق‌های روکش‌دار']);
    // A heading that names no sub-category is text, never a link — the same
    // rule the desktop menu follows.
    expect(within(body).queryByRole('link', { name: 'ورق سیاه و روغنی' })).toBeNull();
  });

  it('keeps one category open at a time, so the drawer never becomes ~80 rows', async () => {
    const user = userEvent.setup();
    await openProducts(user);

    await user.click(screen.getByRole('button', { name: 'زیردسته‌های ورق' }));
    expect(document.querySelector('#mobile-drawer-cat-sheet')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'زیردسته‌های میلگرد' }));
    expect(document.querySelector('#mobile-drawer-cat-sheet')).toBeNull();
    expect(document.querySelector('#mobile-drawer-cat-rebar')).not.toBeNull();
  });

  it('collapses the open category when the drawer closes', async () => {
    const user = userEvent.setup();
    await openProducts(user);
    await user.click(screen.getByRole('button', { name: 'زیردسته‌های ورق' }));
    expect(document.querySelector('#mobile-drawer-cat-sheet')).not.toBeNull();

    // The drawer is mounted permanently — `if (!open) return null` hides it,
    // it does not unmount — so without an explicit reset the visitor reopens
    // it on the next page with nineteen ورق rows still unfolded.
    act(() => useUiStore.getState().setDrawerOpen(false));
    act(() => useUiStore.getState().setDrawerOpen(true));
    await user.click(screen.getByRole('button', { name: 'محصولات' }));
    expect(document.querySelector('#mobile-drawer-cat-sheet')).toBeNull();
  });

  it('marks the current page on BOTH links that point at it', async () => {
    nav.path = '/prices/sheet';
    const user = userEvent.setup();
    render(<MobileDrawer categories={categories} subs={subs} />);
    act(() => useUiStore.getState().setDrawerOpen(true));
    await user.click(screen.getByRole('button', { name: 'محصولات' }));
    await user.click(screen.getByRole('button', { name: 'زیردسته‌های ورق' }));

    // Expanding ورق puts two links to `/prices/sheet` in one list. A screen
    // reader listing them would otherwise announce the page the visitor is
    // already on, twice, with nothing to say so.
    const row = screen.getByRole('link', { name: /^ورق/ });
    const all = screen.getByRole('link', { name: /قیمت روز ورق/ });
    expect(row).toHaveAttribute('href', '/prices/sheet');
    expect(all).toHaveAttribute('href', '/prices/sheet');
    expect(row).toHaveAttribute('aria-current', 'page');
    expect(all).toHaveAttribute('aria-current', 'page');
    // A sibling category is not marked.
    expect(screen.getByRole('link', { name: /^میلگرد/ })).not.toHaveAttribute('aria-current');
  });

  it('draws a decorative section glyph on the GROUP heading, not on every leaf', async () => {
    const user = userEvent.setup();
    await openProducts(user);
    await user.click(screen.getByRole('button', { name: 'زیردسته‌های ورق' }));

    // «ورق‌های روکش‌دار» heads a group and nothing is named after it, so it is
    // a text heading — and it carries the group's glyph.
    const heading = screen.getByText('ورق‌های روکش‌دار');
    expect(heading.querySelector('[aria-hidden="true"] svg')).not.toBeNull();

    // Its member does NOT. One icon per section, not one per row: at ورق's
    // nineteen rows the per-leaf version was texture, not a scanning aid.
    const leaf = screen.getByRole('link', { name: 'گالوانیزه' });
    expect(leaf.querySelector('[aria-hidden="true"] svg')).toBeNull();
    // The glyph adds no text either way, so the link's accessible name is
    // still the Persian label alone.
    expect(leaf.textContent?.trim()).toBe('گالوانیزه');

    // An UNGROUPED sub-category is its own one-member group, so it keeps its
    // glyph — a shallow category loses nothing to this rule.
    await user.click(screen.getByRole('button', { name: 'زیردسته‌های میلگرد' }));
    const solo = screen.getByRole('link', { name: 'میلگرد آجدار' });
    expect(solo.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
  });

  it('does not paint the sub-category count anywhere a sighted visitor can see it', async () => {
    const user = userEvent.setup();
    await openProducts(user);
    const row = screen.getByRole('link', { name: /^ورق/ });
    // Still announced — «ورق، ۳ زیردسته» — but only from visually-hidden text.
    expect(row.textContent).toContain('۳');
    for (const el of row.querySelectorAll('*')) {
      const ownText = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent ?? '')
        .join('');
      if (/[۰-۹]/.test(ownText)) expect(el).toHaveClass('visually-hidden');
    }
  });
});
