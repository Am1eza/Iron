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
import { matchPastedPrices, parseBulkPct, PricingGrid, type PasteRow } from './PricingGrid';

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

describe('parseBulkPct', () => {
  it('accepts the trailing minus this input tells the operator to type', () => {
    // The placeholder's own worked example was «۲-», and `Number('2-')` is
    // NaN — so the screen answered its own instructions with «درصد نامعتبر
    // است». A digit typed before the sign is the ordinary RTL case.
    expect(parseBulkPct('۲-')).toBe(-2);
    expect(parseBulkPct('2-')).toBe(-2);
    expect(parseBulkPct('۲+')).toBe(2);
  });

  it('still reads the ordinary leading-sign forms', () => {
    expect(parseBulkPct('۲')).toBe(2);
    expect(parseBulkPct('-۲')).toBe(-2);
    expect(parseBulkPct('۱٫۵'.replace('٫', '.'))).toBe(1.5);
  });

  it('tolerates a stray ٪, spaces and a real minus sign', () => {
    expect(parseBulkPct(' ۲٪ ')).toBe(2);
    expect(parseBulkPct('−۳')).toBe(-3); // U+2212
  });

  it('rejects what is genuinely not a percentage', () => {
    expect(parseBulkPct('')).toBeNull();
    expect(parseBulkPct('۰')).toBeNull(); // a 0% move is a no-op, not an edit
    expect(parseBulkPct('abc')).toBeNull();
    expect(parseBulkPct('۲-۳')).toBeNull();
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

function priceRow(id: string, name: string, price: number, over: Partial<PriceRow['current']> = {}): PriceRow {
  return {
    id,
    subCategoryId: 'sub1',
    categoryId: 'cat1',
    slug: id,
    name,
    size: name,
    unit: 'kg',
    priceBasis: 'kg',
    isActive: true,
    current: {
      skuId: id,
      price,
      unit: 'kg',
      priceBasis: 'kg',
      deliveryTime: '۲۴ ساعت',
      vatIncluded: false,
      movementDir: 'flat',
      updatedAt: new Date().toISOString(),
      isStale: false,
      ...over,
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

/* ------------------------- stale-HIDDEN rows (W30) ------------------------ */

/**
 * The state production was actually in: every price older than
 * PRICE_STALE_HIDE_AFTER_DAYS, so `priceHidden` on every row. The admin read
 * now delivers the real number anyway (see the route's `forAdmin` flag and
 * catalogRepo's `toPriceRow`) — these pin the three things that broke while
 * it did not.
 */
describe('PricingGrid with stale-hidden rows', () => {
  const hidden = { priceHidden: true, isStale: true, deliveryTime: '۴۸ ساعت' };

  beforeEach(() => {
    pricingGrid.mockResolvedValue({
      rows: [priceRow('r14', 'میلگرد ۱۴', 300_000, hidden), priceRow('r16', 'میلگرد ۱۶', 310_000, hidden)],
      hiddenByTaxonomy: 0,
    });
  });

  it('shows the previous price the operator is being asked to replace', async () => {
    renderGrid();
    // The whole job is "yesterday was ۳۰۰,۰۰۰, today it is ۳۰۲,۰۰۰". An empty
    // cell makes that impossible, and empty is what the grid rendered.
    expect(await screen.findByLabelText('قیمت میلگرد ۱۴')).toHaveValue('۳۰۰,۰۰۰');
    expect(await screen.findByLabelText('زمان تحویل میلگرد ۱۴')).toHaveValue('۴۸ ساعت');
  });

  it('keeps the bulk %-adjust usable instead of targeting zero rows', async () => {
    renderGrid();
    // Was «اعمال روی ۰ ردیف», disabled — the feature switched itself off at
    // precisely the moment a whole-catalog price refresh was needed.
    expect(await screen.findByRole('button', { name: 'اعمال روی ۲ ردیف' })).toBeInTheDocument();
  });

  it('still runs the fat-finger guard against the hidden baseline', async () => {
    const user = userEvent.setup();
    renderGrid();
    await typePrice(user, 'قیمت میلگرد ۱۴', '375000'); // +۲۵٪
    expect(await screen.findByText('۲۵٪ تغییر نسبت به قیمت قبلی')).toBeInTheDocument();
  });
});

describe('PricingGrid delivery-time-only edits', () => {
  it('warns instead of silently discarding one on a row with no price', async () => {
    const user = userEvent.setup();
    pricingGrid.mockResolvedValue({
      rows: [priceRow('r14', 'میلگرد ۱۴', 0, { priceHidden: true, isStale: true, deliveryTime: '' })],
      hiddenByTaxonomy: 0,
    });
    renderGrid();
    const cell = await screen.findByLabelText('زمان تحویل میلگرد ۱۴');
    await user.type(cell, 'فوری');
    // The save payload requires a positive price, so this edit genuinely
    // cannot be saved — but it used to vanish with no dirty highlight, no
    // row error and no mention in the save bar.
    expect(await screen.findByText(/اول قیمت این کالا را وارد کنید/)).toBeInTheDocument();
    expect(screen.queryByText(/قیمت تغییر کرده است\./)).not.toBeInTheDocument();
  });
});

describe('PricingGrid — products stranded on a deactivated sub-category', () => {
  it('does not tell the admin an empty category has no products', async () => {
    pricingGrid.mockResolvedValue({ rows: [], hiddenByTaxonomy: 40 });
    renderGrid();
    // The old empty state said «کالایی در این دسته نیست · از بخش کاتالوگ کالا
    // اضافه کنید» for a category holding 40 real products — advice whose only
    // possible outcome is 40 duplicates.
    expect(await screen.findByText('۴۰ کالای این دسته روی سایت دیده نمی‌شود')).toBeInTheDocument();
    expect(screen.queryByText('کالایی در این دسته نیست')).not.toBeInTheDocument();
  });
});

describe('PricingGrid — products that have never been priced', () => {
  it('names them, and filters down to exactly them on request', async () => {
    const user = userEvent.setup();
    pricingGrid.mockResolvedValue({
      rows: [
        priceRow('priced', 'تیرآهن ۱۴', 41_200),
        // What an unpriced row actually looks like coming back from the admin
        // read: price 0, hidden, no delivery promise — indistinguishable from
        // a long-stale one, which is why the ids come from the server.
        priceRow('unpriced', 'تیرآهن ۱۶ فایکو', 0, {
          priceHidden: true,
          isStale: true,
          deliveryTime: '',
        }),
      ],
      hiddenByTaxonomy: 0,
      withoutPrice: ['unpriced'],
    });
    renderGrid();

    expect(await screen.findByText(/۱ کالای فعال این دسته هیچ قیمتی ندارد/)).toBeInTheDocument();
    expect(await screen.findByLabelText('قیمت تیرآهن ۱۴')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'فقط همین‌ها را نشان بده' }));
    expect(await screen.findByLabelText('قیمت تیرآهن ۱۶ فایکو')).toBeInTheDocument();
    expect(screen.queryByLabelText('قیمت تیرآهن ۱۴')).not.toBeInTheDocument();
  });

  it('says nothing when every product carries a price', async () => {
    pricingGrid.mockResolvedValue({
      rows: [priceRow('priced', 'تیرآهن ۱۴', 41_200)],
      hiddenByTaxonomy: 0,
      withoutPrice: [],
    });
    renderGrid();
    expect(await screen.findByLabelText('قیمت تیرآهن ۱۴')).toBeInTheDocument();
    expect(screen.queryByText(/هیچ قیمتی ندارد/)).not.toBeInTheDocument();
  });
});
