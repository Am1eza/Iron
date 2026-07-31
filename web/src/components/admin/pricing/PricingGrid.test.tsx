/**
 * The paste-parser IS the point of this file: a mis-matched line writes a
 * wrong price onto a live product, and the operator's only defence is the
 * review-before-save preview. So the matcher is tested directly (every
 * separator, both digit spellings, and the ambiguity sentinel that must
 * SKIP rather than guess), plus the two on-screen guards that stand between
 * a typo and «ذخیره»: the fat-finger warning and dirty tracking.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PriceRow } from '@/lib/types/domain';
import { matchPastedPrices, PricingGrid, type PasteRow } from './PricingGrid';

const rows: PasteRow[] = [
  { id: 'a', slug: 'rebar-14-esfahan', name: 'میلگرد ۱۴ اصفهان', size: '۱۴' },
  { id: 'b', slug: 'rebar-16-esfahan', name: 'میلگرد ۱۶ اصفهان', size: '۱۶' },
  { id: 'c', slug: 'rebar-14-zarrin', name: 'میلگرد ۱۴ ذوب', size: '۱۴' }, // same size as 'a' → ambiguous
];

describe('matchPastedPrices', () => {
  it('parses tab, comma and 2-or-more-space separators alike', () => {
    const { matched, unmatched } = matchPastedPrices(
      'rebar-14-esfahan\t285000\nrebar-16-esfahan,284500\nrebar-14-zarrin   283000',
      rows,
    );
    expect(matched).toEqual([
      { id: 'a', price: '285000' },
      { id: 'b', price: '284500' },
      { id: 'c', price: '283000' },
    ]);
    expect(unmatched).toEqual([]);
  });

  it('matches across Persian/Latin digit spellings in both directions', () => {
    // Latin-typed key against a Persian-spelled row name…
    const latinKey = matchPastedPrices('میلگرد 16 اصفهان\t284500', rows);
    expect(latinKey.matched).toEqual([{ id: 'b', price: '284500' }]);
    // …and a Persian-typed key with a Persian-digit price.
    const persianKey = matchPastedPrices('میلگرد ۱۶ اصفهان\t۲۸۴۵۰۰', rows);
    expect(persianKey.matched).toEqual([{ id: 'b', price: '284500' }]);
  });

  it('SKIPS an ambiguous size instead of guessing a row', () => {
    // Size ۱۴ belongs to BOTH 'a' and 'c'. Writing a price to either one
    // would be a coin flip against a live product, so the by-size map stores
    // a null sentinel and the line is reported back as unmatched.
    const { matched, unmatched } = matchPastedPrices('۱۴\t285000', rows);
    expect(matched).toEqual([]);
    expect(unmatched).toEqual(['۱۴']);
  });

  it('still matches an UNambiguous size', () => {
    const { matched } = matchPastedPrices('۱۶\t284500', rows);
    expect(matched).toEqual([{ id: 'b', price: '284500' }]);
  });

  it('returns unknown keys to the caller rather than dropping them silently', () => {
    const { matched, unmatched } = matchPastedPrices('rebar-14-esfahan\t285000\nتیرآهن ۱۸\t900000', rows);
    expect(matched).toEqual([{ id: 'a', price: '285000' }]);
    expect(unmatched).toEqual(['تیرآهن ۱۸']);
  });

  it('reports a repeated key as unmatched instead of overwriting the first price', () => {
    const { matched, unmatched } = matchPastedPrices('rebar-14-esfahan\t285000\nrebar-14-esfahan\t999999', rows);
    expect(matched).toEqual([{ id: 'a', price: '285000' }]);
    expect(unmatched).toEqual(['rebar-14-esfahan']);
  });

  it('does not crash or match on malformed lines (no price, non-numeric price, blank)', () => {
    const { matched, unmatched } = matchPastedPrices(
      'rebar-14-esfahan\n\n   \nrebar-16-esfahan\tتماس بگیرید\nrebar-14-zarrin,',
      rows,
    );
    expect(matched).toEqual([]);
    expect(unmatched).toEqual([]);
  });

  it('strips separators/units out of the price and keeps only digits', () => {
    const { matched } = matchPastedPrices('rebar-14-esfahan\t۲۸۵٬۰۰۰ تومان', rows);
    expect(matched).toEqual([{ id: 'a', price: '285000' }]);
  });

  it('handles an empty paste and an empty row set without throwing', () => {
    expect(matchPastedPrices('', rows)).toEqual({ matched: [], unmatched: [] });
    expect(matchPastedPrices('rebar-14-esfahan\t285000', [])).toEqual({
      matched: [],
      unmatched: ['rebar-14-esfahan'],
    });
  });
});

/* ------------------------------ mounted grid ------------------------------ */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const pricingGrid = vi.fn();
vi.mock('@/lib/api/resources/admin', () => ({
  adminApi: {
    categories: () =>
      Promise.resolve({
        categories: [{ id: 'cat1', slug: 'rebar', name: 'میلگرد', order: 1, isActive: true }],
      }),
    subCategories: () => Promise.resolve({ subCategories: [] }),
    skuHistoryBatch: () => Promise.resolve({ series: {} }),
    pricingGrid: () => pricingGrid(),
    savePrices: vi.fn(),
  },
}));

