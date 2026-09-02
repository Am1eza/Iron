import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

/**
 * The factory-section heading on تیرآهن's sub-type pages (owner report,
 * 1405/06).
 *
 * Every section used to be titled «قیمت {category} {mill}» from the page's
 * category name alone, so a هاش سبک page announced «قیمت تیرآهن ذوب‌آهن
 * اصفهان» directly above rows named «هاش سبک ۱۴ ذوب‌آهن اصفهان» — plain
 * تیرآهن pricing advertised over products that are not plain تیرآهن, at
 * different prices. Verified live before the fix on
 * /prices/ibeam/hash-sabok, /hash-sangin and /lane-zanburi.
 *
 * Sub slugs are the LIVE ones. `data/nav.ts` is a mock fixture — its own
 * header says so — and still lists `hea`/`heb`/`castellated`, which exist
 * nowhere in the database; a test written against those would pass while the
 * fix matched no real page.
 */
function row(id: string, subCategoryId: string, factory = 'ذوب‌آهن اصفهان'): PriceRow {
  return {
    id,
    subCategoryId,
    categoryId: 'ibeam',
    slug: id,
    name: id,
    size: '۱۴',
    factory,
    unit: 'kg',
    priceBasis: 'kg',
    current: {
      skuId: id,
      price: 500_000,
      unit: 'kg',
      priceBasis: 'kg',
      deliveryTime: '۲۴ ساعت',
      vatIncluded: false,
      movementDir: 'flat',
      updatedAt: new Date('2026-08-13T09:00:00Z').toISOString(),
      isStale: false,
    },
  } as PriceRow;
}

/** The live تیرآهن taxonomy: one plain sub and three sub-types. */
const SUBS: SubCat[] = [
  { slug: 'tirahan', name: 'تیرآهن', groupLabel: null },
  { slug: 'hash-sabok', name: 'هاش سبک', groupLabel: null },
  { slug: 'hash-sangin', name: 'هاش سنگین', groupLabel: null },
  { slug: 'lane-zanburi', name: 'لانه زنبوری', groupLabel: null },
];

const ROWS = [
  row('plain-14', 'tirahan'),
  row('hash-a-14', 'hash-sabok'),
  row('hash-b-14', 'hash-sangin'),
  row('castellated-14', 'lane-zanburi'),
];

function renderTable(initialSub: string | null = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PriceTable
        rows={ROWS}
        subs={SUBS}
        categoryName="تیرآهن"
        categorySlug="ibeam"
        initialSub={initialSub}
      />
    </QueryClientProvider>,
  );
}

describe('PriceTable — تیرآهن sub-type section headings name the sub-type', () => {
  it('says «قیمت تیرآهن هاش سبک ذوب‌آهن اصفهان» on the هاش سبک page', () => {
    renderTable('hash-sabok');
    expect(
      screen.getByRole('heading', { name: 'قیمت تیرآهن هاش سبک ذوب‌آهن اصفهان' }),
    ).toBeInTheDocument();
    // The bare category heading — the bug — must be gone, not merely joined.
    expect(screen.queryByRole('heading', { name: 'قیمت تیرآهن ذوب‌آهن اصفهان' })).toBeNull();
  });

  it('does the same for هاش سنگین', () => {
    renderTable('hash-sangin');
    expect(
      screen.getByRole('heading', { name: 'قیمت تیرآهن هاش سنگین ذوب‌آهن اصفهان' }),
    ).toBeInTheDocument();
  });

  it('names لانه زنبوری too', () => {
    renderTable('lane-zanburi');
    expect(
      screen.getByRole('heading', { name: 'قیمت تیرآهن لانه زنبوری ذوب‌آهن اصفهان' }),
    ).toBeInTheDocument();
  });

  it('carries the same subject into the table’s accessible name and caption', () => {
    // The heading, the scroll region's aria-label and the visually-hidden
    // caption are one string in the source; a screen-reader user must not be
    // told «تیرآهن» while the sighted heading says «تیرآهن هاش سبک».
    renderTable('hash-sabok');
    expect(
      screen.getByRole('region', { name: 'قیمت تیرآهن هاش سبک ذوب‌آهن اصفهان' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: 'قیمت تیرآهن هاش سبک ذوب‌آهن اصفهان' }),
    ).toBeInTheDocument();
  });

  it('leaves the plain تیرآهن sub exactly as it was', () => {
    // `tirahan`'s own name IS the category word, so naming the sub here would
    // produce «قیمت تیرآهن تیرآهن ذوب‌آهن اصفهان». It is deliberately not in
    // the allow-list.
    renderTable('tirahan');
    expect(screen.getByRole('heading', { name: 'قیمت تیرآهن ذوب‌آهن اصفهان' })).toBeInTheDocument();
  });

  it('keeps the generic category heading in the mixed «همه» view', () => {
    // One mill's section there holds plain تیرآهن AND هاش rows at once, so no
    // sub-specific subject is true of all of them.
    renderTable(null);
    expect(screen.getByRole('heading', { name: 'قیمت تیرآهن ذوب‌آهن اصفهان' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /هاش/ })).toBeNull();
  });

  it('follows the ACTIVE filter, not the sub the page was entered on', async () => {
    // The filter is uncontrolled on a sub page (`initialSub`), so a visitor
    // can switch to «همه» without navigating. The heading must stop claiming
    // هاش the moment the rows stop being only هاش.
    const user = userEvent.setup();
    renderTable('hash-sabok');
    expect(
      screen.getByRole('heading', { name: 'قیمت تیرآهن هاش سبک ذوب‌آهن اصفهان' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'همه' }));
    expect(screen.getByRole('heading', { name: 'قیمت تیرآهن ذوب‌آهن اصفهان' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /هاش/ })).toBeNull();
  });

  it('names each mill separately when the sub-type spans several', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <PriceTable
          rows={[row('lz-1', 'lane-zanburi', 'فایکو'), row('lz-2', 'lane-zanburi', 'ظفر بناب')]}
          subs={SUBS}
          categoryName="تیرآهن"
          categorySlug="ibeam"
          initialSub="lane-zanburi"
        />
      </QueryClientProvider>,
    );
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toContain('قیمت تیرآهن لانه زنبوری فایکو');
    expect(headings).toContain('قیمت تیرآهن لانه زنبوری ظفر بناب');
  });
});

describe('PriceTable — no other category’s heading changes', () => {
  it('leaves میلگرد on the plain category heading, on a sub page too', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <PriceTable
          rows={[{ ...row('rebar-14', 'deformed'), categoryId: 'rebar' } as PriceRow]}
          subs={[{ slug: 'deformed', name: 'آجدار A3', groupLabel: null }]}
          categoryName="میلگرد"
          categorySlug="rebar"
          initialSub="deformed"
        />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('heading', { name: 'قیمت میلگرد ذوب‌آهن اصفهان' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /آجدار/ })).toBeNull();
  });
});
