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
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileDrawer } from './MobileDrawer';
import { useUiStore } from '@/lib/stores/ui';
import type { Category } from '@/lib/types/domain';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

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
    const all = screen.getByRole('link', { name: /مشاهده همه ورق/ });
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

  it('draws a decorative section glyph beside each sub-category', async () => {
    const user = userEvent.setup();
    await openProducts(user);
    await user.click(screen.getByRole('button', { name: 'زیردسته‌های ورق' }));

    const link = screen.getByRole('link', { name: 'گالوانیزه' });
    expect(link.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
    // The glyph adds no text, so the link's accessible name is still the
    // Persian label alone — which is what the assertion above already proves.
    expect(link.textContent?.trim()).toBe('گالوانیزه');
  });
});
