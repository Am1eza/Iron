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
 *  assertion below is unambiguous about which row it is reading. */
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

/** The «جزئیات» disclosure row that follows a product's own `<tr>` — always
 *  in the DOM (see PriceTableRow), so this needs no click to read from. */
function detailFor(name: string): HTMLElement {
  const tr = screen.getByRole('rowheader', { name }).closest('tr')!;
  const detail = tr.nextElementSibling as HTMLElement;
  expect(detail.id).toMatch(/^row-detail-/);
  return detail;
}

/** The «استاندارد»/«گرید» value for a given product row, read from its
 *  detail disclosure's `<dt>`/`<dd>` pair — replaces the old positional
 *  column-header lookup now that this moved off the always-visible columns. */
function attrValueFor(name: string, label: string): string | null {
  const dt = within(detailFor(name)).queryByText(label);
  return dt ? (dt.nextElementSibling?.textContent ?? null) : null;
}

describe('PriceTable — the تیرآهن grade → standard column', () => {
  it('labels it «استاندارد» in the mixed «همه» view and reads skus.standard', () => {
    renderTable();
    expect(attrValueFor('hash-a', 'استاندارد')).toBe('HEA');
    expect(attrValueFor('hash-b', 'استاندارد')).toBe('HEB');
    // Filled but empty-standard هاش row: still «نامشخص» — the value is simply
    // not entered yet, which is true of every هاش SKU today.
    expect(attrValueFor('hash-empty', 'استاندارد')).toBe('نامشخص');
    // A non-هاش تیرآهن row has no standard AND its `grade` is deliberately
    // ignored — the column does not apply to it at all.
    expect(attrValueFor('plain', 'استاندارد')).toBe('—');
    expect(attrValueFor('hash-a', 'گرید')).toBeNull();
  });

  it('drops it entirely once a non-هاش تیرآهن sub is selected', async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole('button', { name: 'تیرآهن معمولی' }));
    expect(attrValueFor('plain', 'استاندارد')).toBeNull();
    expect(attrValueFor('plain', 'گرید')).toBeNull();
  });

  it('keeps it on a هاش sub', async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole('button', { name: 'هاش سبک' }));
    expect(attrValueFor('hash-a', 'استاندارد')).toBe('HEA');
  });

  it('shows a value for every row instead of omitting an unfilled one', () => {
    // This disclosure is the desktop-equivalent view collapsed by default —
    // unlike the old mobile-only card, it never drops a cell for having
    // nothing to say; the empty هاش row and the non-هاش row still get a line,
    // «نامشخص» and «—» respectively, matching what the header column always
    // showed.
    renderTable();
    expect(attrValueFor('hash-a', 'استاندارد')).toBe('HEA');
    expect(attrValueFor('hash-b', 'استاندارد')).toBe('HEB');
    expect(attrValueFor('hash-empty', 'استاندارد')).toBe('نامشخص');
    expect(attrValueFor('plain', 'استاندارد')).toBe('—');
  });

  it('leaves every other category on the untouched «گرید» label', () => {
    renderTable({
      categorySlug: 'rebar',
      categoryName: 'میلگرد',
      rows: [row('rebar-1', 'plain', { grade: 'A3' }), row('rebar-2', 'plain')],
      subs: [{ slug: 'plain', name: 'ساده', groupLabel: null }],
    });
    expect(attrValueFor('rebar-1', 'گرید')).toBe('A3');
    expect(attrValueFor('rebar-2', 'گرید')).toBe('نامشخص');
    expect(attrValueFor('rebar-1', 'استاندارد')).toBeNull();
  });
});
