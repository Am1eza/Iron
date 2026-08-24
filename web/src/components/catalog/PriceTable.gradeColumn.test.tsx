import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PriceRow } from '@/lib/types/domain';
import type { SubCat } from '@/lib/data/nav';
import { PriceTable } from './PriceTable';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/prices/ibeam',
  useSearchParams: () => new URLSearchParams(),
}));

function row(
  id: string,
  subCategoryId: string,
  extra: { grade?: string; standard?: string } = {},
): PriceRow {
  return {
    id,
    subCategoryId,
    categoryId: 'ibeam',
    slug: id,
    name: id,
    size: '۱۴',
    factory: 'ذوب‌آهن اصفهان',
    unit: 'kg',
    isActive: true,
    ...extra,
    current: {
      skuId: id,
      price: 500_000,
      unit: 'kg',
      deliveryTime: '۲۴ ساعت',
      vatIncluded: false,
      movementDir: 'flat',
      updatedAt: new Date('2026-08-13T09:00:00Z').toISOString(),
      isStale: false,
    },
  } as PriceRow;
}

const IBEAM_SUBS: SubCat[] = [
  { slug: 'tirahan', name: 'تیرآهن معمولی', groupLabel: null },
  { slug: 'hash-sabok', name: 'هاش سبک', groupLabel: null },
  { slug: 'hash-sangin', name: 'هاش سنگین', groupLabel: null },
];

/** One factory for every row, so the table renders a single section and each
 *  assertion below is unambiguous about which header it is reading. */
const IBEAM_ROWS = [
  row('hash-a', 'hash-sabok', { standard: 'HEA', grade: 'ST37' }),
  row('hash-b', 'hash-sangin', { standard: 'HEB' }),
  row('hash-empty', 'hash-sabok'),
  row('plain', 'tirahan', { grade: 'ST37' }),
];

function renderTable(props: Partial<Parameters<typeof PriceTable>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PriceTable
        rows={IBEAM_ROWS}
        subs={IBEAM_SUBS}
        categoryName="تیرآهن"
        categorySlug="ibeam"
        {...props}
      />
    </QueryClientProvider>,
  );
}

/** The cell under the grade/standard column for a given product row. */
function cellFor(name: string): string {
  const tr = screen.getByRole('rowheader', { name }).closest('tr')!;
  const headers = within(screen.getByRole('table')).getAllByRole('columnheader');
  const col = headers.findIndex((h) => h.textContent === 'استاندارد' || h.textContent === 'گرید');
  return tr.querySelectorAll('td')[col - 1]?.textContent ?? '';
}

/**
 * The same cell, found by the `data-label` it carries for the card form.
 *
 * `cellFor` reads it positionally, against the `<th>` row. This reads it the
 * way the ≤767px stylesheet does — which is also the only way to ask whether
 * that cell would be shown or dropped on a phone, now that a phone is served
 * by this row rather than by a second, card-only copy of it.
 */
function attrCellFor(name: string, label = 'استاندارد'): HTMLElement {
  const tr = screen.getByRole('rowheader', { name }).closest('tr')!;
  return tr.querySelector<HTMLElement>(`td[data-label="${label}"]`)!;
}

describe('PriceTable — the تیرآهن grade → standard column', () => {
  it('labels the column «استاندارد» in the mixed «همه» view and reads skus.standard', () => {
    renderTable();
    expect(screen.getByRole('columnheader', { name: 'استاندارد' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'گرید' })).toBeNull();
    expect(cellFor('hash-a')).toBe('HEA');
    expect(cellFor('hash-b')).toBe('HEB');
    // Filled but empty-standard هاش row: still «نامشخص» — the value is simply
    // not entered yet, which is true of every هاش SKU today.
    expect(cellFor('hash-empty')).toBe('نامشخص');
    // A non-هاش تیرآهن row has no standard AND its `grade` is deliberately
    // ignored — the column does not apply to it at all.
    expect(cellFor('plain')).toBe('—');
  });

  it('drops the column entirely once a non-هاش تیرآهن sub is selected', async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole('button', { name: 'تیرآهن معمولی' }));
    expect(screen.queryByRole('columnheader', { name: 'استاندارد' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'گرید' })).toBeNull();
  });

  it('keeps the column on a هاش sub', async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole('button', { name: 'هاش سبک' }));
    expect(screen.getByRole('columnheader', { name: 'استاندارد' })).toBeInTheDocument();
    expect(cellFor('hash-a')).toBe('HEA');
  });

  it('drops the «استاندارد» cell out of the card form when the value is unfilled', () => {
    renderTable();
    // There is no longer a second, card-only copy of every row printing
    // «استاندارد: HEA» as text — the one table reflows into that card, and a
    // cell with nothing worth saying is the one the narrow stylesheet drops
    // (`blankOnNarrow`). Same rule the card had, asserted on the single cell
    // that now implements it.
    expect(attrCellFor('hash-a').textContent).toBe('HEA');
    expect(attrCellFor('hash-a').className).not.toMatch(/blankOnNarrow/);
    expect(attrCellFor('hash-b').className).not.toMatch(/blankOnNarrow/);
    // Neither the empty هاش row nor the non-هاش row shows a line on a card —
    // not even a «نامشخص» or a dash one.
    expect(attrCellFor('hash-empty').className).toMatch(/blankOnNarrow/);
    expect(attrCellFor('plain').className).toMatch(/blankOnNarrow/);
    expect(screen.queryByText(/گرید/)).toBeNull();
  });

  it('leaves every other category on the untouched «گرید» column', () => {
    renderTable({
      categorySlug: 'rebar',
      categoryName: 'میلگرد',
      rows: [row('rebar-1', 'plain', { grade: 'A3' }), row('rebar-2', 'plain')],
      subs: [{ slug: 'plain', name: 'ساده', groupLabel: null }],
    });
    expect(screen.getByRole('columnheader', { name: 'گرید' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'استاندارد' })).toBeNull();
    expect(cellFor('rebar-1')).toBe('A3');
    expect(cellFor('rebar-2')).toBe('نامشخص');
    // …and the card form labels it, from the cell's own `data-label`.
    expect(attrCellFor('rebar-1', 'گرید').textContent).toBe('A3');
  });
});
