import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PriceRow } from '@/lib/types/domain';
import type { SubCat } from '@/lib/data/nav';
import { PriceTable } from './PriceTable';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/prices/angle-channel',
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * نبشی و ناودانی after the owner's 1405/06 request: «جای گرید بنویسیم شاخه که
 * ما اونجا مثلا بنویسیم ۶ متری یا ۱۲ متری». Relabelled 1405/06/08 after the
 * owner confirmed matching ahanonline.com's exact columns overrides that
 * original wording — verified per sub against the live ahanonline.com page:
 *
 * - نبشی/ناودانی (5 subs): ahanonline shows this exact fact under «حالت»,
 *   not «شاخه» — its cells read «۶ متری»/«۱۲ متری» too.
 * - سپری: ahanonline's own page uses a THIRD label, «طول شاخه» — the same
 *   AttrKey لوله/پروفیل already use, printed «۶ متر» not «۶ متری».
 * - وال پست: unchanged reasoning, still keeps its `grade` value (that column
 *   genuinely holds «ضخامت ۲» on all 8 live rows, confirmed by the owner) —
 *   but ahanonline's وال‌پست page confirms it as a «ضخامت» column, so it is
 *   now labelled that instead of «گرید».
 *
 * The swap/relabel costs nothing on the five حالت subs: `grade` is null on
 * every live row of all five, so their «گرید» column was printing «نامشخص»
 * on every row of every page.
 *
 * Sub slugs are the LIVE ones. `data/nav.ts` is a mock fixture by its own
 * header and cannot be trusted for this.
 */
function row(
  id: string,
  subCategoryId: string,
  extra: { grade?: string; branchLengthM?: number; dimensions?: string } = {},
): PriceRow {
  return {
    id,
    subCategoryId,
    categoryId: 'angle-channel',
    slug: id,
    name: id,
    size: '۵',
    factory: 'ناب تبریز',
    unit: 'kg',
    priceBasis: 'kg',
    ...extra,
    current: {
      skuId: id,
      price: 480_000,
      unit: 'kg',
      priceBasis: 'kg',
      deliveryTime: '۲۴ ساعت',
      vatIncluded: false,
      movementDir: 'flat',
      updatedAt: new Date('2026-08-28T09:00:00Z').toISOString(),
      isStale: false,
    },
  } as PriceRow;
}

const SUBS: SubCat[] = [
  { slug: 'nabshi', name: 'نبشی', groupLabel: null },
  { slug: 'angle-unequal', name: 'نبشی بال نامساوی', groupLabel: null },
  { slug: 'spot', name: 'نبشی لقمه', groupLabel: null },
  { slug: 'channel-light', name: 'ناودانی سبک', groupLabel: null },
  { slug: 'channel-heavy', name: 'ناودانی سنگین', groupLabel: null },
  { slug: 'separi', name: 'سپری', groupLabel: null },
  { slug: 'val-post', name: 'وال پست', groupLabel: null },
];

const ROWS = [
  row('nabshi-6', 'nabshi', { branchLengthM: 6 }),
  row('nabshi-12', 'nabshi', { branchLengthM: 12 }),
  row('nabshi-none', 'nabshi'),
  row('channel-6', 'channel-light', { branchLengthM: 6 }),
  row('separi-6', 'separi', { branchLengthM: 6 }),
  row('valpost-1', 'val-post', { grade: 'ضخامت ۲', dimensions: '۷' }),
];

function renderTable(initialSub: string | null = null, rows: PriceRow[] = ROWS) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PriceTable
        rows={rows}
        subs={SUBS}
        categoryName="نبشی و ناودانی"
        categorySlug="angle-channel"
        initialSub={initialSub}
      />
    </QueryClientProvider>,
  );
}

