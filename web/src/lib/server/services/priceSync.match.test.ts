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
  rowUnit,
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
    grade: null,
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
    // The aluminium extrusions. ahanonline's `آلومینیوم/میلگرد-آلومینیوم`,
    // `آلومینیوم/لوله-آلومینیوم`, `آلومینیوم/نبشی-آلومینیوم` and
    // `انواع-پروفیل/پروفیل-آلومینیوم` all resolve and all parse to ZERO priced
    // rows — they are SEO shells. Re-checked 1405/06/03, third pass. These are
    // structurally un-mirrorable rather than merely unmapped, and the
    // staleness view (US-05.4) is how a human sees them instead.
    //
    // Note what is deliberately NOT in this list any more: copper-pipe,
    // copper-strip and val-post were here on the grounds that no page
    // published their unit. All three had a page the whole time — see the
    // third-pass block in `SOURCE_PATHS` — and the units they are quoted in
    // are now mirrored as themselves rather than converted.
    for (const subCategorySlug of ['aluminum-rebar', 'aluminum-pipe', 'aluminum-angle', 'aluminum-profile']) {
      expect(sourcePathsForSku(sku({ categorySlug: 'felezat-rangi', subCategorySlug }))).toBeUndefined();
    }
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

  it('never mirrors a per-kg row onto a SKU priced in another unit', () => {
    // `branch` became a mirrorable BASIS in the third pass (وال پست is per
    // شاخه on both sides), which must not be read as "a per-kg row can now
    // price it". The row here is per-کیلوگرم and the SKU is per-شاخه, so the
    // per-row unit check refuses it — the no-conversion rule, unchanged.
    const res = matchSku(sku({ priceBasis: 'branch' }), [rebarRow()], CONFIG, TODAY);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(SKIP_REASONS.notPerKgSource);
  });

  it('refuses a basis no mapped page prices at all', () => {
    // The basis gate itself, still live. Every basis the catalogue uses today
    // (kg, piece, branch, sqm, coil, sheet) has a like-for-like counterpart on
    // some mapped page; anything else has to fall out here rather than be
    // converted into one.
    const res = matchSku(sku({ priceBasis: 'ton' }), [rebarRow()], CONFIG, TODAY);
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
    // Deliberately a slug that does not exist in the catalogue at all. This
    // used to be `coupler`, which stopped being an example of "unmapped" the
    // moment the کوپلر page was added to SOURCE_PATHS — the assertion was
    // right and its fixture had simply been overtaken.
    expect(
      matchSku(sku({ subCategorySlug: 'no-such-sub-category' }), [rebarRow()], CONFIG, TODAY).reason,
    ).toBe(SKIP_REASONS.noMapping);
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

/**
 * The families added by the multi-source survey (US-05.3).
 *
 * ahanonline turned out to publish 352 `/product-category/` pages against the
 * 32 the mirror was pointed at, and everything it could never price — تسمه,
 * کوپلر, stainless, non-ferrous — was sitting on pages nobody had mapped. The
 * catch is that those pages mostly do NOT brand their rows, so the original
 * "the mill must agree" rule cannot reach them. `IDENTITY` generalises that
 * rule rather than relaxing it: some other explicit, published token has to
 * agree instead.
 *
 * Every row literal below is a real one, copied from the live tables during
 * the survey (see `docs/price-sync-source-survey.md`), prices included — the
 * point is that the rule holds against what ahanonline actually serves, not
 * against a fixture shaped to pass.
 */
describe('matchSku — the variant-keyed families', () => {
  const steelSku = (name: string) =>
    sku({ name, categorySlug: 'sheet', subCategorySlug: 'steel', size: '۲', factory: null });

  it('prices ورق استیل off the alloy, and refuses when our SKU omits it', () => {
    const rows: AhanonlineRow[] = [
      row({
        sourcePath: 'انواع-ورق/ورق-استیل',
        group: 'ورق استیل آلیاژ 304',
        name: 'ورق استنلس استیل صنعتی 304L ضخامت 2 ابعاد 1500*3000',
        priceToman: 640_909,
        cells: {
          'ضخامت': '2',
          'آلیاژ': '304L',
          'حالت': 'شیت',
          'واحد': 'کیلوگرم',
          'تاریخ بروزرسانی': '1405/5/31',
        },
      }),
      row({
        sourcePath: 'انواع-ورق/ورق-استیل',
        group: 'ورق استیل آلیاژ 316',
        name: 'ورق استنلس استیل صنعتی 316L ضخامت 2 ابعاد 1500*3000',
        priceToman: 1_109_091,
        cells: {
          'ضخامت': '2',
          'آلیاژ': '316L',
          'حالت': 'شیت',
          'واحد': 'کیلوگرم',
          'تاریخ بروزرسانی': '1405/5/31',
        },
      }),
    ];

    const l304 = matchSku(steelSku('ورق استیل ۲ 304L'), rows, CONFIG, TODAY);
    expect(l304.ok).toBe(true);
    expect(l304.ok && l304.priceToman).toBe(640_909);

    const l316 = matchSku(steelSku('ورق استیل ۲ 316L'), rows, CONFIG, TODAY);
    expect(l316.ok && l316.priceToman).toBe(1_109_091);

    // Same size, both alloys on offer, ours does not say which. A 1.7× coin
    // flip — the whole reason this reason code exists.
    const blind = matchSku(steelSku('ورق استیل ۲'), rows, CONFIG, TODAY);
    expect(blind.ok).toBe(false);
    expect(blind.reason).toBe(SKIP_REASONS.missingVariant);
  });

  it('does not let «304» satisfy a «304L» row', () => {
    const rows = [
      row({
        sourcePath: 'انواع-ورق/ورق-استیل',
        priceToman: 640_909,
        cells: { 'ضخامت': '2', 'آلیاژ': '304L', 'واحد': 'کیلوگرم' },
      }),
    ];
    const res = matchSku(steelSku('ورق استیل ۲ 304'), rows, CONFIG, TODAY);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(SKIP_REASONS.missingVariant);
  });

  it('mirrors کوپلر per عدد, matching نوع as well as سایز', () => {
    const rows: AhanonlineRow[] = [
      row({
        sourcePath: 'میلگرد/کوپلر',
        group: 'کوپلر انتهایی',
        name: 'کوپلر سایز 18 نوع انتهایی',
        priceToman: 82_800,
        cells: { 'سایز': '18', 'نوع': 'انتهایی', 'واحد': 'عدد', 'تاریخ بروزرسانی': '1405/5/31' },
      }),
      row({
        sourcePath: 'میلگرد/کوپلر',
        group: 'کوپلر بغل پیچ',
        name: 'کوپلر سایز 18 نوع بغل پیچ',
        priceToman: 678_500,
        cells: { 'سایز': '18', 'نوع': 'بغل پیچ', 'واحد': 'عدد', 'تاریخ بروزرسانی': '1405/5/31' },
      }),
    ];
    const coupler = (name: string) =>
      sku({
        name,
        categorySlug: 'rebar',
        subCategorySlug: 'coupler',
        size: '۱۸',
        factory: null,
        priceBasis: 'piece',
      });

    const end = matchSku(coupler('کوپلر انتهایی ۱۸'), rows, CONFIG, TODAY);
    expect(end.ok).toBe(true);
    expect(end.ok && end.priceToman).toBe(82_800);
    expect(end.unit).toBe('piece');

    // 8× apart at the same size — نوع is the entire difference.
    const side = matchSku(coupler('کوپلر بغل پیچ ۱۸'), rows, CONFIG, TODAY);
    expect(side.ok && side.priceToman).toBe(678_500);
  });

  it('looks past a filler noun in the source’s نوع', () => {
    // ahanonline calls this «خدمات رزوه زنی میلگرد»; we call it «کوپلر رزوه
    // زنی میلگرد». Only «خدمات» differs, and no other نوع on the page carries
    // it, so «رزوه زنی میلگرد» still does the identifying on its own.
    const rows = [
      row({
        sourcePath: 'میلگرد/کوپلر',
        group: 'کوپلر رزوه زنی میلگرد',
        name: 'کوپلر سایز 16 نوع خدمات رزوه زنی میلگرد',
        priceToman: 69_000,
        cells: { 'سایز': '16', 'نوع': 'خدمات رزوه زنی میلگرد', 'واحد': 'عدد' },
      }),
      row({
        sourcePath: 'میلگرد/کوپلر',
        group: 'کوپلر انتهایی',
        name: 'کوپلر سایز 16 نوع انتهایی',
        priceToman: 69_000,
        cells: { 'سایز': '16', 'نوع': 'انتهایی', 'واحد': 'عدد' },
      }),
    ];
    const res = matchSku(
      sku({
        name: 'کوپلر رزوه زنی میلگرد ۱۶',
        categorySlug: 'rebar',
        subCategorySlug: 'coupler',
        size: '۱۶',
        factory: null,
        priceBasis: 'piece',
      }),
      rows,
      CONFIG,
      TODAY,
    );
    expect(res.ok).toBe(true);
    expect(res.factory).toBe('خدمات رزوه زنی میلگرد');
  });

  it('still refuses to convert between units, per-عدد included', () => {
    const perPiece = row({
      sourcePath: 'میلگرد/کوپلر',
      name: 'کوپلر سایز 18 نوع انتهایی',
      priceToman: 82_800,
      cells: { 'سایز': '18', 'نوع': 'انتهایی', 'واحد': 'عدد' },
    });
    const res = matchSku(
      sku({
        name: 'کوپلر انتهایی ۱۸',
        categorySlug: 'rebar',
        subCategorySlug: 'coupler',
        size: '۱۸',
        factory: null,
        priceBasis: 'kg',
      }),
      [perPiece],
      CONFIG,
      TODAY,
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(SKIP_REASONS.notPerKgSource);
  });

  it('leaves a basis nothing prices like-for-like alone', () => {
    // A basis is mirrorable only where some mapped page publishes THE SAME
    // unit. `coil` earned that in the third pass because ahanonline's لوله مسی
    // table quotes 15-متری coils — but only on that page. Asked to price a
    // per-coil تسمه SKU, whose page is per-kg throughout, the matcher must
    // still refuse rather than multiply through `theoretical_weight_kg`, which
    // is the unverified seed data it has always declined to build on.
    const stripRow = row({
      sourcePath: 'انواع-ورق/تسمه',
      name: 'تسمه 14*100 نوردی',
      priceToman: 111_364,
      cells: { 'ضخامت': '14', 'حالت': 'نوردی', 'واحد': 'کیلوگرم', 'تاریخ بروزرسانی': '1405/5/31' },
    });
    const res = matchSku(
      sku({ name: 'تسمه نوردی ۱۴×۱۰۰', categorySlug: 'sheet', subCategorySlug: 'strip', priceBasis: 'coil' }),
      [stripRow],
      CONFIG,
      TODAY,
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(SKIP_REASONS.notPerKgSource);
  });

  it('separates «our catalogue lacks the variant» from «the source publishes none»', () => {
    const noVariant = row({
      sourcePath: 'انواع-ورق/ورق-استیل',
      priceToman: 640_909,
      cells: { 'ضخامت': '2', 'آلیاژ': '-', 'واحد': 'کیلوگرم' },
    });
    const res = matchSku(steelSku('ورق استیل ۲'), [noVariant], CONFIG, TODAY);
    expect(res.ok).toBe(false);
    // A lone dash is "not applicable", not an alloy every row shares.
    expect(res.reason).toBe(SKIP_REASONS.sourceNoVariant);
  });

  it('matches تسمه on ضخامت and حالت, the two things both sides publish', () => {
    const rows: AhanonlineRow[] = [
      row({
        sourcePath: 'انواع-ورق/تسمه',
        group: 'تسمه نوردی',
        name: 'تسمه 5 عرض 50 میلیمتر نوردی',
        priceToman: 74_545,
        cells: {
          'حالت': 'نوردی',
          'ضخامت': '5',
          'عرض': 'عرض 50 میلیمتر',
          'تاریخ بروزرسانی': '1405/5/31',
        },
      }),
      row({
        sourcePath: 'انواع-ورق/تسمه',
        group: 'تسمه ماشینکاری',
        name: 'تسمه 5 عرض 50 میلیمتر ماشینکاری',
        priceToman: 111_364,
        cells: {
          'حالت': 'ماشینکاری',
          'ضخامت': '5',
          'عرض': 'عرض 50 میلیمتر',
          'تاریخ بروزرسانی': '1405/5/31',
        },
      }),
    ];
    const strip = (name: string, size: string) =>
      sku({ name, size, categorySlug: 'sheet', subCategorySlug: 'strip', factory: null });

    // Our تسمه SKUs carry the width in the NAME and the bare thickness in
    // `size` — the fixture mirrors the real rows, not a convenient shape.
    const machined = matchSku(strip('تسمه ماشینکاری ۵×۵۰', '۵'), rows, CONFIG, TODAY);
    expect(machined.ok && machined.priceToman).toBe(111_364);
    // 1.5× apart at the same thickness — حالت is the entire difference.
    const rolled = matchSku(strip('تسمه نوردی ۵×۵۰', '۵'), rows, CONFIG, TODAY);
    expect(rolled.ok && rolled.priceToman).toBe(74_545);

    // A thickness they do not stock is a skip, not the nearest row.
    const noSuch = matchSku(strip('تسمه ماشینکاری ۹۹×۵۰', '۹۹'), rows, CONFIG, TODAY);
    expect(noSuch.ok).toBe(false);
    expect(noSuch.reason).toBe(SKIP_REASONS.noSizeMatch);
  });

  it('drops a تسمه width the day ahanonline prices widths apart', () => {
    // The width is not compared (our `size` has no width to compare), so the
    // spread gate is what stands between us and a coin flip if their per-width
    // prices ever diverge. Same حالت, same ضخامت, 34% apart.
    const diverged: AhanonlineRow[] = [
      row({
        sourcePath: 'انواع-ورق/تسمه',
        priceToman: 111_364,
        cells: { 'حالت': 'ماشینکاری', 'ضخامت': '5', 'عرض': 'عرض 50 میلیمتر' },
      }),
      row({
        sourcePath: 'انواع-ورق/تسمه',
        priceToman: 149_000,
        cells: { 'حالت': 'ماشینکاری', 'ضخامت': '5', 'عرض': 'عرض 120 میلیمتر' },
      }),
    ];
    const res = matchSku(
      sku({
        name: 'تسمه ماشینکاری ۵×۵۰',
        size: '۵',
        categorySlug: 'sheet',
        subCategorySlug: 'strip',
        factory: null,
      }),
      diverged,
      CONFIG,
      TODAY,
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(SKIP_REASONS.ambiguous);
  });

  it('reads اراک off «نورد آلومینیوم اراک» without loosening the factory rule', () => {
    // The material word was the only thing that differed; before it joined the
    // stopword list this scored 0.5 and every aluminium SKU was skipped.
    expect(factoryScore('اراک', 'نورد آلومینیوم اراک')).toBe(1);
    // …and it must still refuse two genuinely different mills.
    expect(factoryScore('اراک', 'نورد آلومینیوم پارس')).toBe(0);
  });

  it('judges a stainless price against its own band, not the carbon-steel one', () => {
    const stainless = row({
      sourcePath: 'انواع-ورق/ورق-استیل',
      priceToman: 1_109_091,
      cells: { 'ضخامت': '2', 'آلیاژ': '316L', 'واحد': 'کیلوگرم' },
    });
    // 1,109,091 is >2× the global 500,000 maximum and entirely correct for 316L.
    expect(matchSku(steelSku('ورق استیل ۲ 316L'), [stainless], CONFIG, TODAY).ok).toBe(true);

    // The band still has to catch a rial/toman flip, which is a 10× move.
    const flipped = matchSku(
      steelSku('ورق استیل ۲ 316L'),
      [row({ ...stainless, priceToman: 11_090_910 })],
      CONFIG,
      TODAY,
    );
    expect(flipped.ok).toBe(false);
    expect(flipped.reason).toBe(SKIP_REASONS.outOfBand);
  });

  it('reads the Arabic-Indic decimal separator as one number', () => {
    // «۱٫۵» used to parse as [1, 5], so a 1.5mm sheet size-matched the 1mm row.
    expect(nums('۱٫۵')).toEqual([1.5]);
    expect(nums('۰٫۴۷')).toEqual([0.47]);
    expect(norm('۱٫۵')).toBe('1.5');
  });

  it('keeps every newly mapped page in the fetcher’s target list', () => {
    const targets = new Set<string>(AHANONLINE_TARGETS.map((t) => t.path));
    for (const path of allMappedSourcePaths()) {
      expect(targets.has(path), `${path} is mapped but never fetched`).toBe(true);
    }
  });
});

/**
 * The stainless families, unlocked by reading the alloy out of `skus.grade`.
 *
 * The source survey reported these as un-mirrorable because «our SKU names
 * carry a country (هند/تایوان/چین) and no alloy». That was true of the names
 * and false of the catalogue: `grade` was populated on all 55 of them, and the
 * stored price agrees with ahanonline's row for that alloy to the rial. Every
 * row literal below is copied from the live tables on 1405/06/01, prices
 * included.
 */
describe('matchSku — the alloy-keyed (stainless) families', () => {
  /** میلگرد استیل, whose table emits ASCII `size`/`standard`/`unit` headers. */
  const bar = (size: string, standard: string, priceToman: number) =>
    row({
      sourcePath: 'میلگرد/میلگرد-استیل',
      priceToman,
      cells: { size, standard, state: '6 متری', unit: 'کیلوگرم' },
    });

  const barSku = (name: string, grade: string | null, size = '۱۲') =>
    sku({ name, categorySlug: 'rebar', subCategorySlug: 'stainless', size, grade, factory: 'هند' });

  const bars = [bar('12', '304L', 831_818), bar('12', '316L', 1_218_182), bar('12', '310S', 1_919_091)];

  it('prices each alloy off `grade`, not off the SKU name or the country', () => {
    // The name says «هند» on all three and the price still lands on the alloy:
    // 2.3× apart, and the country moves none of it.
    expect(matchSku(barSku('میلگرد استیل ۱۲ هند', '304L'), bars, CONFIG, TODAY)).toMatchObject({
      ok: true,
      priceToman: 831_818,
    });
    expect(matchSku(barSku('میلگرد استیل ۱۲ هند', '316L'), bars, CONFIG, TODAY)).toMatchObject({
      ok: true,
      priceToman: 1_218_182,
    });
    expect(matchSku(barSku('میلگرد استیل ۱۲ هند', '310S'), bars, CONFIG, TODAY)).toMatchObject({
      ok: true,
      priceToman: 1_919_091,
    });
  });

  it('demands EQUALITY, so «304» never satisfies a «304L» row', () => {
    // The `name` mode's token-containment test would pass here — «304» is a
    // substring of «304L» — and 304 vs 304L trade 6% apart on their own لوله
    // table. Equality is the whole reason `grade` is a separate mode.
    const res = matchSku(barSku('میلگرد استیل ۱۲ هند', '304'), bars, CONFIG, TODAY);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(SKIP_REASONS.variantNotStocked);
  });

  it('says «fill in the alloy» only when the alloy is actually missing', () => {
    const blind = matchSku(barSku('میلگرد استیل ۱۲ هند', null), bars, CONFIG, TODAY);
    expect(blind.ok).toBe(false);
    expect(blind.reason).toBe(SKIP_REASONS.missingVariant);

    // …and NOT when we know our alloy and they simply do not stock this size
    // in it. میلگرد ۶ is 310S-only on their table; our 304L bar of that size is
    // not a catalogue defect, and telling the operator to go and fill a field
    // that already holds the right value would send them on a dead errand.
    const notStocked = matchSku(
      barSku('میلگرد استیل ۶ هند', '304L', '۶'),
      [bar('6', '310S', 1_939_091)],
      CONFIG,
      TODAY,
    );
    expect(notStocked.ok).toBe(false);
    expect(notStocked.reason).toBe(SKIP_REASONS.variantNotStocked);
  });

  it('reads لوله استیل in inches even though its category is استیل, not لوله', () => {
    // `INCH_CATEGORIES` is keyed on the CATEGORY slug and لوله استیل sits under
    // استیل, so without `INCH_KEYS` this fell through to "the first number
    // agrees" — where ۲½ اینچ and ۲ اینچ become the same product.
    const pipeRows = [
      row({
        sourcePath: 'استنلس-استیل/لوله-استیل/لوله-استیل-صنعتی',
        priceToman: 1_800_000,
        cells: { 'سایز': '2 اینچ', 'رده': '10', 'آلیاژ': '316L', 'واحد': 'کیلوگرم' },
      }),
      row({
        sourcePath: 'استنلس-استیل/لوله-استیل/لوله-استیل-صنعتی',
        priceToman: 886_806,
        cells: { 'سایز': '2 1/2 اینچ', 'رده': '10', 'آلیاژ': '304', 'واحد': 'کیلوگرم' },
      }),
    ];
    const twoAndAHalf = sku({
      name: 'لوله استیل ۲½ اینچ',
      categorySlug: 'steel',
      subCategorySlug: 'pipe',
      size: '۲½ اینچ',
      grade: '316L',
      factory: null,
    });
    const res = matchSku(twoAndAHalf, pipeRows, CONFIG, TODAY);
    expect(res.ok).toBe(false);
    // Not `write:exact` at 1,800,000 off the 2-inch row, and not
    // `missingVariant` either: they stock 2½ in 304, we sell it in 316L.
    expect(res.reason).toBe(SKIP_REASONS.variantNotStocked);
  });

  it('keeps the stainless price bands wide enough for stainless prices', () => {
    // Every one of these trades above the global 500,000 ceiling, which is a
    // carbon-steel-per-kg number. Without a per-family band each correct match
    // above would have been discarded as `price-out-of-band`.
    for (const [grade, price] of [
      ['304L', 831_818],
      ['310S', 1_919_091],
    ] as const) {
      const res = matchSku(barSku('میلگرد استیل ۱۲ هند', grade), bars, CONFIG, TODAY);
      expect(res.ok, `${grade} was rejected by the price band`).toBe(true);
      if (res.ok) expect(res.priceToman).toBe(price);
    }
  });

  it('will not price نبشی/پروفیل استیل off a row that only shares a first number', () => {
    // Their پروفیل table carries 30*20 and 30*30 at different prices. Strict
    // dimension matching, same rule as چهارپهلو.
    const profileRows = [
      row({
        sourcePath: 'استنلس-استیل/پروفیل-استیل',
        priceToman: 840_175,
        cells: { 'ابعاد': '30*20', 'ضخامت': '1', 'آلیاژ': '304', 'واحد': 'کیلوگرم' },
      }),
    ];
    const thirtySquare = sku({
      name: 'پروفیل استیل ۳۰×۳۰',
      categorySlug: 'steel',
      subCategorySlug: 'profile',
      size: '۳۰×۳۰',
      grade: '304',
      factory: null,
    });
    expect(matchSku(thirtySquare, profileRows, CONFIG, TODAY).reason).toBe(SKIP_REASONS.noSizeMatch);
  });
});

describe('matchSku — the specialty lines (US-05.3, third pass)', () => {
  /** وال پست: one product, no mill on either side, one row per size. */
  function valPostRow(size: string, priceToman: number): AhanonlineRow {
    return row({
      sourcePath: 'نبشی-و-ناودانی/وال-پست',
      group: 'وال پست ضخامت 2 میلیمتر',
      name: `وال پست 2 ${size}`,
      priceToman,
      cells: { 'بال': '7', 'ضخامت': '2', 'سایز': size, 'تاریخ بروزرسانی': '1405/5/31' },
    });
  }
  const valPost = (size: string) =>
    sku({
      name: `وال پست ${size}`,
      categorySlug: 'angle-channel',
      subCategorySlug: 'val-post',
      size,
      factory: null,
      priceBasis: 'branch',
    });

  it('prices a size-only family whose page publishes no mill on either side', () => {
    const res = matchSku(
      valPost('۱۰×۲۰'),
      [valPostRow('10*20', 113_827), valPostRow('15*20', 160_688)],
      CONFIG,
      TODAY,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.priceToman).toBe(113_827);
  });

  it('reads a unitless وال پست row as per-شاخه, not per-kg', () => {
    // Their table has no «واحد» column at all. Left on the per-kg default this
    // SKU would skip as `source-not-per-kg` forever; read as per-kg by a
    // per-kg SKU it would put a 113,827 شاخه price on a single kilogram.
    const perKg = { ...valPost('۱۰×۲۰'), priceBasis: 'kg' };
    expect(matchSku(perKg, [valPostRow('10*20', 113_827)], CONFIG, TODAY).reason).toBe(
      SKIP_REASONS.notPerKgSource,
    );
  });

  it('still refuses a size-only family whose rows stop agreeing on the price', () => {
    // The whole safety argument for `size-only`. The day ahanonline adds a
    // second ضخامت to this table, two rows match one size and disagree — and
    // the family must degrade to a skip on its own, with no rule to remember.
    const res = matchSku(
      valPost('۱۰×۲۰'),
      [valPostRow('10*20', 113_827), valPostRow('10*20', 165_000)],
      CONFIG,
      TODAY,
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(SKIP_REASONS.ambiguous);
  });

  /** لوله مسی: mill AND wall thickness, with حالت carrying the unit. */
  function copperRow(over: {
    size: string;
    thickness: string;
    halat: string;
    mill: string;
    priceToman: number;
  }): AhanonlineRow {
    return row({
      sourcePath: 'انواع-لوله/لوله-مسی',
      group: `لوله مسی ${over.mill}`,
      name: `لوله مسی ${over.thickness} ${over.size} ${over.mill} ${over.halat} بنگاه تهران`,
      priceToman: over.priceToman,
      cells: {
        'ضخامت': over.thickness,
        size: over.size,
        'حالت': over.halat,
        'تاریخ بروزرسانی': '1405/5/31',
      },
    });
  }
  const copperSku = (mill: string) =>
    sku({
      name: `لوله مسی ۳/۴ اینچ ${mill}`,
      categorySlug: 'felezat-rangi',
      subCategorySlug: 'copper-pipe',
      size: '۳/۴ اینچ',
      grade: 'ضخامت ۰.۸۱',
      factory: mill,
      priceBasis: 'coil',
    });

  const copperRows = [
    copperRow({ size: '"3/4', thickness: '0.81', halat: '15 متری', mill: 'بابک', priceToman: 19_264_749 }),
    copperRow({ size: '"3/4', thickness: '0.63', halat: '15 متری', mill: 'بابک', priceToman: 14_904_979 }),
    // The 6-متری straight length: same mill, same size, same ضخامت, 3.5× apart.
    copperRow({ size: '"3/4', thickness: '0.81', halat: '6 متری', mill: 'بابک', priceToman: 5_463_984 }),
    copperRow({ size: '"3/4', thickness: '0.81', halat: '15 متری', mill: 'مهر اصل', priceToman: 18_008_491 }),
  ];

  it('picks the row matching BOTH the mill and the wall thickness', () => {
    const res = matchSku(copperSku('بابک'), copperRows, CONFIG, TODAY);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.priceToman).toBe(19_264_749);
    const other = matchSku(copperSku('مهر اصل'), copperRows, CONFIG, TODAY);
    expect(other.ok).toBe(true);
    if (other.ok) expect(other.priceToman).toBe(18_008_491);
  });

  it('never prices a 15-متری coil off the 6-متری length of the same pipe', () => {
    // The one way this family could go badly wrong: 5,463,984 against
    // 19,264,749 for what reads as the same product everywhere but «حالت».
    const onlySixMetre = [
      copperRow({ size: '"3/4', thickness: '0.81', halat: '6 متری', mill: 'بابک', priceToman: 5_463_984 }),
    ];
    const res = matchSku(copperSku('بابک'), onlySixMetre, CONFIG, TODAY);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(SKIP_REASONS.notPerKgSource);
  });

  it('does not read ۱/۴ اینچ and ۱/۲ اینچ as the same size', () => {
    // فلزات رنگی is not the لوله category, so without an explicit inch rule
    // the generic "first number agrees" test reads both as 1 and prices a
    // quarter-inch coil off a half-inch row — a 2.3× error.
    const half = copperRow({
      size: '"1/2',
      thickness: '0.81',
      halat: '15 متری',
      mill: 'بابک',
      priceToman: 12_710_447,
    });
    const quarter = { ...copperSku('بابک'), name: 'لوله مسی ۱/۴ اینچ بابک', size: '۱/۴ اینچ' };
    expect(matchSku(quarter, [half], CONFIG, TODAY).reason).toBe(SKIP_REASONS.noSizeMatch);
  });

  it('compares a dimensional grade by its number, not its spelling', () => {
    // We store «ضخامت ۰.۸۱» and they publish «0.81». Under plain `grade`'s
    // string equality that reads as a hole in our catalogue that is not there.
    expect(matchSku(copperSku('بابک'), copperRows, CONFIG, TODAY).ok).toBe(true);
    // ...and 0.8 is still not 0.81.
    const eightTenths = { ...copperSku('بابک'), grade: 'ضخامت ۰.۸' };
    expect(matchSku(eightTenths, copperRows, CONFIG, TODAY).ok).toBe(false);
  });

  it('reads ساندویچ پانل’s سقفی/دیواری off the table heading', () => {
    // Their «مدل» column reads «دو رو ورق» on every row; the only place the
    // model appears is the bold heading above each table.
    const panelRow = (model: string, priceToman: number) =>
      row({
        sourcePath: 'انواع-ورق/ساندویچ-پانل',
        group: `ساندویچ پانل ${model}`,
        name: `ساندویچ پانل ${model} ضخامت 4 سانتی متری`,
        priceToman,
        cells: {
          'ضخامت(عایق)': 'ضخامت 4 سانتی متری',
          'مدل': 'دو رو ورق',
          'واحد': 'مترمربع',
          'تاریخ بروزرسانی': '1405/5/31',
        },
      });
    const rows = [panelRow('سقفی', 3_832_000), panelRow('دیواری', 3_709_091)];
    const wall = sku({
      name: 'ساندویچ پانل دیواری ضخامت ۴ سانتی‌متر',
      categorySlug: 'sheet',
      subCategorySlug: 'sandwich-panel',
      size: '۴',
      factory: null,
      priceBasis: 'sqm',
    });
    const res = matchSku(wall, rows, CONFIG, TODAY);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.priceToman).toBe(3_709_091);
  });

  it('reads «مترمربع» as sqm rather than as a linear metre', () => {
    const perSqm = row({
      sourcePath: 'انواع-ورق/ساندویچ-پانل',
      group: 'ساندویچ پانل سقفی',
      cells: { 'واحد': 'متر مربع' },
    });
    expect(rowUnit(perSqm)).toBe('sqm');
  });

  it('treats a mill written with the product noun as the same mill', () => {
    // «لوله اسپیرال کالوپ» against our «کالوپ» scored 0.5 — fuzzy, therefore
    // skipped — on an identical mill. All 12 لوله اسپیرال SKUs turned on this.
    expect(factoryScore('کالوپ', 'لوله اسپیرال کالوپ')).toBe(1);
    expect(factoryScore('نورد لوله و پوشش نیزار', 'لوله اسپیرال نورد لوله و پوشش نیزار')).toBe(1);
    // ...and it is still not a licence to match a different mill.
    expect(factoryScore('کالوپ', 'لوله اسپیرال نیزار')).toBeLessThan(1);
  });

  it('reads the mill out of «نام کالا» where میلگرد حرارتی publishes it nowhere else', () => {
    const heatRow = (name: string, priceToman: number) =>
      row({
        sourcePath: 'میلگرد/قیمت-میلگرد/میلگرد-ساده/میلگرد-حرارتی',
        group: 'میلگرد حرارتی',
        name,
        priceToman,
        cells: { 'نام کالا': name, 'تاریخ بروزرسانی': '1405/5/31' },
      });
    const rows = [
      heatRow('میلگرد ساده 6.5 ملایر کلاف تهران', 76_545),
      heatRow('میلگرد ساده 6.5 نطنز کلاف کارخانه', 76_636),
    ];
    const malayer = sku({
      name: 'میلگرد حرارتی ۶.۵ ملایر',
      categorySlug: 'rebar',
      subCategorySlug: 'heat-treated',
      size: '۶.۵',
      factory: 'ملایر',
    });
    const res = matchSku(malayer, rows, CONFIG, TODAY);
    expect(res.ok).toBe(true);
    // «کلاف تهران» is the delivery point, not a second mill — without the cut
    // this scores 0.5 against our «ملایر» and skips.
    if (res.ok) expect(res.priceToman).toBe(76_545);
  });
});
