import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PriceRow } from '@/lib/types/domain';
import type { SubCat } from '@/lib/data/nav';
import { PriceTable } from './PriceTable';

/**
 * The two column families every live source publishes and this catalog did
 * not — ورق's «عرض» and لوله's «ضخامت» — rendered end-to-end, not just
 * resolved as labels.
 *
 * Both read the one shared `skus.dimensions` field, so the risk these guard
 * is that a value lands under the wrong header or leaks into a sibling sub
 * whose source publishes no such column (ورق سیاه, مانیسمان, گوشت‌دار).
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/prices/sheet',
  useSearchParams: () => new URLSearchParams(),
}));

function row(categoryId: string, subCategoryId: string, extra: Partial<PriceRow> = {}): PriceRow {
  return {
    id: subCategoryId,
    subCategoryId,
    categoryId,
    slug: subCategoryId,
    name: subCategoryId,
    size: '۲',
    factory: 'فولاد مبارکه',
    unit: 'kg',
    priceBasis: 'kg',
    current: {
      skuId: subCategoryId,
      price: 500_000,
      unit: 'kg',
      priceBasis: 'kg',
      deliveryTime: '۲۴ ساعت',
      vatIncluded: false,
      movementDir: 'flat',
      updatedAt: new Date('2026-08-31T09:00:00Z').toISOString(),
      isStale: false,
    },
    ...extra,
  } as PriceRow;
}

function renderTable(
  categorySlug: string,
  categoryName: string,
  subs: SubCat[],
  rows: PriceRow[],
  initialSub: string | null,
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PriceTable
        rows={rows}
        subs={subs}
        categoryName={categoryName}
        categorySlug={categorySlug}
        initialSub={initialSub}
      />
    </QueryClientProvider>,
  );
}

const SHEET_SUBS: SubCat[] = [
  { slug: 'black', name: 'ورق سیاه', groupLabel: null },
  { slug: 'oiled', name: 'ورق روغنی', groupLabel: null },
  { slug: 'galvanized', name: 'ورق گالوانیزه', groupLabel: null },
  { slug: 'pickled', name: 'ورق اسیدشویی', groupLabel: null },
  { slug: 'colored', name: 'ورق رنگی', groupLabel: null },
];

const SHEET_ROWS = SHEET_SUBS.map((s) =>
  row('sheet', s.slug, {
    dimensions: s.slug === 'black' ? '۱۰۰۰×۲۰۰۰' : '۱۲۵۰',
    grade: s.slug === 'colored' ? 'سفید یخچالی' : undefined,
    standard: s.slug === 'pickled' ? 'W22' : undefined,
    condition: s.slug === 'black' ? 'رول' : undefined,
  }),
);

function renderSheet(sub: string | null) {
  return renderTable('sheet', 'ورق', SHEET_SUBS, SHEET_ROWS, sub);
}

describe('PriceTable — ورق publishes the width its sources do', () => {
  it.each(['oiled', 'galvanized', 'colored'])('heads %s’s width «عرض»', (sub) => {
    renderSheet(sub);
    expect(screen.getByRole('columnheader', { name: 'عرض' })).toBeInTheDocument();
    expect(document.querySelector('td[data-label="عرض"]')?.textContent).toBe('۱۲۵۰');
    // …and never under the generic shared name
    expect(screen.queryByRole('columnheader', { name: 'ابعاد' })).not.toBeInTheDocument();
  });

  it('heads ورق اسیدشویی’s identical width «سایز», its own source’s word', () => {
    // ahanonline `/انواع-ورق/ورق-اسید-شوئی/` → «استاندارد | ضخامت | برند | سایز»
    renderSheet('pickled');
    expect(screen.getByRole('columnheader', { name: 'سایز' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'عرض' })).not.toBeInTheDocument();
    expect(document.querySelector('td[data-label="سایز"]')?.textContent).toBe('۱۲۵۰');
  });

  it('leaves ورق سیاه on «سایز», whose values are the mixed width×length fact', () => {
    renderSheet('black');
    expect(screen.getByRole('columnheader', { name: 'سایز' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'عرض' })).not.toBeInTheDocument();
    expect(document.querySelector('td[data-label="سایز"]')?.textContent).toBe('۱۰۰۰×۲۰۰۰');
  });

  it('publishes no width at all on the mixed «همه» view', () => {
    // Its lines call the one field two different things; no header is honest
    // for all of them at once — the rule پروفیل's mixed view already follows.
    renderSheet(null);
    for (const name of ['عرض', 'سایز', 'ابعاد']) {
      expect(screen.queryByRole('columnheader', { name })).not.toBeInTheDocument();
    }
  });

  it('keeps ضخامت — the thickness `size` holds — beside the new width', () => {
    renderSheet('colored');
    expect(screen.getByRole('columnheader', { name: 'ضخامت' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'عرض' })).toBeInTheDocument();
    // ورق رنگی's full published set, in the owner's own worked example:
    // «ضخامت | عرض | رنگ | برند»
    expect(screen.getByRole('columnheader', { name: 'رنگ' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'برند' })).toBeInTheDocument();
  });
});

const PIPE_SUBS: SubCat[] = [
  { slug: 'galvanized', name: 'گالوانیزه', groupLabel: null },
  { slug: 'industrial', name: 'صنعتی درزدار', groupLabel: null },
  { slug: 'scaffold', name: 'داربستی', groupLabel: null },
  { slug: 'spiral', name: 'اسپیرال', groupLabel: null },
  { slug: 'well-casing', name: 'لوله جدار چاه', groupLabel: null },
  { slug: 'gas', name: 'گازی', groupLabel: null },
  { slug: 'furniture', name: 'مبلی', groupLabel: null },
  { slug: 'seamless-internal', name: 'لوله مانیسمان داخلی', groupLabel: null },
  { slug: 'thick-walled', name: 'لوله گوشت‌دار', groupLabel: null },
];

const PIPE_ROWS = PIPE_SUBS.map((s) => row('pipe', s.slug, { size: '۲ اینچ', dimensions: '۲.۵' }));

function renderPipe(sub: string | null) {
  return renderTable('pipe', 'لوله', PIPE_SUBS, PIPE_ROWS, sub);
}

describe('PriceTable — لوله publishes the wall thickness its sources do', () => {
  it.each(['galvanized', 'industrial', 'scaffold', 'spiral', 'well-casing', 'gas', 'furniture'])(
    'shows «ضخامت» on %s',
    (sub) => {
      renderPipe(sub);
      expect(screen.getByRole('columnheader', { name: 'ضخامت' })).toBeInTheDocument();
      expect(document.querySelector('td[data-label="ضخامت"]')?.textContent).toBe('۲.۵');
      expect(screen.queryByRole('columnheader', { name: 'ابعاد' })).not.toBeInTheDocument();
    },
  );

  it.each(['seamless-internal', 'thick-walled', null])(
    'shows no wall column on %s, whose source publishes none',
    (sub) => {
      // مانیسمان is priced on «رده»; گوشت‌دار on «سایز» alone.
      renderPipe(sub);
      expect(screen.queryByRole('columnheader', { name: 'ضخامت' })).not.toBeInTheDocument();
      expect(screen.queryByRole('columnheader', { name: 'ابعاد' })).not.toBeInTheDocument();
      expect(document.querySelector('td[data-label="ضخامت"]')).toBeNull();
    },
  );
});
