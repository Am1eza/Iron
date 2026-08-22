import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PriceRow } from '@/lib/types/domain';
import type { SubCat } from '@/lib/data/nav';
import { PriceTable } from './PriceTable';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/prices/profile',
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * پروفیل after the owner's 1405/05 decision.
 *
 * Two things happen on these pages and they are easy to conflate. The factory
 * removal is STRUCTURAL — the fabricated mill names are already withheld by
 * `catalogRepo.toPriceRow`, and the table has to notice there is nothing left
 * to group by and stop drawing per-factory sections at all, rather than draw
 * one «سایر» section with an empty column. The grade replacement is per-SUB —
 * صنعتی and Z each trade «گرید» for a length, استیل trades it for «آلیاژ» AND
 * gains a length, and مبلی/ستونی/گالوانیزه/ساختمانی keep «گرید» untouched.
 *
 * Rows here carry `factory: undefined` for the six stripped subs exactly as
 * the DTO delivers them (asserted separately in
 * `repos/profileFactory.pg.test.ts`), so this file tests what the page does
 * with that, not the suppression itself.
 */
function row(
  id: string,
  subCategoryId: string,
  extra: { grade?: string; branchLengthM?: number; factory?: string; region?: string } = {},
): PriceRow {
  return {
    id,
    subCategoryId,
    categoryId: 'profile',
    slug: id,
    name: id,
    size: '۶۰×۶۰',
    unit: 'kg',
    isActive: true,
    ...extra,
    current: {
      skuId: id,
      price: 450_000,
      unit: 'kg',
      deliveryTime: '۲۴ ساعت',
      vatIncluded: false,
      movementDir: 'flat',
      updatedAt: new Date('2026-08-21T09:00:00Z').toISOString(),
      isStale: false,
    },
  } as PriceRow;
}

const SUBS: SubCat[] = [
  { slug: 'prvfyl-snaty', name: 'پروفیل صنعتی', groupLabel: null },
  { slug: 'prvfyl-sakhtmany', name: 'پروفیل ساختمانی', groupLabel: null },
  { slug: 'profil-mobli', name: 'پروفیل مبلی', groupLabel: null },
  { slug: 'profil-sotuni', name: 'پروفیل ستونی', groupLabel: null },
  { slug: 'profil-galvanizeh', name: 'پروفیل گالوانیزه', groupLabel: null },
  { slug: 'profil-z', name: 'پروفیل Z', groupLabel: null },
  { slug: 'prvfyl-astyl', name: 'پروفیل استیل', groupLabel: null },
];

const ROWS = [
  row('sanati-80', 'prvfyl-snaty', { branchLengthM: 6 }),
  // The one sub that KEPT its factory — and the only reason «کارخانه» still
  // exists anywhere in this category.
  row('sakhtmani-40', 'prvfyl-sakhtmany', { factory: 'فولاد مشهد', grade: 'ST37' }),
  row('mobli-60', 'profil-mobli'),
  row('sotuni-70', 'profil-sotuni'),
  row('galvanizeh-20', 'profil-galvanizeh'),
  row('z-30', 'profil-z'),
  row('steel-50', 'prvfyl-astyl', { grade: '۳۰۴', branchLengthM: 6 }),
];

function renderTable(rows: PriceRow[] = ROWS, initialSub: string | null = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PriceTable
        rows={rows}
        subs={SUBS}
        categoryName="پروفیل"
        categorySlug="profile"
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
  // The leading `<th>` is the compare checkbox and the product name is a
  // `<th scope="row">`, so the Nth header maps to the (N-1)th `<td>`.
  return tr.querySelectorAll('td')[col - 1]?.textContent ?? '';
}

