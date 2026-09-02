import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PriceRow } from '@/lib/types/domain';
import type { SubCat } from '@/lib/data/nav';
import { PriceTable } from './PriceTable';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/prices/pipe',
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * لوله after the owner's 1405/06 requests: a «رده» (pipe schedule) column on
 * مانیسمان, and «کارخانه» renamed to «برند» there too, where the product is
 * imported and the value is an origin rather than a mill.
 *
 * Updated 1405/06/09 for the per-sub column reconciliation: «گرید» is not a
 * column any of the nine source pages checked publishes for any لوله sub, so
 * it is gone from every one of them (اسپیرال aside, whose own rows store a
 * real ST37 there); five subs gained the «حالت» their sources print, and two
 * gained «استاندارد». See `catalogLabels`' `PIPE_ATTRS` for the source table.
 *
 * «رده» briefly also applied to گازی, صنعتی درزدار, اسپیرال, جدار چاه and
 * گوشت‌دار (1405/06), reverted the same day: ahanonline.com's own live pages
 * for all five publish no «رده» column at all, and ASME B36.10 schedule
 * numbers are not how the Iranian market classifies these product lines —
 * only مانیسمان is actually sold and quoted by «رده ۴۰» / «رده ۸۰».
 *
 * The sub slugs are the LIVE ones, read from the production catalog rather
 * than from `data/nav.ts` — which still lists a single `seamless` that exists
 * nowhere in the database, and omits `well-casing` and `thick-walled`
 * entirely. A test written against nav.ts would have passed while the feature
 * matched no real row.
 *
 * This is the case neither the استیل nor the پروفیل file covers: a category
 * where one sub RENAMES the factory column while its siblings keep it, and
 * where an attribute column is GAINED by only that one sub.
 */
function row(
  id: string,
  subCategoryId: string,
  extra: { grade?: string; schedule?: string; factory?: string } = {},
): PriceRow {
  return {
    id,
    subCategoryId,
    categoryId: 'pipe',
    slug: id,
    name: id,
    size: '۴ اینچ',
    unit: 'kg',
    priceBasis: 'kg',
    ...extra,
    current: {
      skuId: id,
      price: 520_000,
      unit: 'kg',
      priceBasis: 'kg',
      deliveryTime: '۲۴ ساعت',
      vatIncluded: false,
      movementDir: 'flat',
      updatedAt: new Date('2026-08-23T09:00:00Z').toISOString(),
      isStale: false,
    },
  } as PriceRow;
}

const SUBS: SubCat[] = [
  { slug: 'seamless-internal', name: 'لوله مانیسمان داخلی', groupLabel: 'مانیسمان' },
  { slug: 'seamless-external', name: 'لوله مانیسمان خارجی', groupLabel: 'مانیسمان' },
  { slug: 'gas', name: 'گازی', groupLabel: null },
  { slug: 'industrial', name: 'صنعتی درزدار', groupLabel: null },
  { slug: 'furniture', name: 'مبلی', groupLabel: null },
];

const ROWS = [
  // Still a mill-shaped value: this change is go-forward only and nothing was
  // backfilled, so the live rows keep exactly what they hold today.
  row('seamless-3', 'seamless-internal', { schedule: '۴۰', factory: 'لوله سپاهان' }),
  row('seamless-x', 'seamless-external', { schedule: '۸۰', factory: 'چینی' }),
  row('gas-2', 'gas', { schedule: '۴۰', factory: 'نورد لوله ساوه' }),
  row('industrial-2', 'industrial', { grade: 'ST37', factory: 'سپنتا' }),
  row('furniture-1', 'furniture', { factory: 'لوله سمنان' }),
];

