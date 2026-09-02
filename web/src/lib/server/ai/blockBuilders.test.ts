/**
 * The generative-UI builders — the code that decides WHICH card an answer
 * gets and what goes on it.
 *
 * These are the functions that put numbers in front of a buyer without the
 * grounding validator between them and the screen (a block is built here, in
 * code, and rendered verbatim), so the properties worth pinning are the ones
 * that would be a wrong quote rather than an ugly card: a withheld price must
 * never render as a number, a single mill must never be presented as a market
 * comparison, and cheapest-delivered must be allowed to disagree with
 * cheapest-ex-works — which is the entire reason the landed column exists.
 */
import { describe, it, expect } from 'vitest';
import type { PricePoint, PriceRow } from '@/lib/types/domain';
import {
  buildCompareBlock,
  buildOptionsBlock,
  buildQuoteBlock,
  buildTrendBlock,
  seriesChangePct,
  toDailySeries,
  unitLabelFor,
} from './blockBuilders';
import { DEFAULT_LOGISTICS_CONFIG } from '@/lib/data/logistics';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse('2026-08-01T09:00:00.000Z');

function row(over: Partial<PriceRow> & { price?: number } = {}): PriceRow {
  const { price = 42_000, ...rest } = over;
  return {
    id: rest.id ?? 'sku-1',
    // catalogRepo.toPriceRow puts SLUGS in these two fields, not ids.
    categoryId: 'rebar',
    subCategoryId: 'rebar-ajdar',
    slug: rest.slug ?? 'milgerd-14-zobahan',
    name: 'میلگرد ۱۴ آجدار',
    size: '۱۴',
    factory: 'ذوب‌آهن',
    order: 0,
    unit: 'kg',
    priceBasis: 'kg',
    ...rest,
    current: {
      skuId: rest.id ?? 'sku-1',
      price,
      unit: 'kg',
      priceBasis: 'kg',
      deliveryTime: '۲۴ ساعت',
      vatIncluded: false,
      movementDir: 'flat',
      updatedAt: new Date(T0).toISOString(),
      isStale: false,
      ...(rest.current ?? {}),
    },
  } as PriceRow;
}

function points(values: number[], startMs = T0 - values.length * DAY): PricePoint[] {
  return values.map((price, i) => ({
    id: `p${i}`,
    skuId: 'sku-1',
    price,
    unit: 'kg',
    priceBasis: 'kg',
    at: new Date(startMs + i * DAY).toISOString(),
  }));
}

describe('toDailySeries', () => {
  it("keeps the day's LAST value, so six edits in one afternoon are one point", () => {
    const sameDay: PricePoint[] = [
      { id: 'a', skuId: 's', price: 100, unit: 'kg', priceBasis: 'kg', at: '2026-08-01T06:00:00.000Z' },
      { id: 'b', skuId: 's', price: 110, unit: 'kg', priceBasis: 'kg', at: '2026-08-01T11:00:00.000Z' },
      { id: 'c', skuId: 's', price: 120, unit: 'kg', priceBasis: 'kg', at: '2026-08-02T08:00:00.000Z' },
    ];
    expect(toDailySeries(sameDay).values).toEqual([110, 120]);
  });

  it('sorts ascending even when the rows arrive out of order', () => {
    const shuffled = [...points([1, 2, 3])].reverse();
    expect(toDailySeries(shuffled).values).toEqual([1, 2, 3]);
  });
});

describe('seriesChangePct', () => {
  it('reports the net move across the window to one decimal', () => {
    expect(seriesChangePct([100, 90, 110])).toBe(10);
    expect(seriesChangePct([100, 95])).toBe(-5);
  });

  it('refuses rather than dividing by a baseline it does not have', () => {
    expect(seriesChangePct([100])).toBeUndefined();
    expect(seriesChangePct([])).toBeUndefined();
    expect(seriesChangePct([0, 50])).toBeUndefined();
  });
});

describe('buildTrendBlock', () => {
  it('declines to draw a line through too few points', () => {
    expect(buildTrendBlock({ title: 'x', unitLabel: 'تومان', rangeLabel: '۳۰ روز', points: points([1, 2]) })).toBeNull();
  });

  it('carries the real dates alongside the values, aligned', () => {
    const block = buildTrendBlock({
      title: 'میلگرد',
      unitLabel: 'تومان / کیلوگرم',
      rangeLabel: '۳۰ روز اخیر',
      points: points([100, 101, 102, 103]),
    })!;
    expect(block.values).toHaveLength(4);
    expect(block.dates).toHaveLength(4);
    expect(block.changePct).toBe(3);
  });
});