describe('PriceTable — پروفیل, once the fabricated factory is gone', () => {
  it('drops the column, the sections and the mill count on a stripped sub', async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole('button', { name: 'پروفیل مبلی' }));

    expect(screen.queryByRole('columnheader', { name: 'کارخانه' })).toBeNull();
    // Not merely an unlabelled section: no disclosure at all. A `<details>`
    // wrapping the page's only table is an affordance that opens and closes
    // everything on screen.
    expect(document.querySelector('details')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'پرش به کارخانه' })).toBeNull();
    expect(screen.queryByText(/کارخانه/)).toBeNull();
    // The table is still there, headed by the product, not by a mill.
    expect(screen.getByRole('table', { name: 'قیمت پروفیل' })).toBeInTheDocument();
  });

  it('keeps every one of them on «پروفیل ساختمانی»', async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole('button', { name: 'پروفیل ساختمانی' }));

    expect(screen.getByRole('columnheader', { name: 'کارخانه' })).toBeInTheDocument();
    expect(cellFor('sakhtmani-40', 'کارخانه')).toBe('فولاد مشهد');
    expect(document.querySelector('details')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'قیمت پروفیل فولاد مشهد' })).toBeInTheDocument();
    // …and it still keeps «گرید» — this sub was left alone entirely.
    expect(cellFor('sakhtmani-40', 'گرید')).toBe('ST37');
  });

  it('keeps the column in the mixed «همه» view, because ساختمانی is in it', () => {
    renderTable();
    // `getAll` — the mixed view is back to one section per mill («فولاد مشهد»
    // plus the «سایر» bucket), so the header legitimately appears twice.
    expect(screen.getAllByRole('columnheader', { name: 'کارخانه' }).length).toBeGreaterThan(0);
    // The category page re-enables itself from data alone: the moment
    // ساختمانی has priced stock the sections come back, and the rows with no
    // mill collect in the «سایر» bucket the table has always had.
    expect(cellFor('sakhtmani-40', 'کارخانه')).toBe('فولاد مشهد');
  });

  it('drops it from the mixed view too once no visible row has a mill', () => {
    renderTable(ROWS.filter((r) => !r.factory));
    expect(screen.queryByRole('columnheader', { name: 'کارخانه' })).toBeNull();
    expect(document.querySelector('details')).toBeNull();
  });
});

describe('PriceTable — the پروفیل گرید → طول/آلیاژ replacements', () => {
  it('gives صنعتی «طول شاخه» instead of «گرید»', async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole('button', { name: 'پروفیل صنعتی' }));

    expect(screen.getByRole('columnheader', { name: 'طول شاخه' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'گرید' })).toBeNull();
    expect(cellFor('sanati-80', 'طول شاخه')).toBe('۶ متر');
    expect(screen.getByText('طول شاخه: ۶ متر')).toBeInTheDocument();
  });

  it('gives Z «طول سفارشی» — a cut-to-order product, not a stock length', async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole('button', { name: 'پروفیل Z' }));

    expect(screen.getByRole('columnheader', { name: 'طول سفارشی' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'طول شاخه' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'گرید' })).toBeNull();
    // An empty length is the ANSWER here, so it must not read «نامشخص».
    expect(cellFor('z-30', 'طول سفارشی')).toBe('بر اساس سفارش');
  });

  it('gives استیل BOTH «آلیاژ» and «طول شاخه»', async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole('button', { name: 'پروفیل استیل' }));

    expect(screen.getByRole('columnheader', { name: 'آلیاژ' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'طول شاخه' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'گرید' })).toBeNull();
    expect(cellFor('steel-50', 'آلیاژ')).toBe('۳۰۴');
    expect(cellFor('steel-50', 'طول شاخه')).toBe('۶ متر');
  });

  it('leaves مبلی, ستونی and گالوانیزه on the untouched «گرید» column', async () => {
    const user = userEvent.setup();
    renderTable();
    for (const [sub, product] of [
      ['پروفیل مبلی', 'mobli-60'],
      ['پروفیل ستونی', 'sotuni-70'],
      ['پروفیل گالوانیزه', 'galvanizeh-20'],
    ] as const) {
      await user.click(screen.getByRole('button', { name: sub }));
      expect(screen.getByRole('columnheader', { name: 'گرید' })).toBeInTheDocument();
      expect(screen.queryByRole('columnheader', { name: 'طول شاخه' })).toBeNull();
      expect(screen.queryByRole('columnheader', { name: 'طول سفارشی' })).toBeNull();
      // Empty, exactly as before — the owner asked for no change here, and an
      // unfilled grade is «نامشخص», not a dash.
      expect(cellFor(product, 'گرید')).toBe('نامشخص');
    }
  });

  it('dashes the mixed view’s «گرید» for rows that traded it away', () => {
    renderTable();
    expect(screen.getAllByRole('columnheader', { name: 'گرید' }).length).toBeGreaterThan(0);
    expect(cellFor('mobli-60', 'گرید')).toBe('نامشخص');
    // «—», not «نامشخص»: صنعتی/Z/استیل have no grade to be missing.
    expect(cellFor('sanati-80', 'گرید')).toBe('—');
    expect(cellFor('z-30', 'گرید')).toBe('—');
    expect(cellFor('steel-50', 'گرید')).toBe('—');
  });
});

/**
 * The structural replacement for the factory sections.
 *
 * ahanonline — the page the owner benchmarks these against — does not merely
 * omit a factory column on پروفیل; it groups the rows by producing CITY
 * («پروفیل اصفهان», «پروفیل تهران»). `catalogRepo.toPriceRow` recovers that
 * city from the withheld mill string and hands it over as `region`, so what is
 * tested here is what the table does with it: sections when the data supports
 * them, one flat list when it does not, and never a factory column either way.
 *
 * The threshold is deliberate, not incidental — see `REGION_COVERAGE_MIN`.
 */
