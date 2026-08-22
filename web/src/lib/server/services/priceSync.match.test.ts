/**
 * The matcher behind the automated price mirror (US-02.5).
 *
 * This is the file that decides whether a number scraped off a competitor's
 * page becomes a price real customers buy against, so the cases below are
 * weighted towards the ways it can be WRONG rather than the happy path. Every
 * skip case here is drawn from something the 2026-08-19 comparison audit
 * actually hit: هاش priced as imported stock against Iranian-mill SKUs, pages
 * that group by thickness and publish no brand at all, per-شاخه rows sitting
 * next to per-kg ones, and نبشی sized in cm on our side and mm on theirs.
 */
import { describe, it, expect } from 'vitest';
import { AHANONLINE_TARGETS, type AhanonlineRow } from '@/lib/server/integrations/ahanonline';
import {
  allMappedSourcePaths,
  factoryScore,
  inchValue,
  jalaliDaysAgo,
  matchSku,
  norm,
  nums,
  sizeMatches,
  SKIP_REASONS,
  sourcePathsForSku,
  WRITE_REASON,
  type MatchableSku,
  type MatchConfig,
} from './priceSync.match';

const TODAY: [number, number, number] = [1405, 5, 31];

const CONFIG: MatchConfig = {
  minPriceToman: 10_000,
  maxPriceToman: 500_000,
  maxCandidateSpreadPct: 8,
  maxSourceAgeDays: 10,
  now: new Date('2026-08-22T09:00:00Z'),
};

function row(partial: Partial<AhanonlineRow> & { sourcePath: string }): AhanonlineRow {
  return {
    group: '',
    name: 'محصول',
    code: '1',
    priceToman: 70_000,
    priceRial: 700_000,
    cells: {},
    ...partial,
  };
}

function sku(partial: Partial<MatchableSku> = {}): MatchableSku {
  return {
    id: 'sku-1',
    name: 'میلگرد ۱۴ شاهین بناب',
    categorySlug: 'rebar',
    subCategorySlug: 'deformed',
    size: '۱۴',
    factory: 'شاهین بناب',
    priceBasis: 'kg',
    ...partial,
  };
}

/** A well-formed, per-kg, factory-gate rebar row from the mapped page. */
function rebarRow(over: Partial<AhanonlineRow> = {}): AhanonlineRow {
  return row({
    sourcePath: 'میلگرد/قیمت-میلگرد',
    group: 'میلگرد شاهین بناب',
    name: 'میلگرد 14 شاهین بناب A3',
    code: '5501',
    priceToman: 71_000,
    cells: {
      'سایز': '14',
      'واحد': 'کیلوگرم',
      'محل تحویل': 'کارخانه',
      'تاریخ بروزرسانی': '1405/5/31',
    },
    ...over,
  });
}

describe('normalization', () => {
  it('folds Persian digits, ZWNJ and ×/x into one comparable form', () => {
    expect(norm('۴۰×۸۰')).toBe('40*80');
    expect(norm('40x80')).toBe('40*80');
    expect(norm('نیم‌تنه')).toBe('نیم تنه');
    expect(nums('۲.۵ اینچ')).toEqual([2.5]);
  });

  it('reads inch sizes written as fractions, glyphs or decimals', () => {
    expect(inchValue('۲½ اینچ')).toBe(2.5);
    expect(inchValue('2 1/2')).toBe(2.5);
    expect(inchValue('3/4"')).toBe(0.75);
    expect(inchValue('۴ اینچ')).toBe(4);
    expect(inchValue('بدون سایز')).toBeNull();
  });
});

describe('factoryScore', () => {
  it('scores an identical mill 1, through the alias table', () => {
    expect(factoryScore('ذوب‌آهن اصفهان', 'ذوب آهن')).toBe(1);
    expect(factoryScore('شاهین بناب', 'شاهین بناب')).toBe(1);
  });

  it('scores a DIFFERENT mill below the write threshold', () => {
    expect(factoryScore('فایکو', 'ذوب آهن')).toBeLessThan(1);
    expect(factoryScore('یزد احرامیان', 'ظفر بناب')).toBeLessThan(1);
  });

  it('scores a blank side 0 — the brandless competitor pages must never match', () => {
    // «هاش HEB» / «پروفیل گالوانیزه ضخامت ۲» are thickness/class headings, not
    // mills. The audit's biggest deltas (+400%) all came from this population.
    expect(factoryScore('فایکو', '')).toBe(0);
    expect(factoryScore('', 'ذوب آهن')).toBe(0);
  });
});