function renderTable(rows: PriceRow[] = ROWS, initialSub: string | null = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PriceTable
        rows={rows}
        subs={SUBS}
        categoryName="لوله"
        categorySlug="pipe"
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

describe('PriceTable — لوله publishes «رده» on مانیسمان only', () => {
  it('publishes «رده» — and no «گرید» beside it — on هر دو زیرشاخهٔ مانیسمان', async () => {
    const user = userEvent.setup();
    renderTable();
    for (const [sub, product, schedule] of [
      ['لوله مانیسمان داخلی', 'seamless-3', '۴۰'],
      ['لوله مانیسمان خارجی', 'seamless-x', '۸۰'],
    ] as const) {
      await user.click(screen.getByRole('button', { name: sub }));
      expect(cellFor(product, 'رده')).toBe(schedule);
      // 1405/06/09: «گرید» went. ahanonline `/انواع-لوله/لوله-مانسمان/` and
      // teleahan `/لوله-اتصالات/لوله-مانیسمان/` both publish «سایز | رده |
      // برند» and nothing more, and `grade` is null on all 5 live rows — so
      // the column beside «رده» was empty noise under a word this family's
      // sources do not use.
      expect(screen.queryByRole('columnheader', { name: 'گرید' })).toBeNull();
    }
  });

  it('offers no «رده» on گازی, صنعتی درزدار or مبلی — ahanonline publishes none for them', async () => {
    const user = userEvent.setup();
    renderTable();
    for (const sub of ['گازی', 'صنعتی درزدار', 'مبلی']) {
      await user.click(screen.getByRole('button', { name: sub }));
      expect(screen.queryByRole('columnheader', { name: 'رده' })).toBeNull();
      // …and none of the three publishes «گرید» either, as of 1405/06/09.
      expect(screen.queryByRole('columnheader', { name: 'گرید' })).toBeNull();
    }
  });

  it('gives صنعتی درزدار and مبلی the «حالت» their sources print', async () => {
    // ahanonline `/انواع-لوله/لوله-درز-مستقیم/` publishes «حالت» («۶ متری»)
    // beside «استاندارد»; مبلی has no ahanonline page and follows ahan1.com
    // `/Category/pipe/steel-furniture-pipe/` («حالت: شاخه ۶ متری») and
    // sabaprofile.com `/قیمت-لوله-مبلی/` («طول: ۶ متر»). Both fetched
    // 1405/06/09.
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole('button', { name: 'صنعتی درزدار' }));
    expect(screen.getByRole('columnheader', { name: 'حالت' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'استاندارد' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'مبلی' }));
    expect(screen.getByRole('columnheader', { name: 'حالت' })).toBeInTheDocument();
    // مبلی's sources publish no standard, so it gains none.
    expect(screen.queryByRole('columnheader', { name: 'استاندارد' })).toBeNull();
  });

  it('publishes no attribute column at all on گازی', async () => {
    // Its source table (ahanonline `/لوله-درز-مستقیم/لوله-گاز-خانگی/`) is
    // «سایز | ضخامت | برند» — every fact of which this catalog renders
    // outside the attribute columns.
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole('button', { name: 'گازی' }));
    for (const name of ['گرید', 'رده', 'حالت', 'استاندارد', 'آلیاژ']) {
      expect(screen.queryByRole('columnheader', { name })).toBeNull();
    }
  });

  it('keeps «رده» — and every other attribute column — off the mixed «همه» view', () => {
    // لوله's live subs no longer agree on any one attribute column, so a
    // single header there would read «—» for most of the page's own rows.
    renderTable();
    for (const name of ['رده', 'گرید', 'حالت', 'استاندارد']) {
      expect(screen.queryByRole('columnheader', { name })).toBeNull();
    }
  });
});

describe('PriceTable — مانیسمان calls its factory column «برند»', () => {
  it('renames the column, the section noun and the sort control on مانیسمان', async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole('button', { name: 'لوله مانیسمان داخلی' }));
    expect(screen.getByRole('columnheader', { name: 'برند' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'کارخانه' })).toBeNull();
    // The sections are named after the column, so they move with it.
    expect(screen.getByRole('combobox', { name: 'مرتب‌سازی بخش‌های برند' })).toBeInTheDocument();
  });

  it('keeps the stored value untouched — only the label changed', async () => {
    // Go-forward only: the live مانیسمان rows still hold mill-shaped values
    // and nothing was backfilled, so «لوله سپاهان» must still be printed
    // exactly as stored, merely under a different heading.
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole('button', { name: 'لوله مانیسمان داخلی' }));
    expect(cellFor('seamless-3', 'برند')).toContain('لوله سپاهان');
  });

  it('leaves the لوله subs whose sources name no producer on «کارخانه»', async () => {
    // گازی left this list 1405/06/09 — ahanonline's لوله گاز خانگی table
    // heads that column «برند», so it now reads برند like مانیسمان. صنعتی and
    // مبلی have no producer column on any reference, so there is no source
    // word to adopt and the catalog's own default stays.
    const user = userEvent.setup();
    renderTable();
    for (const sub of ['صنعتی درزدار', 'مبلی']) {
      await user.click(screen.getByRole('button', { name: sub }));
      expect(screen.getByRole('columnheader', { name: 'کارخانه' })).toBeInTheDocument();
      expect(screen.queryByRole('columnheader', { name: 'برند' })).toBeNull();
    }
    await user.click(screen.getByRole('button', { name: 'گازی' }));
    expect(screen.getByRole('columnheader', { name: 'برند' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'کارخانه' })).toBeNull();
  });

  it('keeps the generic «کارخانه» in the mixed «همه» view', () => {
    // Those rows do not agree on a sub: a گازی row under a «برند» header
    // would be a false claim about what its mill name is.
    renderTable();
    // The mixed view groups by mill, so there is one section table — and one
    // header — per factory. EVERY one of them has to say «کارخانه»; a single
    // «برند» among them would be the drift this label exists to prevent.
    const headers = screen.getAllByRole('columnheader', { name: 'کارخانه' });
    expect(headers.length).toBeGreaterThan(0);
    expect(screen.queryByRole('columnheader', { name: 'برند' })).toBeNull();
  });
});