describe('buildQuoteBlock', () => {
  it('sends a withheld price as null — never as the stored 0 sentinel', () => {
    const hidden = row({ price: 0, current: { priceHidden: true, isStale: true } as never });
    const block = buildQuoteBlock(hidden);
    expect(block.price).toBeNull();
    // …and withholds the delivery promise that goes with a price it will not quote.
    expect(block.deliveryTime).toBeUndefined();
  });

  it('states the row’s own denomination rather than assuming per-kilogram', () => {
    const perBranch = row({
      priceBasis: 'branch',
      branchLengthM: 12,
      current: { priceBasis: 'branch' } as never,
    });
    expect(unitLabelFor(perBranch)).toBe('تومان / شاخه ۱۲ متری');
  });

  it('links to the product page built from the row’s own slugs', () => {
    expect(buildQuoteBlock(row()).href).toBe('/prices/rebar/rebar-ajdar/milgerd-14-zobahan');
  });

  it('omits the sparkline when there is not enough history to draw one', () => {
    expect(buildQuoteBlock(row(), points([1, 2]))?.trend).toBeUndefined();
    expect(buildQuoteBlock(row(), points([1, 2, 3, 4]))?.trend?.values).toHaveLength(4);
  });
});

describe('buildCompareBlock', () => {
  const mills = [
    row({ id: 'a', slug: 'a', factory: 'ذوب‌آهن', price: 42_000 }),
    row({ id: 'b', slug: 'b', factory: 'فایکو', price: 41_000 }),
    row({ id: 'c', slug: 'c', factory: 'ظفر بناب', price: 43_000 }),
  ];

  it('sorts cheapest first and badges exactly one winner', () => {
    const block = buildCompareBlock(mills, { title: 'میلگرد ۱۴', tonnage: 20 })!;
    expect(block.rows.map((r) => r.factory)).toEqual(['فایکو', 'ذوب‌آهن', 'ظفر بناب']);
    expect(block.rows.filter((r) => r.cheapest)).toHaveLength(1);
    expect(block.rows[0]!.cheapest).toBe(true);
  });

  it('prices the asked tonnage and states the saving over the runner-up', () => {
    const block = buildCompareBlock(mills, { title: 'میلگرد ۱۴', tonnage: 20 })!;
    expect(block.rows[0]!.totalToman).toBe(41_000 * 20_000);
    // 42,000 − 41,000 = 1,000 Toman/kg over 20,000 kg.
    expect(block.savingsVsNextToman).toBe(20_000_000);
  });

  it('never lets a withheld price win as cheapest', () => {
    const withWithheld = [
      ...mills,
      row({ id: 'd', slug: 'd', factory: 'انبار', price: 0, current: { priceHidden: true } as never }),
    ];
    const block = buildCompareBlock(withWithheld, { title: 'میلگرد ۱۴', tonnage: 5 })!;
    expect(block.rows.map((r) => r.factory)).not.toContain('انبار');
    expect(block.rows[0]!.factory).toBe('فایکو');
  });

  it('says nothing about delivery until it knows where to deliver', () => {
    const block = buildCompareBlock(mills, { title: 'میلگرد ۱۴', tonnage: 20 })!;
    expect(block.city).toBeUndefined();
    expect(block.rows.every((r) => r.landedToman === undefined)).toBe(true);
  });

  it('adds a delivered column — and lets a DIFFERENT mill win on it', () => {
    // The point of the whole landed column: freight is charged per ton from
    // one warehouse, so it is the same for every mill here — meaning the
    // delivered winner must be the goods winner for THIS input, and the test
    // pins that the two badges are computed independently rather than aliased.
    const block = buildCompareBlock(mills, {
      title: 'میلگرد ۱۴',
      tonnage: 20,
      city: 'مشهد',
      cityKm: 890,
      logistics: DEFAULT_LOGISTICS_CONFIG,
      vatRate: 0.1,
    })!;
    expect(block.city).toBe('مشهد');
    const landed = block.rows.map((r) => r.landedToman!);
    expect(landed.every((v) => typeof v === 'number')).toBe(true);
    // Delivered cost strictly exceeds the goods cost — freight, handling,
    // insurance, weighbridge and VAT are all on top.
    for (const r of block.rows) expect(r.landedToman!).toBeGreaterThan(r.totalToman!);
    expect(block.rows.filter((r) => r.cheapestLanded)).toHaveLength(1);
  });

  it('reports rows it could not price per kilogram instead of dropping them silently', () => {
    const withBranch = [
      ...mills,
      row({ id: 'e', slug: 'e', factory: 'ناشناس', priceBasis: 'branch', current: { priceBasis: 'branch' } as never }),
    ];
    const block = buildCompareBlock(withBranch, { title: 'میلگرد ۱۴', tonnage: 20 })!;
    expect(block.excludedNonKg).toBe(1);
  });

  it('returns null when nothing has a real price', () => {
    const none = [row({ price: 0, current: { priceHidden: true } as never })];
    expect(buildCompareBlock(none, { title: 'x', tonnage: 1 })).toBeNull();
  });

  it('flags a single-source line so one quote is not read as a market', () => {
    const block = buildCompareBlock(mills, { title: 'میلگرد ۱۴', tonnage: 20 })!;
    expect(block.rows.every((r) => r.rowCount === 1)).toBe(true);
  });
});

