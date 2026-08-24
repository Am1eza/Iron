import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PriceRow } from '@/lib/types/domain';
import type { SubCat } from '@/lib/data/nav';
import { PriceTable } from './PriceTable';

// Nothing under test navigates; the toolbar only reads the search params to
// pre-select a sub-category on a deep link.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/prices/rebar',
  useSearchParams: () => new URLSearchParams(),
}));

function row(id: string, factory: string, price: number): PriceRow {
  return {
    id,
    subCategoryId: 'ribbed',
    categoryId: 'rebar',
    slug: id,
    name: id,
    size: '۱۴',
    factory,
    unit: 'kg',
    isActive: true,
    current: {
      skuId: id,
      price,
      unit: 'kg',
      deliveryTime: '۲۴ ساعت',
      vatIncluded: false,
      movementDir: 'flat',
      updatedAt: new Date('2026-08-13T09:00:00Z').toISOString(),
      isStale: false,
    },
  } as PriceRow;
}

const SUBS: SubCat[] = [{ slug: 'ribbed', name: 'آجدار', groupLabel: null }];

const KAVIR = 'فولاد کویر کاشان';
const ZOB = 'ذوب آهن اصفهان';

function renderTable(rows: PriceRow[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PriceTable rows={rows} subs={SUBS} categoryName="میلگرد" categorySlug="rebar" />
    </QueryClientProvider>,
  );
}

/** Two mills at deliberately different prices so a VAT-inclusive cell for one
 *  can never be confused with a bare cell for the other. */
const TWO_FACTORIES = [row('kavir-14', KAVIR, 500_000), row('zob-14', ZOB, 600_000)];

/** Every price cell currently on screen. One per row now: the table used to be
 *  shadowed by a full mobile-card copy of itself, and both were always in the
 *  DOM with CSS hiding one. */
const pricesOnScreen = () => screen.queryAllByText(/^[۰-۹٬]+$/).map((n) => n.textContent);

describe('PriceTable — per-factory controls', () => {
  it('gives every factory section its own VAT toggle and export menu', () => {
    renderTable(TWO_FACTORIES);
    for (const factory of [KAVIR, ZOB]) {
      expect(screen.getByRole('switch', { name: `با ارزش‌افزوده — ${factory}` })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: `خروجی جدول ${factory}` })).toBeInTheDocument();
    }
    // …alongside, not instead of, the page-wide pair.
    expect(screen.getByRole('switch', { name: 'با ارزش‌افزوده' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'خروجی جدول' })).toBeInTheDocument();
  });

  it('names the per-factory export buttons so they are distinguishable', () => {
    // Three identical «اکسل» buttons per page was the whole a11y problem: the
    // visible text stays short, the accessible name carries the scope.
    renderTable(TWO_FACTORIES);
    const menu = screen.getByRole('group', { name: `خروجی جدول ${ZOB}` });
    for (const label of ['اکسل', 'چاپ', 'تصویر']) {
      const btn = within(menu).getByRole('button', { name: `${label} ${ZOB}` });
      // WCAG 2.2 §2.5.3 — the accessible name still contains the visible text.
      expect(btn.textContent).toContain(label);
    }
  });

  it('applies a factory toggle to that factory only, leaving the others bare', () => {
    renderTable(TWO_FACTORIES);
    expect(pricesOnScreen()).toContain('۵۰۰٬۰۰۰');
    expect(pricesOnScreen()).toContain('۶۰۰٬۰۰۰');

    fireEvent.click(screen.getByRole('switch', { name: `با ارزش‌افزوده — ${KAVIR}` }));

    const after = pricesOnScreen();
    expect(after).toContain('۵۵۰٬۰۰۰'); // کویر, +۱۰٪
    expect(after).toContain('۶۰۰٬۰۰۰'); // ذوب آهن, untouched
    expect(after).not.toContain('۵۰۰٬۰۰۰');
  });

  it('moves every section at once from the page-wide toggle', () => {
    renderTable(TWO_FACTORIES);
    fireEvent.click(screen.getByRole('switch', { name: 'با ارزش‌افزوده' }));
    const after = pricesOnScreen();
    expect(after).toContain('۵۵۰٬۰۰۰');
    expect(after).toContain('۶۶۰٬۰۰۰');
  });

  it('lets the page-wide toggle win over a section a visitor had already changed', () => {
    // Otherwise a section overridden ten minutes ago silently keeps disagreeing
    // with the switch just flipped, with nothing on screen to explain why.
    renderTable(TWO_FACTORIES);
    fireEvent.click(screen.getByRole('switch', { name: `با ارزش‌افزوده — ${KAVIR}` }));
    expect(pricesOnScreen()).toContain('۵۵۰٬۰۰۰');

    // Page-wide ON: both sections show VAT, including the overridden one…
    fireEvent.click(screen.getByRole('switch', { name: 'با ارزش‌افزوده' }));
    expect(pricesOnScreen()).toEqual(expect.arrayContaining(['۵۵۰٬۰۰۰', '۶۶۰٬۰۰۰']));

    // …and page-wide OFF takes it back down again rather than stranding it.
    fireEvent.click(screen.getByRole('switch', { name: 'با ارزش‌افزوده' }));
    const after = pricesOnScreen();
    expect(after).toContain('۵۰۰٬۰۰۰');
    expect(after).toContain('۶۰۰٬۰۰۰');
    expect(after).not.toContain('۵۵۰٬۰۰۰');
  });

  it('keeps the section switch in sync with the page-wide one it follows', () => {
    renderTable(TWO_FACTORIES);
    fireEvent.click(screen.getByRole('switch', { name: 'با ارزش‌افزوده' }));
    for (const factory of [KAVIR, ZOB]) {
      expect(screen.getByRole('switch', { name: `با ارزش‌افزوده — ${factory}` })).toBeChecked();
    }
  });

  it('omits the per-factory controls when there is only one factory', () => {
    // The page-wide toolbar already covers exactly these rows; a second
    // identical pair three lines below it is noise. Same rule the quick-jump
    // nav follows.
    renderTable([row('kavir-14', KAVIR, 500_000), row('kavir-16', KAVIR, 510_000)]);
    expect(screen.queryByRole('switch', { name: `با ارزش‌افزوده — ${KAVIR}` })).toBeNull();
    expect(screen.queryByRole('group', { name: `خروجی جدول ${KAVIR}` })).toBeNull();
    expect(screen.getByRole('switch', { name: 'با ارزش‌افزوده' })).toBeInTheDocument();
  });

  it('keeps the controls out of <summary>, where they would fight the disclosure', () => {
    renderTable(TWO_FACTORIES);
    const toggle = screen.getByRole('switch', { name: `با ارزش‌افزوده — ${KAVIR}` });
    expect(toggle.closest('summary')).toBeNull();
    expect(toggle.closest('details')).not.toBeNull();
  });
});
