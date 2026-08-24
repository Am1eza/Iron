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

/** The «بیشتر» export disclosure's `<summary>` trigger, found directly rather
 *  than through a role query — `<summary>` has no reliably-recognised ARIA
 *  role across environments, so structural presence/absence and open/close
 *  go through the DOM node itself. */
function exportTrigger(scopeLabel?: string): HTMLElement | null {
  const label = scopeLabel ? `بیشتر ${scopeLabel}` : 'بیشتر';
  return document.querySelector<HTMLElement>(`summary[aria-label="${label}"]`);
}
function openExportMenu(scopeLabel?: string) {
  fireEvent.click(exportTrigger(scopeLabel)!);
}

describe('PriceTable — per-factory controls', () => {
  it('gives every factory section its own export menu, alongside the page-wide one', () => {
    renderTable(TWO_FACTORIES);
    for (const factory of [KAVIR, ZOB]) {
      expect(exportTrigger(factory)).not.toBeNull();
      openExportMenu(factory);
      expect(screen.getByRole('group', { name: `خروجی جدول ${factory}` })).toBeInTheDocument();
    }
    openExportMenu();
    expect(screen.getByRole('group', { name: 'خروجی جدول' })).toBeInTheDocument();
  });

  it('names the per-factory export buttons so they are distinguishable', () => {
    // Three identical «اکسل» buttons per page was the whole a11y problem: the
    // visible text stays short, the accessible name carries the scope.
    renderTable(TWO_FACTORIES);
    openExportMenu(ZOB);
    const menu = screen.getByRole('group', { name: `خروجی جدول ${ZOB}` });
    for (const label of ['اکسل', 'چاپ', 'تصویر']) {
      const btn = within(menu).getByRole('button', { name: `${label} ${ZOB}` });
      // WCAG 2.2 §2.5.3 — the accessible name still contains the visible text.
      expect(btn.textContent).toContain(label);
    }
  });

  it('omits the per-factory export when there is only one factory', () => {
    // The page-wide toolbar already covers exactly these rows; a second
    // identical export three lines below it is noise. Same rule the
    // quick-jump nav follows.
    renderTable([row('kavir-14', KAVIR, 500_000), row('kavir-16', KAVIR, 510_000)]);
    expect(exportTrigger(KAVIR)).toBeNull();
    expect(exportTrigger()).not.toBeNull();
  });

  it('keeps the per-factory export out of the section <summary>, where it would fight the disclosure', () => {
    renderTable(TWO_FACTORIES);
    const trigger = exportTrigger(KAVIR)!;
    // CSS Modules hash class names but keep the source name as a substring
    // (`_factoryBody_xxxxxx`), so a `[class*=…]` match survives the hash.
    expect(trigger.closest('[class*="factoryBody"]')).not.toBeNull();
    expect(trigger.closest('[class*="factorySummary"]')).toBeNull();
  });

  it('has exactly one «با ارزش‌افزوده» switch on the page — no per-factory copy', () => {
    // The audit's finding: a per-factory VAT override sat next to the
    // page-wide one and could silently disagree with it. There is now one
    // switch, full stop.
    renderTable(TWO_FACTORIES);
    expect(screen.getAllByRole('switch', { name: 'با ارزش‌افزوده' })).toHaveLength(1);
    for (const factory of [KAVIR, ZOB]) {
      expect(screen.queryByRole('switch', { name: `با ارزش‌افزوده — ${factory}` })).toBeNull();
    }
  });

  it('moves every section at once from the one page-wide toggle', () => {
    renderTable(TWO_FACTORIES);
    expect(pricesOnScreen()).toContain('۵۰۰٬۰۰۰');
    expect(pricesOnScreen()).toContain('۶۰۰٬۰۰۰');

    fireEvent.click(screen.getByRole('switch', { name: 'با ارزش‌افزوده' }));

    const after = pricesOnScreen();
    expect(after).toContain('۵۵۰٬۰۰۰'); // کویر, +۱۰٪
    expect(after).toContain('۶۶۰٬۰۰۰'); // ذوب آهن, +۱۰٪
    expect(after).not.toContain('۵۰۰٬۰۰۰');
    expect(after).not.toContain('۶۰۰٬۰۰۰');
  });
});