function priceRow(id: string, name: string, price: number): PriceRow {
  return {
    id,
    subCategoryId: 'sub1',
    categoryId: 'cat1',
    slug: id,
    name,
    size: name,
    unit: 'kg',
    isActive: true,
    current: {
      skuId: id,
      price,
      unit: 'kg',
      deliveryTime: '۲۴ ساعت',
      vatIncluded: false,
      movementDir: 'flat',
      updatedAt: new Date().toISOString(),
      isStale: false,
    },
  };
}

function renderGrid() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PricingGrid />
    </QueryClientProvider>,
  );
}

/** Replace a price cell's whole value — the cell reformats to grouped Persian
 *  digits on every keystroke, so the value is typed, not appended. */
async function typePrice(user: ReturnType<typeof userEvent.setup>, label: string, digits: string) {
  const cell = await screen.findByLabelText(label);
  await user.clear(cell);
  await user.type(cell, digits);
  return cell;
}

describe('PricingGrid fat-finger guard', () => {
  beforeEach(() => {
    pricingGrid.mockResolvedValue({ rows: [priceRow('r14', 'میلگرد ۱۴', 300_000)] });
  });

  it('warns (in Persian digits) when a typed price moves ≥۲۰٪ from the current one', async () => {
    const user = userEvent.setup();
    renderGrid();
    await typePrice(user, 'قیمت میلگرد ۱۴', '375000'); // +۲۵٪
    expect(await screen.findByText('۲۵٪ تغییر نسبت به قیمت قبلی')).toBeInTheDocument();
  });

  it('stays quiet for an ordinary ۵٪ move', async () => {
    const user = userEvent.setup();
    renderGrid();
    await typePrice(user, 'قیمت میلگرد ۱۴', '315000'); // +۵٪
    expect(await screen.findByLabelText('قیمت میلگرد ۱۴')).toHaveValue('۳۱۵,۰۰۰');
    expect(screen.queryByText(/تغییر نسبت به قیمت قبلی/)).not.toBeInTheDocument();
  });
});

describe('PricingGrid dirty tracking', () => {
  beforeEach(() => {
    pricingGrid.mockResolvedValue({
      rows: [priceRow('r14', 'میلگرد ۱۴', 300_000), priceRow('r16', 'میلگرد ۱۶', 310_000)],
    });
  });

  it('counts every changed row in the save bar and «انصراف» throws the lot away', async () => {
    const user = userEvent.setup();
    renderGrid();

    await typePrice(user, 'قیمت میلگرد ۱۴', '301000');
    expect(await screen.findByText('۱ قیمت تغییر کرده است.')).toBeInTheDocument();

    await typePrice(user, 'قیمت میلگرد ۱۶', '311000');
    expect(await screen.findByText('۲ قیمت تغییر کرده است.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ذخیرهٔ ۲ قیمت' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'انصراف' }));
    expect(screen.queryByText(/قیمت تغییر کرده است\./)).not.toBeInTheDocument();
    expect(await screen.findByLabelText('قیمت میلگرد ۱۴')).toHaveValue('۳۰۰,۰۰۰');
  });

  it('does not count a row typed back to its original price', async () => {
    const user = userEvent.setup();
    renderGrid();
    await typePrice(user, 'قیمت میلگرد ۱۴', '300000');
    expect(screen.queryByText(/قیمت تغییر کرده است\./)).not.toBeInTheDocument();
  });
});