describe('PriceTable — پروفیل grouped by محل تولید', () => {
  const REGIONAL = [
    row('z-20', 'profil-z', { region: 'تهران' }),
    row('z-30', 'profil-z', { region: 'مشهد' }),
    row('z-40', 'profil-z', { region: 'مشهد' }),
    row('z-50', 'profil-z', { region: 'تهران' }),
    row('z-60', 'profil-z'),
    row('z-70', 'profil-z'),
    row('z-80', 'profil-z'),
  ];

  it('draws one section per city, with the unresolved rows last', () => {
    renderTable(REGIONAL, 'profil-z');

    // Real `<h2>`s, the same crawlable shape the factory sections had — this
    // is the long-tail SEO half of the change, not just a visual grouping.
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['قیمت پروفیل تهران', 'قیمت پروفیل مشهد', 'قیمت پروفیل نامشخص']);
    // «نامشخص» is last even though its rows are no more expensive: an absent
    // city is the absence of information and cannot lead the page.
    expect(headings.at(-1)).toBe('قیمت پروفیل نامشخص');
  });

  it('counts and announces sections as محل تولید, never as کارخانه', () => {
    renderTable(REGIONAL, 'profil-z');

    expect(screen.getByText(/۷ کالا · ۳ محل تولید/)).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'پرش به محل تولید' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'پرش به کارخانه' })).toBeNull();
    // The whole point: no mill anywhere on the page, in any guise.
    expect(screen.queryByRole('columnheader', { name: 'کارخانه' })).toBeNull();
    // The heading is desktop-only; the mobile card list has none, so the city
    // has to survive as a line there.
    expect(screen.getAllByText('محل تولید: تهران').length).toBeGreaterThan(0);
    // …and the column is NOT also drawn: the headings already say it.
    expect(screen.queryByRole('columnheader', { name: 'محل تولید' })).toBeNull();
  });

  it('falls back to one flat table when too few rows resolve to a city', () => {
    // 1 of 5 — below `REGION_COVERAGE_MIN`. Sectioning here would be one
    // one-row «اصفهان» above a four-row «نامشخص»: a structure advertising a
    // regional story the data cannot tell.
    renderTable(
      [
        row('g-20', 'profil-galvanizeh', { region: 'اصفهان' }),
        row('g-30', 'profil-galvanizeh'),
        row('g-40', 'profil-galvanizeh'),
        row('g-50', 'profil-galvanizeh'),
        row('g-60', 'profil-galvanizeh'),
      ],
      'profil-galvanizeh',
    );

    expect(document.querySelector('details')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'پرش به محل تولید' })).toBeNull();
    expect(screen.getByRole('table', { name: 'قیمت پروفیل' })).toBeInTheDocument();
    // …but the city the one resolved row DOES know is not thrown away: it
    // becomes a column instead of a heading.
    expect(screen.getByRole('columnheader', { name: 'محل تولید' })).toBeInTheDocument();
    expect(cellFor('g-20', 'محل تولید')).toBe('اصفهان');
    expect(cellFor('g-30', 'محل تولید')).toBe('نامشخص');
  });

  it('still sections a sub whose every row resolves to the one city', () => {
    // صنعتی's live state: a single «صنعتی اصفهان» row. One section, but a
    // named and correct one — «قیمت پروفیل اصفهان» is exactly the heading
    // ahanonline carries, and it is worth having with one row under it.
    renderTable([row('sanati-80', 'prvfyl-snaty', { region: 'اصفهان', branchLengthM: 6 })], 'prvfyl-snaty');

    expect(screen.getByRole('heading', { name: 'قیمت پروفیل اصفهان' })).toBeInTheDocument();
    expect(cellFor('sanati-80', 'طول شاخه')).toBe('۶ متر');
  });

  it('lets a real mill outrank the region grouping when both are present', () => {
    // The mixed «همه» view, where ساختمانی's genuine factory sits alongside
    // region-only rows. A page cannot be sectioned two ways at once, and the
    // real, admin-ordered distinction is the one that wins.
    renderTable([
      row('sakhtmani-40', 'prvfyl-sakhtmany', { factory: 'فولاد مشهد', grade: 'ST37' }),
      row('z-20', 'profil-z', { region: 'تهران' }),
      row('z-30', 'profil-z', { region: 'تهران' }),
    ]);

    expect(screen.getByRole('heading', { name: 'قیمت پروفیل فولاد مشهد' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'قیمت پروفیل سایر' })).toBeInTheDocument();
    // No region anywhere — not as sections, not as a column, not on a card.
    expect(screen.queryByRole('navigation', { name: 'پرش به محل تولید' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'محل تولید' })).toBeNull();
    expect(screen.queryByText(/^محل تولید: /)).toBeNull();
  });
});