describe('sizeMatches — the per-family rules', () => {
  it('نبشی: our leg in cm against their mm', () => {
    const s = sku({ categorySlug: 'angle-channel', subCategorySlug: 'nabshi', size: '۷', factory: 'آریان فولاد' });
    const r = row({ sourcePath: 'نبشی-و-ناودانی/نبشی', cells: { 'سایز': '70*70' } });
    expect(sizeMatches(s, r)).toBe(true);
    expect(sizeMatches({ ...s, size: '۸' }, r)).toBe(false);
  });

  it('پروفیل: a×b compared as an unordered pair', () => {
    const s = sku({ categorySlug: 'profile', subCategorySlug: 'box-rect', size: '۴۰×۸۰' });
    expect(sizeMatches(s, row({ sourcePath: 'انواع-پروفیل/پروفیل', cells: { 'سایز': '80*40' } }))).toBe(true);
    expect(sizeMatches(s, row({ sourcePath: 'انواع-پروفیل/پروفیل', cells: { 'سایز': '40*40' } }))).toBe(false);
  });

  it('لوله: inches, not raw numbers', () => {
    const s = sku({ categorySlug: 'pipe', subCategorySlug: 'galvanized', size: '۲½ اینچ' });
    expect(sizeMatches(s, row({ sourcePath: 'انواع-لوله/لوله-گالوانیزه', cells: { 'سایز': '2 1/2' } }))).toBe(true);
    expect(sizeMatches(s, row({ sourcePath: 'انواع-لوله/لوله-گالوانیزه', cells: { 'سایز': '2' } }))).toBe(false);
  });

  it('ورق: the THICKNESS column, not «سایز» (which is width×length there)', () => {
    const s = sku({ categorySlug: 'sheet', subCategorySlug: 'black', size: '۱۰' });
    const r = row({
      sourcePath: 'انواع-ورق/ورق-سیاه',
      cells: { 'ضخامت (میل)': '10', 'ابعاد': '1500*6000' },
    });
    expect(sizeMatches(s, r)).toBe(true);
  });
});

describe('the taxonomy mapping is keyed on slugs', () => {
  it('maps a sub-category by slug, so renaming its Persian label cannot unmap it', () => {
    expect(sourcePathsForSku(sku({ categorySlug: 'ibeam', subCategorySlug: 'hash-sabok' }))).toEqual([
      'تیرآهن-و-هاش/هاش',
    ]);
  });

  it('only maps pages the fetcher actually requests', () => {
    // Without this, adding a mapping for a page missing from AHANONLINE_TARGETS
    // would silently produce «سایز مطابقی پیدا نشد» for that whole sub-category
    // forever — the page is never fetched, so there is nothing to match.
    const fetched = new Set(AHANONLINE_TARGETS.map((t) => t.path));
    const missing = allMappedSourcePaths().filter((p) => !fetched.has(p));
    expect(missing).toEqual([]);
  });

  it('leaves lines the competitor does not sell unmapped', () => {
    expect(sourcePathsForSku(sku({ categorySlug: 'steel', subCategorySlug: 'stainless' }))).toBeUndefined();
    expect(sourcePathsForSku(sku({ categorySlug: 'angle-channel', subCategorySlug: 'val-post' }))).toBeUndefined();
  });

  it('does not map a VARIANT onto its plain equivalent', () => {
    // Found the hard way in the first live run: «نبشی لقمه ۱۰ آریان فولاد» was
    // priced from «نبشی 10*100*100 آریان فولاد» — same mill, same 100mm leg, so
    // every confidence gate passed, but a لقمه spacer is not a length of angle
    // and the write was +121%. ahanonline lists none of these three variants
    // (checked live: 0 لقمه and 0 unequal-leg rows of 82 on the نبشی page,
    // 0 لانه‌زنبوری of 45 on the تیرآهن page), so the only safe mapping is none.
    for (const [categorySlug, subCategorySlug] of [
      ['angle-channel', 'spot'],
      ['angle-channel', 'angle-unequal'],
      ['ibeam', 'lane-zanburi'],
    ] as const) {
      expect(sourcePathsForSku(sku({ categorySlug, subCategorySlug }))).toBeUndefined();
    }
  });

  it('refuses to price a لقمه SKU even when a plain نبشی row matches perfectly', () => {
    const laghmeh = sku({
      categorySlug: 'angle-channel',
      subCategorySlug: 'spot',
      size: '۱۰',
      factory: 'آریان فولاد',
    });
    const plainAngle = row({
      sourcePath: 'نبشی-و-ناودانی/نبشی',
      group: 'نبشی آریان فولاد',
      name: 'نبشی 10*100*100 آریان فولاد 6 متری کارخانه',
      priceToman: 78_281,
      cells: { 'سایز': '100*100', 'واحد': 'کیلوگرم', 'محل تحویل': 'کارخانه', 'تاریخ بروزرسانی': '1405/5/31' },
    });
    const res = matchSku(laghmeh, [plainAngle], CONFIG, TODAY);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(SKIP_REASONS.noMapping);
  });
});