/** The cell under a named column for a given product row. */
function cellFor(product: string, column: string): string {
  const tr = screen.getByRole('rowheader', { name: product }).closest('tr')!;
  const headers = within(tr.closest('table')!).getAllByRole('columnheader');
  const col = headers.findIndex((h) => h.textContent === column);
  expect(col, `column «${column}» is on the table`).toBeGreaterThan(-1);
  return tr.querySelectorAll('td')[col - 1]?.textContent ?? '';
}

describe('PriceTable — نبشی و ناودانی matches ahanonline: «حالت», «طول شاخه», or «ضخامت» instead of «گرید»', () => {
  it('draws «حالت» and drops «گرید» on نبشی', () => {
    renderTable('nabshi');
    expect(screen.getByRole('columnheader', { name: 'حالت' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'گرید' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'شاخه' })).toBeNull();
  });

  it('prints «۶ متری» and «۱۲ متری» under «حالت», not «۶ متر»', () => {
    renderTable('nabshi');
    expect(cellFor('nabshi-6', 'حالت')).toBe('۶ متری');
    expect(cellFor('nabshi-12', 'حالت')).toBe('۱۲ متری');
  });

  it('says «نامشخص» where no length is recorded — never a dash', () => {
    // A نبشی IS sold in some حالت; we just have not recorded this one's.
    renderTable('nabshi');
    expect(cellFor('nabshi-none', 'حالت')).toBe('نامشخص');
  });

  it('does the same on ناودانی', () => {
    renderTable('channel-light');
    expect(cellFor('channel-6', 'حالت')).toBe('۶ متری');
    expect(screen.queryByRole('columnheader', { name: 'گرید' })).toBeNull();
  });

  it('gives سپری its own «طول شاخه» label, matching ahanonline — not «حالت»', async () => {
    const user = userEvent.setup();
    renderTable('nabshi');
    await user.click(screen.getByRole('button', { name: 'سپری' }));
    expect(screen.getByRole('columnheader', { name: 'طول شاخه' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'حالت' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'گرید' })).toBeNull();
    // «طول شاخه» prints «۶ متر», not «۶ متری» — the لوله/پروفیل phrasing.
    expect(cellFor('separi-6', 'طول شاخه')).toBe('۶ متر');
  });

  it('gives وال پست both spec columns its source leads with — «بال» and «ضخامت»', async () => {
    // ahanonline `/نبشی-و-ناودانی/وال-پست/` renders «بال | ضخامت | سایز», بال
    // reading 7 on all 8 priced rows. ضخامت is the one sub whose `grade` holds
    // real data, so relabelling it deletes nothing — the same stored value
    // under ahanonline's word for it, minus the «ضخامت» that string repeats
    // from its own header. «بال» is the `dimensions` field, free on this sub.
    const user = userEvent.setup();
    renderTable('nabshi');
    await user.click(screen.getByRole('button', { name: 'وال پست' }));
    expect(screen.getByRole('columnheader', { name: 'ضخامت' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'بال' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'گرید' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'حالت' })).toBeNull();
    expect(cellFor('valpost-1', 'ضخامت')).toBe('۲');
    expect(cellFor('valpost-1', 'بال')).toBe('۷');
  });

  it('keeps the mixed «همه» view on «گرید», dashing all seven subs', () => {
    // Every sub now reads its own key (حالت, طول شاخه, or ضخامت), so the
    // mixed view's plain «گرید» default applies to none of their rows —
    // same rule پروفیل's mixed view follows for صنعتی and Z.
    renderTable(null);
    expect(screen.getByRole('columnheader', { name: 'گرید' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'حالت' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'طول شاخه' })).toBeNull();
    expect(cellFor('valpost-1', 'گرید')).toBe('—');
    expect(cellFor('nabshi-6', 'گرید')).toBe('—');
  });

  it('does not touch the «وزن شاخه» column it now sits beside', () => {
    // Two similarly-named columns: «حالت» is the length sold, «وزن شاخه» is
    // the theoretical weight. They must both exist and stay distinct.
    renderTable('nabshi');
    expect(screen.getByRole('columnheader', { name: 'حالت' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'وزن شاخه' })).toBeInTheDocument();
  });
});