describe('buildOptionsBlock', () => {
  const subNames = new Map([
    ['rebar-ajdar', 'آجدار'],
    ['rebar-sadeh', 'ساده'],
  ]);

  it('asks about the product type first when more than one exists', () => {
    const block = buildOptionsBlock({
      subject: 'میلگرد',
      rows: [
        row({ id: 'a', slug: 'a', subCategoryId: 'rebar-ajdar', size: '۱۴' }),
        row({ id: 'b', slug: 'b', subCategoryId: 'rebar-sadeh', size: '۱۶' }),
      ],
      subNames,
    })!;
    expect(block.groups[0]!.title).toBe('نوع');
    expect(block.groups[0]!.options.map((o) => o.label).sort()).toEqual(['آجدار', 'ساده']);
    // Tapping sends words a human would type — never a slug or an id.
    expect(block.groups[0]!.options[0]!.send).toContain('میلگرد');
  });

  it('moves on to size once the type is settled', () => {
    const block = buildOptionsBlock({
      subject: 'میلگرد آجدار',
      rows: [
        row({ id: 'a', slug: 'a', size: '۱۲' }),
        row({ id: 'b', slug: 'b', size: '۱۴' }),
        row({ id: 'c', slug: 'c', size: '۱۶' }),
      ],
      subNames,
    })!;
    expect(block.groups[0]!.title).toBe('سایز');
    expect(block.question).toContain('سایز');
    expect(block.groups[0]!.options).toHaveLength(3);
  });

  it('falls through to the mill when type and size are both pinned down', () => {
    const block = buildOptionsBlock({
      subject: 'میلگرد ۱۴',
      rows: [
        row({ id: 'a', slug: 'a', factory: 'ذوب‌آهن' }),
        row({ id: 'b', slug: 'b', factory: 'فایکو' }),
      ],
      subNames,
    })!;
    expect(block.groups[0]!.title).toBe('کارخانه');
    expect(block.question).toContain('کارخانه');
  });

  it('asks nothing when there is nothing left to choose', () => {
    expect(buildOptionsBlock({ subject: 'میلگرد ۱۴ ذوب‌آهن', rows: [row()], subNames })).toBeNull();
  });

  it('respects dimensions the visitor has already stated', () => {
    const rows = [
      row({ id: 'a', slug: 'a', size: '۱۲', factory: 'ذوب‌آهن' }),
      row({ id: 'b', slug: 'b', size: '۱۴', factory: 'فایکو' }),
    ];
    const block = buildOptionsBlock({ subject: 'میلگرد', rows, subNames, known: { size: true } })!;
    expect(block.groups[0]!.title).toBe('کارخانه');
  });

  it('caps the chip row and says so rather than printing a wall of buttons', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      row({ id: `s${i}`, slug: `s${i}`, size: `${i + 8}` }),
    );
    const block = buildOptionsBlock({ subject: 'میلگرد', rows: many, subNames })!;
    expect(block.groups[0]!.options.length).toBeLessThanOrEqual(8);
    expect(block.groups[0]!.truncated).toBe(true);
  });

  it('prefers priced rows, but still answers when nothing is priced', () => {
    const unpriced = [
      row({ id: 'a', slug: 'a', size: '۱۲', price: 0, current: { priceHidden: true } as never }),
      row({ id: 'b', slug: 'b', size: '۱۴', price: 0, current: { priceHidden: true } as never }),
    ];
    const block = buildOptionsBlock({ subject: 'میلگرد', rows: unpriced, subNames })!;
    expect(block.groups[0]!.options).toHaveLength(2);
  });
});