describe('matchSku — when a price may be written', () => {
  it('writes an exact factory + size match at the competitor price', () => {
    const res = matchSku(sku(), [rebarRow()], CONFIG, TODAY);
    expect(res.ok).toBe(true);
    expect(res.reason).toBe(WRITE_REASON);
    if (res.ok) expect(res.priceToman).toBe(71_000);
    expect(res.confidence).toBe('exact');
  });

  it('refuses a size-only match against a DIFFERENT mill', () => {
    // The audit's «تیرآهن هاش سبک ۱۸ فایکو → ذوب آهن، +447%» case: a real
    // number, a real size, and the wrong product.
    const res = matchSku(
      sku({ factory: 'فایکو' }),
      [rebarRow({ group: 'میلگرد ذوب آهن' })],
      CONFIG,
      TODAY,
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(SKIP_REASONS.lowConfidence);
  });

  it('refuses a page that publishes no brand at all', () => {
    const res = matchSku(
      sku({ categorySlug: 'ibeam', subCategorySlug: 'hash-sabok', size: '۱۸', factory: 'فایکو' }),
      [
        row({
          sourcePath: 'تیرآهن-و-هاش/هاش',
          group: 'هاش HEA', // a class heading, not a mill
          priceToman: 200_000,
          cells: { 'سایز': '18', 'واحد': 'کیلوگرم', 'تاریخ بروزرسانی': '1405/5/31' },
        }),
      ],
      CONFIG,
      TODAY,
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(SKIP_REASONS.lowConfidence);
  });

  it('never converts a per-شاخه competitor row onto a per-kg SKU', () => {
    const res = matchSku(
      sku(),
      [rebarRow({ priceToman: 16_636_363, cells: { ...rebarRow().cells, 'واحد': 'شاخه' } })],
      CONFIG,
      TODAY,
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(SKIP_REASONS.notPerKgSource);
  });

  it('never mirrors onto a SKU that is not itself priced per kg', () => {
    const res = matchSku(sku({ priceBasis: 'branch' }), [rebarRow()], CONFIG, TODAY);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(SKIP_REASONS.notPerKgSku);
  });

  it('rejects a price outside the plausibility band', () => {
    // What a rial-vs-toman regression on their side looks like: every price
    // ten times too big. Writing it would multiply the whole catalog by ten.
    const res = matchSku(sku(), [rebarRow({ priceToman: 710_000 })], CONFIG, TODAY);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(SKIP_REASONS.outOfBand);
  });

  it('skips when equally-good rows disagree about the price', () => {
    const res = matchSku(
      sku(),
      [rebarRow({ code: 'a', priceToman: 71_000 }), rebarRow({ code: 'b', priceToman: 99_000 })],
      CONFIG,
      TODAY,
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(SKIP_REASONS.ambiguous);
  });

  it('takes the median when equally-good rows agree closely', () => {
    const res = matchSku(
      sku(),
      [
        rebarRow({ code: 'a', priceToman: 70_000 }),
        rebarRow({ code: 'b', priceToman: 71_000 }),
        rebarRow({ code: 'c', priceToman: 72_000 }),
      ],
      CONFIG,
      TODAY,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.priceToman).toBe(71_000);
  });

  it('prefers the factory-gate row over a بنگاه one', () => {
    const res = matchSku(
      sku(),
      [
        rebarRow({ code: 'bongah', priceToman: 73_000, cells: { ...rebarRow().cells, 'محل تحویل': 'بنگاه تهران' } }),
        rebarRow({ code: 'karkhane', priceToman: 71_000 }),
      ],
      CONFIG,
      TODAY,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.priceToman).toBe(71_000);
  });

  it('will not mirror a price the competitor themselves stopped maintaining', () => {
    const res = matchSku(
      sku(),
      [rebarRow({ cells: { ...rebarRow().cells, 'تاریخ بروزرسانی': '1405/4/20' } })],
      CONFIG,
      TODAY,
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(SKIP_REASONS.sourceStale);
  });

  it('reports an unmapped sub-category and a factory-less SKU distinctly', () => {
    expect(matchSku(sku({ subCategorySlug: 'coupler' }), [rebarRow()], CONFIG, TODAY).reason).toBe(
      SKIP_REASONS.noMapping,
    );
    expect(matchSku(sku({ factory: null }), [rebarRow()], CONFIG, TODAY).reason).toBe(
      SKIP_REASONS.noFactory,
    );
    expect(matchSku(sku({ size: '۹۹' }), [rebarRow()], CONFIG, TODAY).reason).toBe(
      SKIP_REASONS.noSizeMatch,
    );
  });

  it('carries the evidence for the audit log on every outcome', () => {
    const res = matchSku(sku(), [rebarRow()], CONFIG, TODAY);
    expect(res.row?.code).toBe('5501');
    expect(res.factory).toBe('شاهین بناب');
    expect(res.unit).toBe('kg');
    expect(res.sourceUpdatedAt).toBe('1405/5/31');
  });
});

describe('jalaliDaysAgo', () => {
  it('measures a same-month gap and tolerates an unparseable date', () => {
    expect(jalaliDaysAgo('1405/5/31', TODAY)).toBe(0);
    expect(jalaliDaysAgo('1405/5/21', TODAY)).toBe(10);
    expect(jalaliDaysAgo('۱۴۰۵/۵/۲۹', TODAY)).toBe(2);
    expect(jalaliDaysAgo('نامشخص', TODAY)).toBeNull();
  });
});
