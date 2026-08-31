import { describe, it, expect } from 'vitest';
import {
  sizeLabel,
  weightLabel,
  usesThickness,
  usesDimensions,
  dimensionsLabel,
  attributeColumns,
  factoryIsMeaningful,
  SIZE_LABEL,
  HEIGHT_LABEL,
  THICKNESS_LABEL,
  DIMENSIONS_LABEL,
  GRADE_LABEL,
  STANDARD_LABEL,
  ALLOY_LABEL,
  CONDITION_LABEL,
  COLOR_LABEL,
  SCHEDULE_LABEL,
  FACTORY_LABEL,
  BRAND_LABEL,
  factoryLabel,
  BRANCH_LENGTH_LABEL,
  CUSTOM_LENGTH_LABEL,
  LENGTH_LABEL,
  WEIGHT_LABEL,
  BRANCH_WEIGHT_LABEL,
  NOT_APPLICABLE,
  UNKNOWN_VALUE,
  regionFromFactory,
  groupModeFor,
  groupKeyFor,
} from './catalogLabels';

describe('sizeLabel', () => {
  it('calls the ورق attribute ضخامت', () => {
    expect(sizeLabel('sheet')).toBe(THICKNESS_LABEL);
    expect(usesThickness('sheet')).toBe(true);
  });

  it('leaves every other category on سایز', () => {
    for (const slug of ['rebar', 'ibeam', 'pipe', 'profile', 'angle-channel', 'wire', 'steel']) {
      expect(sizeLabel(slug)).toBe(SIZE_LABEL);
      expect(usesThickness(slug)).toBe(false);
    }
  });

  it('falls back to سایز for an unknown, mixed or missing category', () => {
    // A mixed list (the «استیل» hub page cross-lists sheet products) has no
    // single answer — the generic label is the safe one, never a wrong rename.
    expect(sizeLabel(undefined)).toBe(SIZE_LABEL);
    expect(sizeLabel(null)).toBe(SIZE_LABEL);
    expect(sizeLabel('')).toBe(SIZE_LABEL);
    expect(sizeLabel('something-new')).toBe(SIZE_LABEL);
  });

  it('calls only پروفیل Z height, without changing sibling or mixed profile lists', () => {
    expect(sizeLabel('profile', 'profil-z')).toBe(HEIGHT_LABEL);
    expect(sizeLabel('profile', 'box-square')).toBe(SIZE_LABEL);
    expect(sizeLabel('profile', null)).toBe(SIZE_LABEL);
  });

  it("calls پروفیل استیل's outside section «ابعاد» only", () => {
    expect(sizeLabel('steel', 'profile')).toBe(DIMENSIONS_LABEL);
    for (const sub of ['pipe', 'angle', 'channel', null]) {
      expect(sizeLabel('steel', sub)).toBe(SIZE_LABEL);
    }
  });

  it('calls فلزات‌رنگی\'s ورق subs «ضخامت», every sibling stays «سایز»', () => {
    // ahanonline.com's ورق آلومینیوم/ورق مسی pages both use «ضخامت», verified
    // 1405/06/08 — sub-scoped, not category-wide like the main ورق category,
    // because میلگرد/نبشی/لوله/پروفیل آلومینیوم genuinely mean سایز.
    for (const sub of ['aluminum-sheet', 'copper-sheet']) {
      expect(sizeLabel('felezat-rangi', sub)).toBe(THICKNESS_LABEL);
    }
    for (const sub of ['aluminum-rebar', 'aluminum-angle', 'copper-pipe', null]) {
      expect(sizeLabel('felezat-rangi', sub)).toBe(SIZE_LABEL);
    }
  });
});

describe('weightLabel', () => {
  it('calls the ورق attribute وزن — it is sold per برگ, not شاخه', () => {
    expect(weightLabel('sheet')).toBe(WEIGHT_LABEL);
  });

  it('leaves every other category on وزن شاخه', () => {
    for (const slug of ['rebar', 'ibeam', 'pipe', 'profile', 'angle-channel', 'wire', 'steel']) {
      expect(weightLabel(slug)).toBe(BRANCH_WEIGHT_LABEL);
    }
  });

  it('falls back to وزن شاخه for an unknown, mixed or missing category', () => {
    expect(weightLabel(undefined)).toBe(BRANCH_WEIGHT_LABEL);
    expect(weightLabel(null)).toBe(BRANCH_WEIGHT_LABEL);
    expect(weightLabel('')).toBe(BRANCH_WEIGHT_LABEL);
    expect(weightLabel('something-new')).toBe(BRANCH_WEIGHT_LABEL);
  });
});

describe('usesDimensions', () => {
  it("offers black sheet's stored size only, under ahanonline's «سایز» label", () => {
    expect(usesDimensions('sheet', 'black')).toBe(true);
    expect(dimensionsLabel('sheet', 'black')).toBe(SIZE_LABEL);
    expect(usesThickness('sheet')).toBe(true);
    expect(dimensionsLabel('sheet', 'black')).not.toBe(sizeLabel('sheet', 'black'));
  });

  it('never offers it to an unrelated category', () => {
    for (const slug of ['rebar', 'ibeam', 'pipe', 'profile', 'wire']) {
      expect(usesDimensions(slug)).toBe(false);
    }
  });

  it('offers ضخامت only to the three owner-approved نبشی subs', () => {
    for (const sub of ['nabshi', 'angle-unequal', 'spot']) {
      expect(usesDimensions('angle-channel', sub)).toBe(true);
      expect(dimensionsLabel('angle-channel', sub)).toBe(THICKNESS_LABEL);
    }

    for (const sub of ['val-post', 'tbar', 'anything-else', null]) {
      expect(usesDimensions('angle-channel', sub)).toBe(false);
      expect(dimensionsLabel('angle-channel', sub)).toBe(DIMENSIONS_LABEL);
    }
  });

  it('does not mislabel the missing sheet width as the shared «ابعاد» field', () => {
    for (const sub of [null, 'oiled', 'galvanized', 'pickled', 'colored', 'anything-new']) {
      expect(usesDimensions('sheet', sub)).toBe(false);
      expect(dimensionsLabel('sheet', sub)).toBe(DIMENSIONS_LABEL);
    }
  });

  it('offers verified sheet dimensions and stainless section thickness by sub only', () => {
    for (const sub of ['aluminum-sheet', 'copper-sheet']) {
      expect(usesDimensions('felezat-rangi', sub)).toBe(true);
      expect(dimensionsLabel('felezat-rangi', sub)).toBe(DIMENSIONS_LABEL);
    }
    for (const sub of ['angle', 'channel']) {
      expect(usesDimensions('steel', sub)).toBe(true);
      expect(dimensionsLabel('steel', sub)).toBe(THICKNESS_LABEL);
    }
    expect(usesDimensions('felezat-rangi', null)).toBe(false);
    expect(usesDimensions('steel', null)).toBe(false);
    expect(usesDimensions('steel', 'pipe')).toBe(false);
    for (const sub of ['prvfyl-snaty', 'profil-mobli', 'profil-galvanizeh', 'profil-z']) {
      expect(usesDimensions('profile', sub)).toBe(true);
      expect(dimensionsLabel('profile', sub)).toBe(THICKNESS_LABEL);
    }
    expect(usesDimensions('profile', null)).toBe(false);
    expect(usesDimensions('profile', 'box-square')).toBe(false);
  });

  it('says no for an unknown, mixed or missing category', () => {
    // Same reasoning as the size label: the «استیل» hub mixes categories, and
    // growing an extra column there because one cross-listed ورق row wandered
    // in would be wrong for every other row in the table.
    expect(usesDimensions(undefined)).toBe(false);
    expect(usesDimensions(null)).toBe(false);
    expect(usesDimensions('')).toBe(false);
    expect(usesDimensions('something-new')).toBe(false);
    expect(dimensionsLabel(undefined)).toBe(DIMENSIONS_LABEL);
  });
});

describe('the attribute columns (گرید / استاندارد / آلیاژ / حالت / طول)', () => {
  const row = (
    subCategoryId: string,
    fields: {
      grade?: string;
      condition?: string;
      standard?: string;
      schedule?: string;
      branchLengthM?: number;
    } = {},
  ) => ({ subCategoryId, ...fields });

  /** The one column a single-column table has. */
  const only = (categorySlug: string | null | undefined, sub: string | null) => {
    const cols = attributeColumns(categorySlug, sub);
    expect(cols).toHaveLength(1);
    return cols[0]!;
  };

  // لوله and نبشی‌وناودانی appear here with subs that are NOT in their
  // respective allow-lists, which is the point: the new columns must leave the
  // rest of each category — and every other category — on the plain «گرید».
  // ورق is not in this slug list at all — it deviates category-wide (its
  // «حالت» applies to every sub, including the mixed «همه» view), unlike
  // لوله and نبشی‌وناودانی, which only ever deviate for a named sub.
  // 1405/06/09: لوله and کلاف‌ومفتول no longer belong in the `null` half of
  // this loop — their mixed «همه» views now publish no attribute column at
  // all (their live subs share no honest common header). Their `['grade']`
  // FALLBACK for an unreconciled sub is unchanged, and is what is asserted
  // here; the mixed views get their own assertions further down.
  it('leaves every category outside the deviating ones exactly as it was', () => {
    // 1405/06/09: میلگرد, فلزات رنگی, لوله and کلاف‌ومفتول all left this
    // combined null+named loop — each now gives its mixed «همه» view
    // something other than plain «گرید» (`gradeAsStandard`, or `[]`), even
    // though named-but-unreconciled subs in لوله/کلاف‌ومفتول/فلزات رنگی still
    // fall back to «گرید» — that half is asserted separately just below
    // (لوله/کلاف‌ومفتول) and in each category's own section (فلزات رنگی,
    // میلگرد). نبشی‌وناودانی is the one category still answering «گرید» on
    // BOTH its mixed view and an unlisted sub.
    for (const slug of ['angle-channel']) {
      for (const sub of [null, 'anything']) {
        const col = only(slug, sub);
        expect(col.key).toBe('grade');
        expect(col.label).toBe(GRADE_LABEL);
        expect(col.cell(row('plain', { grade: 'A3' }))).toBe('A3');
        expect(col.cell(row('plain'))).toBe(UNKNOWN_VALUE);
        expect(col.card(row('plain', { grade: 'A3' }))).toBe('A3');
        expect(col.card(row('plain'))).toBeNull();
      }
    }
    // لوله and کلاف‌ومفتول: the fallback for a sub with no reconciled source
    // page survives, even though both mixed views changed.
    for (const slug of ['pipe', 'wire']) {
      const col = only(slug, 'anything');
      expect(col.key).toBe('grade');
      expect(col.label).toBe(GRADE_LABEL);
    }
  });

  it('falls back to «گرید» for an unknown, mixed or missing category', () => {
    expect(only(undefined, 'hash-sabok').label).toBe(GRADE_LABEL);
    expect(only(null, null).label).toBe(GRADE_LABEL);
  });

  /* ------------------------------- تیرآهن ------------------------------- */

  it('drops the column on plain/سبک تیرآهن, and gives هاش «استاندارد»+«حالت»', () => {
    // Plain تیرآهن and تیرآهن سبک publish no attribute column on any of the
    // four sources re-checked 1405/06/09 (ahanonline, teleahan, markazeahan,
    // esfahanahan): every one prices them on سایز plus a weight, and «وزن» is
    // this catalog's own weight column, not an attribute one.
    for (const sub of ['tirahan', 'light', 'ipe', 'anything-else']) {
      expect(attributeColumns('ibeam', sub)).toEqual([]);
    }
    // ahanonline's «تیرآهن-و-هاش/هاش» page carries a «حالت» column beside
    // «استاندارد» (re-verified live 1405/06/09), and teleahan's هاش page
    // labels the same fact «حالت» too. We read it from `branchLengthM`,
    // which هاش SKUs already store, rather than a second always-empty
    // column — but under the `branch` key, whose label AND «۱۲ متری» phrasing
    // match those sources, not `branchLength`'s «طول شاخه»/«۱۲ متر».
    for (const sub of ['hash-sabok', 'hash-sangin']) {
      const cols = attributeColumns('ibeam', sub);
      expect(cols.map((c) => c.key)).toEqual(['standard', 'branch']);
      expect(cols.map((c) => c.label)).toEqual([STANDARD_LABEL, CONDITION_LABEL]);
      expect(cols[1]!.cell(row(sub, { branchLengthM: 12 }))).toBe('۱۲ متری');
    }
    // The mixed «همه» view deliberately stays on the single-column default.
    const mixed = only('ibeam', null);
    expect(mixed.key).toBe('standard');
    expect(mixed.label).toBe(STANDARD_LABEL);
  });

  it('gives لانه‌زنبوری «استاندارد» alone — the column ahanonline publishes for it', () => {
    // ahanonline's `/تیرآهن-و-هاش/تیرآهن/تیرآهن-لانه-زنبوری/` price table
    // (fetched 1405/06/09) reads «نام کالا | سایز | استاندارد | واحد | برند |
    // محل تحویل», its استاندارد cell holding a castellated designation
    // («CPE»). Same `skus.standard` column هاش already uses; no «حالت», which
    // that page does not publish. All 4 live rows store null today, so the
    // column ships honestly empty — the aluminium-section convention.
    const col = only('ibeam', 'lane-zanburi');
    expect(col.key).toBe('standard');
    expect(col.label).toBe(STANDARD_LABEL);
    expect(col.cell(row('lane-zanburi', { standard: 'CPE' }))).toBe('CPE');
    expect(col.cell(row('lane-zanburi'))).toBe(UNKNOWN_VALUE);
    // It gains no length column: only هاش publishes one.
    expect(attributeColumns('ibeam', 'lane-zanburi').some((c) => c.key === 'branch')).toBe(false);
  });

  it('reads skus.standard on هاش rows, and dashes the ones it does not apply to', () => {
    const col = only('ibeam', null);
    expect(col.cell(row('hash-sabok', { standard: 'HEA', grade: 'ST37' }))).toBe('HEA');
    expect(col.cell(row('hash-sangin', { standard: 'HEB' }))).toBe('HEB');
    // Filled but empty-standard هاش row: «نامشخص» — the value is simply not
    // entered yet, which is true of every هاش SKU today.
    expect(col.cell(row('hash-sabok'))).toBe(UNKNOWN_VALUE);
    // A non-هاش تیرآهن row has no standard AND its `grade` is deliberately
    // ignored — the column does not apply to it at all.
    expect(col.cell(row('ipe', { grade: 'ST37' }))).toBe(NOT_APPLICABLE);
    expect(col.card(row('ipe', { grade: 'ST37' }))).toBeNull();
    expect(col.card(row('hash-sabok'))).toBeNull();
  });

  /* -------------------------------- ورق -------------------------------- */

  it("keeps ورق سیاه's verified «حالت» rollout fallback", () => {
    const col = only('sheet', 'black');
    expect(col.key).toBe('legacyCondition');
    expect(col.label).toBe(CONDITION_LABEL);
    // Before the guarded move runs, the known legacy value remains visible
    // byte-for-byte. Afterward the independent column wins.
    expect(col.cell(row('black', { grade: 'برش‌خورده' }))).toBe('برش‌خورده');
    expect(col.card(row('black', { grade: 'رول' }))).toBe('رول');
    expect(col.cell(row('black', { grade: 'رول', condition: 'برش‌خورده' }))).toBe('برش‌خورده');
    expect(col.cell(row('black'))).toBe(UNKNOWN_VALUE);
    expect(col.card(row('black'))).toBeNull();
  });

  it('prefers the independent condition column while retaining the rollout fallback', () => {
    const col = only('sheet', 'black');
    expect(col.cell(row('black', { condition: 'شیت', grade: 'رول' }))).toBe('شیت');
    expect(col.cell(row('black', { grade: 'رول' }))).toBe('رول');
  });

  it("matches each remaining ورق line's real attribute taxonomy", () => {
    for (const sub of ['oiled', 'pickled']) {
      const col = only('sheet', sub);
      expect(col.key).toBe('standard');
      expect(col.label).toBe(STANDARD_LABEL);
      expect(col.cell(row(sub, { standard: sub === 'pickled' ? 'W22' : 'ST12' }))).toBe(
        sub === 'pickled' ? 'W22' : 'ST12',
      );
    }
    expect(attributeColumns('sheet', 'galvanized')).toEqual([]);
    expect(attributeColumns('sheet', null)).toEqual([]);
  });

  it("relabels ورق رنگی's stored grade as «رنگ» without moving data", () => {
    const col = only('sheet', 'colored');
    expect(col.key).toBe('color');
    expect(col.label).toBe(COLOR_LABEL);
    expect(col.cell(row('colored', { grade: 'سفید یخچالی' }))).toBe('سفید یخچالی');
    expect(col.card(row('colored', { grade: 'آبی' }))).toBe('آبی');
    expect(col.cell(row('colored'))).toBe(UNKNOWN_VALUE);
  });

  it('publishes alloy and condition independently for aluminium sheet', () => {
    const cols = attributeColumns('felezat-rangi', 'aluminum-sheet');
    expect(cols.map((c) => c.label)).toEqual([ALLOY_LABEL, CONDITION_LABEL]);
    expect(
      cols.map((c) => c.cell(row('aluminum-sheet', { grade: '1050', condition: 'شیت' }))),
    ).toEqual(['1050', 'شیت']);
    expect(cols.map((c) => c.cell(row('aluminum-sheet', { grade: '1050' })))).toEqual([
      '1050',
      UNKNOWN_VALUE,
    ]);
  });

  it('publishes the verified condition on copper sheet and چهارپهلو', () => {
    expect(
      only('felezat-rangi', 'copper-sheet').cell(row('copper-sheet', { condition: 'شیت' })),
    ).toBe('شیت');
    const fourSquare = only('profile', 'chaharpahlu');
    expect(fourSquare.cell(row('chaharpahlu', { condition: 'ترانس' }))).toBe('ترانس');
    expect(fourSquare.cell(row('chaharpahlu', { grade: 'نرمال' }))).toBe('نرمال');
  });

  it('labels میلگرد آلومینیوم «آلیاژ» — grade is a real alloy on every live row', () => {
    // Verified 1405/06/08: all 57 live aluminum-rebar rows store a real
    // alloy series in `grade` («۷۰۰۰»), confirmed from the product names
    // themselves. Not an empty-column guess like the نبشی/پروفیل swaps.
    const col = only('felezat-rangi', 'aluminum-rebar');
    expect(col.key).toBe('alloy');
    expect(col.label).toBe(ALLOY_LABEL);
    expect(col.cell(row('aluminum-rebar', { grade: '7000' }))).toBe('7000');
  });

  it('relabels لوله مسی «ضخامت» — grade literally stores «ضخامت X.XX» on every live row', () => {
    // Verified 1405/06/08: all 45 live copper-pipe rows store the literal
    // string «ضخامت ۰.۸۱» in `grade` — the same mislabeled-not-empty pattern
    // as نبشی's وال‌پست, reusing its `gradeAsThickness` AttrKey rather than
    // duplicating it. ahanonline's own لوله مسی page confirms «ضخامت» is the
    // real column here, not «گرید».
    const cols = attributeColumns('felezat-rangi', 'copper-pipe');
    expect(cols.map((c) => c.key)).toEqual(['gradeAsThickness', 'branch']);
    expect(cols[0]!.label).toBe(THICKNESS_LABEL);
    expect(cols[0]!.cell(row('copper-pipe', { grade: 'ضخامت ۰.۸۱' }))).toBe('ضخامت ۰.۸۱');
  });

  it('gives لوله مسی the «حالت» ahanonline publishes beside that thickness', () => {
    // 1405/06/09. `انواع-لوله/لوله-مسی` (fetched 2026-08-31, «تاریخ
    // بروزرسانی» 1405/6/7) renders «ضخامت | size | حالت» over 54 priced rows
    // whose «حالت» reads «15 متری» — a fact all 15 of our live rows already
    // store in `branch_length_m`, and that nothing was displaying. A missing
    // column, not an empty cell.
    const col = attributeColumns('felezat-rangi', 'copper-pipe')[1]!;
    expect(col.key).toBe('branch');
    expect(col.label).toBe(CONDITION_LABEL);
    expect(col.cell(row('copper-pipe', { branchLengthM: 15 }))).toBe('۱۵ متری');
    expect(col.cell(row('copper-pipe'))).toBe(UNKNOWN_VALUE);
  });

  it('gives آلومینیوم section subs their own «ضخامت»+«طول شاخه», verified against ahanyekta.com', () => {
    // No ahanonline page prices these — checked against ahanyekta.com's
    // نبشی/لوله/پروفیل آلومینیوم pages instead (ناودانی included by the same
    // section-profile-family reasoning as its سیبلینگ نبشی). None of the
    // three currently has ANY stored thickness (checked live in prod), so the
    // ضخامت cell reads «نامشخص» — an honest gap, not a fabrication.
    //
    // Re-checked 2026-08-31: ahanonline DOES have نبشی آلومینیوم and لوله
    // آلومینیوم pages, but both render zero priced rows, and it has no
    // ناودانی آلومینیوم page at all — so there is still no ahanonline column
    // set for these three, and ahanyekta was unreachable on a second retry
    // 1405/06/09 too. Unified onto «حالت» anyway (owner-delegated call) on
    // internal consistency: every OTHER supplied-branch-length sub in the
    // whole catalog bar سپری now reads «حالت», so this sibling trio staying
    // on «طول شاخه» would be the one outlier with no source behind it either
    // way. Same `branch_length_m` field, display-only.
    for (const sub of ['aluminum-angle', 'aluminum-channel', 'aluminum-pipe']) {
      expect(usesDimensions('felezat-rangi', sub)).toBe(true);
      expect(dimensionsLabel('felezat-rangi', sub)).toBe(THICKNESS_LABEL);
      const col = only('felezat-rangi', sub);
      expect(col.key).toBe('branch');
      expect(col.label).toBe(CONDITION_LABEL);
      expect(col.cell(row(sub, { branchLengthM: 6 }))).toBe('۶ متری');
      expect(col.cell(row(sub))).toBe(UNKNOWN_VALUE);
    }
  });

  it('calls پروفیل آلومینیوم\'s branch fact «حالت», the word its ahanonline page uses', () => {
    // 1405/06/09. `انواع-پروفیل/پروفیل-آلومینیوم` (fetched 2026-08-31) exists
    // and prices 13 rows under «سایز | حالت | ضخامت» — the previous pass did
    // not find it and fell back to ahanyekta's «طول شاخه». ahanonline is the
    // reference the owner benchmarks against, the same tie-break STEEL_ATTRS
    // records. The ضخامت stays wired as before.
    expect(usesDimensions('felezat-rangi', 'aluminum-profile')).toBe(true);
    expect(dimensionsLabel('felezat-rangi', 'aluminum-profile')).toBe(THICKNESS_LABEL);
    const col = only('felezat-rangi', 'aluminum-profile');
    expect(col.key).toBe('branch');
    expect(col.label).toBe(CONDITION_LABEL);
    expect(col.label).not.toBe(BRANCH_LENGTH_LABEL);
    expect(col.cell(row('aluminum-profile', { branchLengthM: 6 }))).toBe('۶ متری');
  });

  it('reads تسمه مسی\'s «حالت» from the field that actually holds it', () => {
    // ahanonline's تسمه مسی page (`انواع-ورق/تسمه-مسی`, fetched 2026-08-31)
    // publishes «نام کالا | حالت» over 18 priced rows, every «حالت» cell the
    // fixed phrase «شاخه 4 متری». The header here was already right; the
    // FIELD was not. `condition` is null on all 18 live rows while that exact
    // string sits in `standard` on all 18 — so the column rendered «نامشخص»
    // over data we already had. Display-only rewire, no data migration; this
    // is the same shape of bug as ورق رنگی's حالت/grade mix-up.
    const col = only('felezat-rangi', 'copper-strip');
    expect(col.key).toBe('standardAsCondition');
    expect(col.label).toBe(CONDITION_LABEL);
    expect(col.cell(row('copper-strip', { standard: 'شاخه ۴ متری' }))).toBe('شاخه ۴ متری');
    // The old wiring must not silently keep working — a stored `condition`
    // is not what this sub publishes.
    expect(col.cell(row('copper-strip', { condition: 'شاخه ۴ متری' }))).toBe(UNKNOWN_VALUE);
  });

  it('drops the attribute column from the mixed فلزات رنگی view', () => {
    // Every priced sub now publishes «آلیاژ», «حالت» or «ضخامت» and none a
    // grade, so «گرید» there would be `NOT_APPLICABLE` for all 148 rows —
    // exactly why پروفیل's mixed view is empty too.
    expect(attributeColumns('felezat-rangi', null)).toEqual([]);
  });

  it('does not leak «حالت» into any other category', () => {
    for (const slug of ['rebar', 'ibeam', 'pipe', 'steel', 'angle-channel']) {
      for (const sub of [null, 'black']) {
        expect(
          attributeColumns(slug, sub).some(
            (c) => c.key === 'condition' || c.key === 'legacyCondition',
          ),
        ).toBe(false);
      }
    }
  });

  /* ------------------------------- پروفیل ------------------------------- */

  it('keeps «گرید» only on the unreconciled profile subs, never the mixed view', () => {
    // پروفیل ساختمانی is the last one left: it has no active priced row, so
    // there is nothing to reconcile against its source table yet. پروفیل
    // ستونی left this list 1405/06/09 — it has 6 priced rows and a live
    // ahanonline table, see below.
    for (const sub of ['prvfyl-sakhtmany']) {
      const col = only('profile', sub);
      expect(col.key).toBe('grade');
      expect(col.label).toBe(GRADE_LABEL);
    }
    // The priced subs disagree on «حالت»/«طول», but none has a grade. The
    // mixed page therefore omits the attribute column altogether.
    expect(attributeColumns('profile', null)).toEqual([]);
  });

  it('gives پروفیل ستونی the «ضخامت»+«حالت» its ahanonline table publishes', () => {
    // 1405/06/09. `انواع-پروفیل/پروفیل/قوطی-ستونی` (fetched 2026-08-31,
    // «تاریخ بروزرسانی» 1405/6/7) renders «سایز | ضخامت | حالت | برند» over
    // 14 priced rows — e.g. «90*90 | 2 | 6 متری | اطلس فولاد مازندران».
    // teleahan's پروفیل ساختمانی/صنعتی tables agree on «سایز | ضخامت | حالت».
    // This was the one profile line with active stock still on the bare
    // «گرید» fallback, and `grade` is null on all 6 of its rows — a column
    // that could only ever print «نامشخص» and that no source publishes.
    expect(usesDimensions('profile', 'profil-sotuni')).toBe(true);
    expect(dimensionsLabel('profile', 'profil-sotuni')).toBe(THICKNESS_LABEL);
    const col = only('profile', 'profil-sotuni');
    expect(col.key).toBe('profileCondition');
    expect(col.label).toBe(CONDITION_LABEL);
    expect(col.label).not.toBe(GRADE_LABEL);
    expect(col.cell(row('profil-sotuni', { branchLengthM: 6 }))).toBe('۶ متری');
    // Neither fact is stored on any live row yet — honestly empty, never
    // invented.
    expect(col.cell(row('profil-sotuni'))).toBe(UNKNOWN_VALUE);
  });

  it('replaces industrial and furniture grade with source-style «حالت»', () => {
    for (const sub of ['prvfyl-snaty', 'profil-mobli']) {
      const col = only('profile', sub);
      expect(col.key).toBe('profileCondition');
      expect(col.label).toBe(CONDITION_LABEL);
      expect(col.cell(row(sub, { branchLengthM: 6 }))).toBe('۶ متری');
      // A stored grade/condition is ignored: ahanonline's value here is the
      // supplied branch length, not a metallurgy or finish field.
      expect(col.cell(row(sub, { grade: 'ST37', condition: 'رول' }))).toBe(UNKNOWN_VALUE);
      expect(col.card(row(sub, { grade: 'ST37' }))).toBeNull();
    }
  });

  it('replaces galvanized grade with «طول», read from branch_length_m', () => {
    const col = only('profile', 'profil-galvanizeh');
    expect(col.key).toBe('length');
    expect(col.label).toBe(LENGTH_LABEL);
    expect(col.cell(row('profil-galvanizeh', { branchLengthM: 6 }))).toBe('۶ متری');
    expect(col.cell(row('profil-galvanizeh', { grade: 'ST37' }))).toBe(UNKNOWN_VALUE);
  });

  it('does not retain the former صنعتی «طول شاخه» wording', () => {
    const col = only('profile', 'prvfyl-snaty');
    expect(col.label).not.toBe(BRANCH_LENGTH_LABEL);
  });

  it('heads Z\'s column «طول» and prints «طول سفارشی» in it when unset', () => {
    // 1405/06/09: the header and the value were the wrong way round.
    // ahanonline's پروفیلz page (fetched 2026-08-31) heads this column
    // «طول(m)» and puts «طول سفارشی» in every one of its 8 priced CELLS; we
    // had the source's value as our header and a paraphrase («بر اساس سفارش»)
    // as our value. teleahan's پروفیل زد table has no length column at all,
    // so it neither confirms nor contradicts.
    const col = only('profile', 'profil-z');
    expect(col.key).toBe('customLength');
    expect(col.label).toBe(LENGTH_LABEL);
    expect(col.label).not.toBe(CUSTOM_LENGTH_LABEL);
    // پروفیل Z is cut to order, so an EMPTY length is an answer, not a gap —
    // «نامشخص» would tell the buyer we lost a number that never existed.
    expect(col.cell(row('profil-z'))).toBe(CUSTOM_LENGTH_LABEL);
    expect(col.card(row('profil-z'))).toBe(CUSTOM_LENGTH_LABEL);
    // A recorded length still wins — a cut-to-order product can be stocked in
    // one length, and that is worth saying.
    expect(col.cell(row('profil-z', { branchLengthM: 6 }))).toBe('۶ متر');
    expect(col.label).not.toBe(BRANCH_LENGTH_LABEL);
  });

  it('gives استیل BOTH «آلیاژ» and «طول شاخه» — a gain, not a swap', () => {
    const cols = attributeColumns('profile', 'prvfyl-astyl');
    expect(cols.map((c) => c.key)).toEqual(['alloy', 'branchLength']);
    expect(cols.map((c) => c.label)).toEqual([ALLOY_LABEL, BRANCH_LENGTH_LABEL]);
    // «آلیاژ» is `skus.grade` re-labelled: the stored grade of a stainless
    // profile genuinely IS its alloy (۲۰۱/۳۰۴/۳۱۶).
    expect(cols[0]!.cell(row('prvfyl-astyl', { grade: '۳۰۴' }))).toBe('۳۰۴');
    expect(cols[1]!.cell(row('prvfyl-astyl', { branchLengthM: 6 }))).toBe('۶ متر');
    expect(cols[1]!.cell(row('prvfyl-astyl'))).toBe(UNKNOWN_VALUE);
  });

  /* -------------------------------- میلگرد -------------------------------- */

  it('heads میلگرد\'s analysis column «استاندارد», the word both references use', () => {
    // 1405/06/09. Same stored `skus.grade`, different word above it.
    // ahanonline `میلگرد/قیمت-میلگرد` renders «سایز | استاندارد | محل تحویل»
    // over 560 priced rows reading A3/A2; teleahan `میلگرد/میلگرد-آجدار`
    // renders «نام محصول | سایز | استاندارد | محل تحویل» over 538. Both
    // fetched 2026-08-31, «تاریخ بروزرسانی» 1405/6/7. markazeahan (recorded in
    // PR #348, unreachable from outside Iran today) heads it «آنالیز». Three
    // sources, three words — and «گرید» is none of them.
    const col = only('rebar', 'deformed');
    expect(col.key).toBe('gradeAsStandard');
    expect(col.label).toBe(STANDARD_LABEL);
    expect(col.label).not.toBe(GRADE_LABEL);
    expect(col.cell(row('deformed', { grade: 'A3' }))).toBe('A3');
    expect(col.card(row('deformed', { grade: 'A2' }))).toBe('A2');
    expect(col.cell(row('deformed'))).toBe(UNKNOWN_VALUE);
    // It is a re-label of `grade`, NOT a move to `skus.standard` — میلگرد
    // leaves that column null and a stored value there must not leak in.
    expect(col.cell(row('deformed', { standard: 'ISIRI 3132' }))).toBe(UNKNOWN_VALUE);
  });

  it('takes «استاندارد» as the mixed میلگرد view\'s column too', () => {
    // Unlike پروفیل and فلزات رنگی, this category has one honest shared
    // column: 208 of its 240 live rows are آجدار or ساده. The 32 stainless
    // rows, whose own column is «آلیاژ», read `NOT_APPLICABLE` there.
    const col = only('rebar', null);
    expect(col.key).toBe('gradeAsStandard');
    expect(col.cell(row('deformed', { grade: 'A3' }))).toBe('A3');
    expect(col.cell(row('stainless', { grade: '316L' }))).toBe(NOT_APPLICABLE);
  });

  it('gives میلگرد ساده the «حالت» both references publish beside its standard', () => {
    // ahanonline `میلگرد/میلگرد-ساده` renders «سایز | حالت» over 19 priced
    // rows («شاخه 6 متری», «کلاف») and no analysis column at all; teleahan's
    // renders «نام محصول | سایز | استاندارد | حالت | محل بارگیری | واحد» over
    // 28, its «استاندارد» reading A1 throughout. Union of the two. Only 3 of
    // our 22 live rows store a `branch_length_m`, so «حالت» reads «نامشخص» on
    // 19 — a real, admin-fillable gap on a fact the trade prices on.
    const cols = attributeColumns('rebar', 'mylgrd-sadh');
    expect(cols.map((c) => c.key)).toEqual(['gradeAsStandard', 'branch']);
    expect(cols.map((c) => c.label)).toEqual([STANDARD_LABEL, CONDITION_LABEL]);
    expect(cols[0]!.cell(row('mylgrd-sadh', { grade: 'A1' }))).toBe('A1');
    expect(cols[1]!.cell(row('mylgrd-sadh', { branchLengthM: 6 }))).toBe('۶ متری');
    expect(cols[1]!.cell(row('mylgrd-sadh'))).toBe(UNKNOWN_VALUE);
  });

  it('publishes میلگرد استیل as «آلیاژ»+«حالت», not as a grade', () => {
    // The one stainless line in the catalog filed under میلگرد rather than
    // استیل, and so the one that never got the category's «آلیاژ» treatment:
    // it fell through to the bare «گرید» fallback. Its stored grade is 316L
    // (×22), 310S (×7) and 304L (×3) — alloy designations, at prices ~1.5×
    // apart. ahanonline `میلگرد/میلگرد-استیل` (fetched 2026-08-31) prices 46
    // rows under an untranslated `size | standard | state | unit` header,
    // whose `standard` reads 316L/304L and whose `state` reads «6 متری»; the
    // alloy WORD comes from this catalog's own استیل convention rather than
    // from that broken header row, the COLUMN SET from the page.
    const cols = attributeColumns('rebar', 'stainless');
    expect(cols.map((c) => c.key)).toEqual(['alloy', 'branch']);
    expect(cols.map((c) => c.label)).toEqual([ALLOY_LABEL, CONDITION_LABEL]);
    expect(cols[0]!.cell(row('stainless', { grade: '316L' }))).toBe('316L');
    // `branch_length_m` is null on all 32 today — honestly empty.
    expect(cols[1]!.cell(row('stainless'))).toBe(UNKNOWN_VALUE);
    expect(cols[1]!.cell(row('stainless', { branchLengthM: 6 }))).toBe('۶ متری');
    // A میلگرد آجدار row sitting in the same mixed table answers for itself.
    expect(cols[0]!.cell(row('deformed', { grade: 'A3' }))).toBe(NOT_APPLICABLE);
  });

  /* ---------------------------- نبشی و ناودانی ---------------------------- */

  it('swaps «گرید» for «حالت» on the four owner-approved نبشی/ناودانی subs', () => {
    // Live slugs. `grade` is null on every row of all five, so the «گرید»
    // column they had was printing «نامشخص» on every row of every page.
    // Relabelled from «شاخه» to «حالت» 1405/06/08 to match ahanonline's exact
    // wording for these subs (سپری and وال‌پست use their own labels — see
    // the tests below).
    for (const sub of ['nabshi', 'angle-unequal', 'channel-light', 'channel-heavy']) {
      const col = only('angle-channel', sub);
      expect(col.key).toBe('branch');
      expect(col.label).toBe(CONDITION_LABEL);
      expect(col.label).toBe('حالت');
      // A swap, not an addition: «گرید» is gone from these pages.
      expect(attributeColumns('angle-channel', sub).some((c) => c.key === 'grade')).toBe(false);
    }
  });

  it('gives نبشی لقمه «طول سفارشی», because a لقمه is cut to order', () => {
    // markazeahan.com's dedicated `/product-category/قیمت-نبشی-لقمه/` table
    // (fetched 1405/06/09) publishes «نام محصول | ضخامت | طول | محل بارگیری»
    // with BOTH spec cells reading «دلخواه». Under the `branch` key it
    // inherited from its نبشی siblings the column said «حالت: نامشخص» on all
    // 5 live rows — claiming a length went unrecorded rather than that none
    // exists. `orderLength` answers «بر اساس سفارش», which is «دلخواه».
    const col = only('angle-channel', 'spot');
    expect(col.key).toBe('orderLength');
    expect(col.label).toBe(CUSTOM_LENGTH_LABEL);
    expect(col.cell(row('spot'))).toBe('بر اساس سفارش');
    expect(col.card(row('spot'))).toBe('بر اساس سفارش');
    // A recorded length still wins, so a cut-to-size order can be published.
    expect(col.cell(row('spot', { branchLengthM: 6 }))).toBe('۶ متر');
    // It is a swap: neither «گرید» nor its siblings' «حالت» remains.
    const keys = attributeColumns('angle-channel', 'spot').map((c) => c.key);
    expect(keys).toEqual(['orderLength']);
  });

  it('gives سپری its own «طول شاخه» label, matching ahanonline — not «حالت»', () => {
    // ahanonline's سپری page uses «طول شاخه», unlike نبشی/ناودانی's «حالت».
    const col = only('angle-channel', 'separi');
    expect(col.key).toBe('branchLength');
    expect(col.label).toBe(BRANCH_LENGTH_LABEL);
    expect(col.cell(row('separi', { branchLengthM: 6 }))).toBe('۶ متر');
  });

  it('prints the stored length as «۶ متری», not «۶ متر»', () => {
    const col = only('angle-channel', 'nabshi');
    expect(col.cell(row('nabshi', { branchLengthM: 6 }))).toBe('۶ متری');
    expect(col.cell(row('nabshi', { branchLengthM: 12 }))).toBe('۱۲ متری');
    // صنعتی now uses the same adjectival phrase because its source calls the
    // column «حالت» and publishes «۶ متری» there.
    expect(only('profile', 'prvfyl-snaty').cell(row('prvfyl-snaty', { branchLengthM: 6 }))).toBe(
      '۶ متری',
    );
  });

  it('says «نامشخص» for a length nobody recorded — never a dash', () => {
    // A نبشی IS sold in some شاخه; we simply have not recorded which. Only 4
    // of the 37 live rows in this category carry a length today.
    const col = only('angle-channel', 'nabshi');
    expect(col.cell(row('nabshi'))).toBe(UNKNOWN_VALUE);
    expect(col.card(row('nabshi'))).toBeNull();
    // A stored grade is ignored outright — the column is not that fact.
    expect(col.cell(row('nabshi', { grade: 'A3' }))).toBe(UNKNOWN_VALUE);
  });

  it('gives وال پست its own «ضخامت» label, because its grade holds real thickness data', () => {
    // «ضخامت ۲» on all 8 live rows. ahanonline's وال‌پست page confirms this
    // is genuinely a thickness column, not a grade — relabelled 1405/06/08
    // to match, still reading the same `skus.grade` value (no data change).
    const col = only('angle-channel', 'val-post');
    expect(col.key).toBe('gradeAsThickness');
    expect(col.label).toBe(THICKNESS_LABEL);
    expect(col.cell(row('val-post', { grade: 'ضخامت ۲' }))).toBe('ضخامت ۲');
  });

  it('keeps the mixed «همه» view on «گرید», dashing all seven subs', () => {
    // Every one of the seven subs traded «گرید» for its own column (حالت,
    // طول شاخه, or a relabelled گرید-as-ضخامت), so the mixed view's plain
    // «گرید» default now applies to none of their rows — same rule پروفیل's
    // mixed view already follows for صنعتی and Z.
    const col = only('angle-channel', null);
    expect(col.key).toBe('grade');
    expect(col.cell(row('val-post', { grade: 'ضخامت ۲' }))).toBe(NOT_APPLICABLE);
    expect(col.cell(row('nabshi', { branchLengthM: 6 }))).toBe(NOT_APPLICABLE);
    expect(col.cell(row('separi', { branchLengthM: 6 }))).toBe(NOT_APPLICABLE);
    expect(col.card(row('channel-light'))).toBeNull();
  });

  // `branch` is no longer نبشی و ناودانی's alone — تیرآهن هاش and five لوله
  // subs adopted the same «حالت»/«۶ متری» pair 1405/06/09, because their own
  // sources print exactly that. What must still hold is that a نبشی SUB SLUG
  // can never conjure the column inside a foreign category.
  it('does not give any OTHER category a «حالت» column on a نبشی sub slug', () => {
    for (const slug of ['rebar', 'sheet', 'profile', 'steel', 'pipe', 'wire', 'ibeam']) {
      for (const sub of [null, 'nabshi', 'channel-light', 'separi', 'spot']) {
        expect(attributeColumns(slug, sub).some((c) => c.key === 'branch')).toBe(false);
      }
    }
  });

  /* --------------------------------- لوله --------------------------------- */

  /** The لوله column set on a given sub. */
  const pipeCols = (sub: string | null) => attributeColumns('pipe', sub);

  it('gives مانیسمان «رده» alone — the empty «گرید» beside it is gone', () => {
    // The live slugs, read from the production catalog: مانیسمان really is
    // split into داخلی/خارجی, and `data/nav.ts`'s single `seamless` would
    // have matched no rows at all. گازی/صنعتی/اسپیرال/جدار چاه/گوشت‌دار briefly
    // also carried «رده» (1405/06), reverted the same day: ahanonline.com's
    // own live pages for all five publish no «رده» column, and ASME B36.10
    // schedule numbers are not how this market classifies them — only
    // مانیسمان is actually sold and quoted by «رده ۴۰» / «رده ۸۰».
    //
    // 1405/06/09: «رده» is still right, and re-confirmed on two sources —
    // ahanonline `/انواع-لوله/لوله-مانسمان/` and teleahan
    // `/لوله-اتصالات/لوله-مانیسمان/` both publish «سایز | رده | برند» and
    // nothing else. Neither publishes «گرید», and `grade` is null on all 5
    // live rows, so the column beside it was pure empty noise.
    for (const sub of ['seamless-internal', 'seamless-external']) {
      const cols = pipeCols(sub);
      expect(cols.map((c) => c.key)).toEqual(['schedule']);
      expect(cols.map((c) => c.label)).toEqual([SCHEDULE_LABEL]);
      expect(cols[0]!.cell(row(sub, { schedule: '۴۰' }))).toBe('۴۰');
      // The stored grade is ignored outright — it is not this column's fact.
      expect(cols[0]!.cell(row(sub, { grade: 'ST37' }))).toBe(UNKNOWN_VALUE);
    }
  });

  it('gives the five length-publishing لوله subs the same «حالت» ahanonline prints', () => {
    // ahanonline (all fetched 1405/06/09) publishes a «حالت» column whose
    // value is «۶ متری»/«۱۲ متری» on گالوانیزه, درز مستقیم (= صنعتی درزدار),
    // داربستی and اسپیرال; teleahan's four matching pages agree label for
    // label. مبلی has no ahanonline page and was decided on two others —
    // ahan1.com `/Category/pipe/steel-furniture-pipe/` («حالت: شاخه ۶ متری»)
    // and sabaprofile.com `/قیمت-لوله-مبلی/` («طول: ۶ متر»).
    for (const sub of ['galvanized', 'industrial', 'scaffold', 'spiral', 'furniture']) {
      const col = pipeCols(sub).find((c) => c.key === 'branch')!;
      expect(col).toBeDefined();
      expect(col.label).toBe(CONDITION_LABEL);
      expect(col.cell(row(sub, { branchLengthM: 12 }))).toBe('۱۲ متری');
      // A pipe IS sold in some شاخه — an unrecorded one is «نامشخص», never a
      // dash. Only اسپیرال carries lengths on its live rows today.
      expect(col.cell(row(sub))).toBe(UNKNOWN_VALUE);
    }
  });

  it('gives گالوانیزه and صنعتی their source «استاندارد», and no other لوله sub one', () => {
    // ahanonline's گالوانیزه and درز مستقیم tables carry an «استاندارد»
    // column holding a pipe TYPE — «تست آب», «صنعتی» — which is what
    // `skus.standard` models; teleahan's گالوانیزه page shows the identical
    // four-column set. No other لوله page publishes the column.
    for (const sub of ['galvanized', 'industrial']) {
      const cols = pipeCols(sub);
      expect(cols.map((c) => c.key)).toEqual(['standard', 'branch']);
      expect(cols[0]!.label).toBe(STANDARD_LABEL);
      expect(cols[0]!.cell(row(sub, { standard: 'تست آب' }))).toBe('تست آب');
    }
    for (const sub of ['scaffold', 'furniture', 'spiral', 'gas', 'thick-walled']) {
      expect(pipeCols(sub).some((c) => c.key === 'standard')).toBe(false);
    }
  });

  it('reads جدار چاه’s real ST37 from skus.standard, not from the empty grade', () => {
    // The bug this whole pass is about, in one sub: all 13 live rows store
    // ST37 in `standard` while the page rendered the EMPTY `grade` under
    // «گرید». Both sources' جدار چاه tables (ahanonline
    // `/انواع-لوله/لوله-جدار-چاه/`, teleahan `/لوله-اتصالات/لوله-جدار-چاه/`)
    // publish سایز + ضخامت + برند and no standard column at all, so this
    // keeps a real owner-entered value on the page under its truthful label
    // rather than deleting it — the وال‌پست precedent (#343).
    const col = only('pipe', 'well-casing');
    expect(col.key).toBe('standard');
    expect(col.label).toBe(STANDARD_LABEL);
    expect(col.cell(row('well-casing', { standard: 'ST37' }))).toBe('ST37');
    // A grade value can never leak into it.
    expect(col.cell(row('well-casing', { grade: 'ST37' }))).toBe(UNKNOWN_VALUE);
  });

  it('keeps اسپیرال’s real ST37 under «گرید», where that row actually stores it', () => {
    // Unlike جدار چاه, اسپیرال's ST37 lives in `grade` on all 12 live rows —
    // so the column is read from where the value is, and keeps the label
    // matching that field. It gains «حالت» beside it; all 12 rows already
    // store a branch length, so that column ships populated.
    const cols = pipeCols('spiral');
    expect(cols.map((c) => c.key)).toEqual(['grade', 'branch']);
    expect(cols[0]!.cell(row('spiral', { grade: 'ST37' }))).toBe('ST37');
    expect(cols[1]!.cell(row('spiral', { branchLengthM: 12 }))).toBe('۱۲ متری');
  });

  it('publishes no attribute column at all on گازی and گوشت‌دار', () => {
    // ahanonline's گاز خانگی table is «سایز | ضخامت | برند» and its گوشت‌دار
    // table is «سایز» and nothing else — every one of those facts is rendered
    // by this catalog OUTSIDE the attribute columns. An empty list is the
    // honest answer; the «گرید» they printed until now was empty on all 13
    // live rows and matched no source column.
    for (const sub of ['gas', 'thick-walled']) {
      expect(pipeCols(sub)).toEqual([]);
    }
  });

  it('publishes no «گرید» on any لوله sub with a reconciled source page', () => {
    // Not one of the nine pages checked 1405/06/09 shows a «گرید» header.
    // اسپیرال is the sole exception and only because its own rows store a
    // real ST37 there — asserted above.
    for (const sub of [
      'seamless-internal',
      'seamless-external',
      'galvanized',
      'industrial',
      'scaffold',
      'furniture',
      'well-casing',
      'gas',
      'thick-walled',
    ]) {
      expect(pipeCols(sub).some((c) => c.key === 'grade')).toBe(false);
    }
  });

  it('reads «رده» from skus.schedule and never from standard or grade', () => {
    const schedule = pipeCols('seamless-internal').find((c) => c.key === 'schedule')!;
    // لولهٔ جدار چاه stores a real «استاندارد» (ST37) in `standard`, which is
    // exactly why «رده» could not borrow that column. Neither neighbouring
    // value may leak into it.
    expect(schedule.cell(row('seamless-internal', { standard: 'ST37', grade: 'ST37' }))).toBe(
      UNKNOWN_VALUE,
    );
    expect(schedule.cell(row('seamless-internal', { schedule: 'رده ۸۰' }))).toBe('رده ۸۰');
    expect(schedule.card(row('seamless-internal'))).toBeNull();
  });

  it('offers no «رده» on the لوله subs that have no schedule rating', () => {
    // مبلی is furniture tube and داربستی is scaffold tube — sold on outside
    // diameter and wall gauge, with no schedule class at all. گالوانیزه is
    // likewise excluded — it was never named in any owner request. گازی،
    // صنعتی درزدار، اسپیرال، جدار چاه and گوشت‌دار join them because
    // ahanonline.com does not publish «رده» for any of the five either.
    for (const sub of [
      'furniture',
      'scaffold',
      'galvanized',
      'gas',
      'industrial',
      'spiral',
      'well-casing',
      'thick-walled',
    ]) {
      expect(pipeCols(sub).some((c) => c.key === 'schedule')).toBe(false);
    }
  });

  it('publishes no attribute column in the mixed «همه» لوله view', () => {
    // لوله's nine live subs no longer agree on any one column — «رده» is
    // مانیسمان's, «حالت» five others', «استاندارد» three — so a single
    // header there would read «—» for most of the page's own rows. Same
    // conclusion پروفیل's mixed view reached; it also retires the empty
    // «گرید» this view used to print for every row in the category.
    expect(pipeCols(null)).toEqual([]);
  });

  it('does not give any OTHER category a «رده» column', () => {
    for (const slug of ['rebar', 'ibeam', 'sheet', 'profile', 'steel', 'angle-channel']) {
      for (const sub of [null, 'seamless-internal', 'gas', 'industrial']) {
        expect(attributeColumns(slug, sub).some((c) => c.key === 'schedule')).toBe(false);
      }
    }
  });

  /* ----------------------------- کلاف و مفتول ----------------------------- */

  /** The کلاف‌ومفتول column set on a given sub. */
  const wireCols = (sub: string | null) => attributeColumns('wire', sub);

  it('calls the stainless wire subs’ stored 316L an «آلیاژ», not a «گرید»', () => {
    // ahanonline prices these on its میلگرد tree: `/میلگرد/سیم-جوش-استیل/`
    // publishes «سایز | آلیاژ | واحد | …» and `/میلگرد/سیم-مفتول-استیل/»
    // publishes «سایز | آلیاژ | حالت | واحد | …» (both fetched 1405/06/09).
    // Both subs store a real stainless designation — `316L` on all 8 live
    // rows — so this is the same display-only re-label استیل already uses,
    // pointed at the same `skus.grade` field. No data changes.
    for (const sub of ['welding-wire', 'wire-rod']) {
      const col = wireCols(sub).find((c) => c.key === 'alloy')!;
      expect(col).toBeDefined();
      expect(col.label).toBe(ALLOY_LABEL);
      expect(col.cell(row(sub, { grade: '316L' }))).toBe('316L');
      expect(wireCols(sub).some((c) => c.key === 'grade')).toBe(false);
    }
    // سیم‌مفتول استیل additionally publishes the source's «حالت» («بسته»),
    // through the independent `condition` column — empty on every live row
    // today, exactly like aluminium's.
    expect(wireCols('wire-rod').map((c) => c.key)).toEqual(['alloy', 'condition']);
    expect(wireCols('welding-wire').map((c) => c.key)).toEqual(['alloy']);
    const cond = wireCols('wire-rod')[1]!;
    expect(cond.label).toBe(CONDITION_LABEL);
    expect(cond.cell(row('wire-rod', { condition: 'بسته' }))).toBe('بسته');
    expect(cond.cell(row('wire-rod'))).toBe(UNKNOWN_VALUE);
  });

  it('gives کلاف the material-analysis column three sources publish for it', () => {
    // The 1405/06 data pass recorded کلاف's grade as "unpublished" because it
    // looked for a VALUE and found one that varies per mill. The COLUMN is
    // published, on three independent sources fetched 1405/06/09:
    // markazeahan `/product-category/کلاف/` («آنالیز», e.g. «1008»), ahanup
    // `/product_category/قیمت-میلگرد-کلاف-ساده-و-آجدار/» («آنالیز», e.g.
    // «rst34»/«A3») and modiranahan `/price/coil/ribbed` («استاندارد», e.g.
    // «A۲»). Wired to `skus.standard`, which is where this catalog stores
    // steel standards — the same field/label pairing هاش uses.
    for (const sub of ['coil', 'coil-ribbed']) {
      const col = only('wire', sub);
      expect(col.key).toBe('standard');
      expect(col.label).toBe(STANDARD_LABEL);
      expect(col.cell(row(sub, { standard: 'A3' }))).toBe('A3');
      // Empty on all 6 live rows today, so it ships honestly unknown.
      expect(col.cell(row(sub))).toBe(UNKNOWN_VALUE);
      // It never borrows a grade the way the old «گرید» column would have.
      expect(col.cell(row(sub, { grade: 'A3' }))).toBe(UNKNOWN_VALUE);
    }
  });

  it('publishes no attribute column on مفتول, توری or سیم آرماتوربندی', () => {
    // Checked 1405/06/09: ahanonline `/محصولات-مفتولی/سیم-مفتول/`,
    // `/سیم-آرماتور/`, `/مش/` and `/توری/توری-مرغی/` are all «نام کالا |
    // تاریخ | قیمت», with the whole spec folded into the product name;
    // esfahanahan `/steel/سیم-مفتولی-سیاه/`, fouladtofighi
    // `/solid-wire-price/`, ahan1 `/Category/net/welded-wire-mesh/` and
    // emroozahan `/price/metal-mesh/weld-mesh-roll/` add only weight and
    // mesh-aperture facts. Not one publishes a labelled grade, analysis,
    // standard or condition column, so the «گرید» these four printed —
    // empty on all 11 live rows — is dropped rather than renamed.
    for (const sub of ['wire', 'wire-galvanized', 'tie', 'mesh']) {
      expect(wireCols(sub)).toEqual([]);
    }
  });

  it('publishes no attribute column in the mixed «همه» کلاف‌ومفتول view', () => {
    // Its eight live subs resolve to «آلیاژ», «استاندارد», «حالت» or nothing
    // at all, and share no honest common header.
    expect(wireCols(null)).toEqual([]);
  });

  it('does not leak «آلیاژ» or «استاندارد» from کلاف‌ومفتول into another category', () => {
    for (const slug of ['rebar', 'pipe', 'angle-channel', 'profile']) {
      for (const sub of ['welding-wire', 'wire-rod', 'coil', 'coil-ribbed']) {
        expect(
          attributeColumns(slug, sub).some((c) => c.key === 'alloy' || c.key === 'standard'),
        ).toBe(false);
      }
    }
  });

  /* -------------------------- استیل (the category) -------------------------- */

  // 1405/06/08: the owner confirmed matching ahanonline.com's exact columns
  // overrides the prior "آلیاژ+طول شاخه everywhere" instruction. Verified per
  // sub against the live ahanonline.com page: نبشی/ناودانی استیل keep «آلیاژ»
  // with no length; پروفیل استیل keeps «آلیاژ» and additionally gains «حالت».
  // لوله استیل's own note was corrected 1405/06/09 — re-checked live, its
  // page shows «آلیاژ» too (alongside «رده»+«حالت»); the earlier note that it
  // omitted alloy no longer matches what the page renders. Only the
  // currently-empty subs (فلنج، مش، رینگ، فنر، تسمه، تیوب، توری) — no live
  // ahanonline page, no live rows — keep the old category default.

  it('gives نبشی/ناودانی استیل «آلیاژ» with no length', () => {
    for (const sub of ['angle', 'channel']) {
      const cols = attributeColumns('steel', sub);
      expect(cols.map((c) => c.key)).toEqual(['alloy']);
      expect(cols[0]!.label).toBe(ALLOY_LABEL);
    }
  });

  it('gives پروفیل استیل «آلیاژ»+«حالت», and لوله استیل «آلیاژ»+«حالت»+«رده»', () => {
    const profileCols = attributeColumns('steel', 'profile');
    expect(profileCols.map((c) => c.key)).toEqual(['alloy', 'condition']);
    expect(profileCols.map((c) => c.label)).toEqual([ALLOY_LABEL, CONDITION_LABEL]);

    const pipeCols = attributeColumns('steel', 'pipe');
    expect(pipeCols.map((c) => c.key)).toEqual(['alloy', 'condition', 'schedule']);
    expect(pipeCols.map((c) => c.label)).toEqual([ALLOY_LABEL, CONDITION_LABEL, SCHEDULE_LABEL]);
  });

  it('keeps «آلیاژ»+«طول شاخه» on استیل subs with no live ahanonline page to verify against, and on the mixed «همه» view', () => {
    for (const sub of ['flange', 'mesh', 'ring', 'spring', 'strip', 'tube', 'wire-mesh', null]) {
      const cols = attributeColumns('steel', sub);
      expect(cols.map((c) => c.key)).toEqual(['alloy', 'branchLength']);
    }
  });

  it('reads «آلیاژ» out of skus.grade for the استیل subs that still carry it', () => {
    for (const [sub, alloy] of [
      ['angle', '304'],
      ['channel', '304L'],
      ['profile', '201'],
    ] as const) {
      const col = attributeColumns('steel', sub).find((c) => c.key === 'alloy')!;
      expect(col.cell(row(sub, { grade: alloy }))).toBe(alloy);
      expect(col.card(row(sub, { grade: alloy }))).toBe(alloy);
    }
    // Unset is «نامشخص», never a dash: a stainless product HAS an alloy, we
    // just have not recorded it.
    const angleAlloy = attributeColumns('steel', 'angle').find((c) => c.key === 'alloy')!;
    expect(angleAlloy.cell(row('angle'))).toBe(UNKNOWN_VALUE);
    expect(angleAlloy.card(row('angle'))).toBeNull();
  });

  it('does not leak «آلیاژ» into the unrelated top-level لوله/نبشی categories', () => {
    // `steel` has subs literally named `pipe`, `angle`, `channel`, `profile`,
    // which collide with three top-level category slugs. The label is resolved
    // from the CATEGORY, so the collision cannot cross over.
    // `pipe` is not a reconciled لوله sub slug, so it lands on that
    // category's «گرید» fallback — never on استیل's «آلیاژ».
    for (const slug of ['pipe', 'angle-channel']) {
      expect(only(slug, 'pipe').label).toBe(GRADE_LABEL);
    }
    // The mixed views differ by category: نبشی و ناودانی still prints the
    // «گرید» default, لوله now prints no attribute column at all — neither
    // ever prints «آلیاژ».
    expect(only('angle-channel', null).label).toBe(GRADE_LABEL);
    expect(attributeColumns('pipe', null)).toEqual([]);
  });
});

describe('factoryIsMeaningful', () => {
  const REMOVED = [
    'prvfyl-snaty',
    'profil-mobli',
    'profil-sotuni',
    'profil-galvanizeh',
    'profil-z',
    'prvfyl-astyl',
  ];

  it('withholds the fabricated mill names on the six پروفیل subs', () => {
    for (const sub of REMOVED) expect(factoryIsMeaningful('profile', sub)).toBe(false);
  });

  it('keeps «پروفیل ساختمانی» — the one sub the owner left with a factory', () => {
    expect(factoryIsMeaningful('profile', 'prvfyl-sakhtmany')).toBe(true);
  });

  it('withholds it for the whole استیل category — imported, no mill exists', () => {
    // Category-wide and exception-free, unlike پروفیل: the stored values are
    // countries of origin («چین» on نبشی, «تایوان» on ناودانی), not mills.
    for (const sub of [
      'angle',
      'channel',
      'pipe',
      'profile',
      'flange',
      'mesh',
      'anything-new',
      null,
    ]) {
      expect(factoryIsMeaningful('steel', sub)).toBe(false);
    }
  });

  it('never touches another category, even on a same-named sub', () => {
    for (const slug of ['rebar', 'ibeam', 'sheet', 'pipe', 'angle-channel']) {
      expect(factoryIsMeaningful(slug, 'profil-z')).toBe(true);
      expect(factoryIsMeaningful(slug, 'plain')).toBe(true);
    }
    expect(factoryIsMeaningful(undefined, 'profil-z')).toBe(true);
    expect(factoryIsMeaningful(null, null)).toBe(true);
  });

  it('keeps an unrecognised پروفیل sub — removal is an explicit list', () => {
    // A sub-category added later is not silently stripped of a real mill name;
    // it has to be named here, the same way the grade replacements are.
    expect(factoryIsMeaningful('profile', 'something-new')).toBe(true);
    expect(factoryIsMeaningful('profile', null)).toBe(true);
  });

  it('withholds it for میلگرد استیل — imported, stored values are countries not mills', () => {
    // 1405/06/09, owner-delegated: the exact استیل-category situation
    // («هند»/«تایوان»/«چین» on every live row) reproduced on a sub filed
    // filed under rebar instead. Scoped to that one sub, not rebar-wide — میلگرد
    // آجدار/ساده are real Iranian mills.
    expect(factoryIsMeaningful('rebar', 'stainless')).toBe(false);
    expect(factoryIsMeaningful('rebar', 'deformed')).toBe(true);
    expect(factoryIsMeaningful('rebar', 'mylgrd-sadh')).toBe(true);
    expect(factoryIsMeaningful('rebar', null)).toBe(true);
  });
});

describe('factoryLabel — contextual «برند», «کارخانه» everywhere else', () => {
  // The live مانیسمان slugs, read from the production catalog. `data/nav.ts`
  // still lists a single `seamless`, which exists nowhere in the database —
  // gating on it would have silently relabelled nothing at all.
  const SEAMLESS = ['seamless-internal', 'seamless-external'];

  it('calls the column «برند» on both مانیسمان subs', () => {
    for (const sub of SEAMLESS) {
      expect(factoryLabel('pipe', sub)).toBe(BRAND_LABEL);
      expect(factoryLabel('pipe', sub)).toBe('برند');
    }
  });

  it('calls the producer «برند» on each verified main-ورق line', () => {
    for (const sub of ['black', 'oiled', 'galvanized', 'pickled', 'colored']) {
      expect(factoryLabel('sheet', sub)).toBe(BRAND_LABEL);
    }
    expect(factoryLabel('sheet', null)).toBe(FACTORY_LABEL);
    expect(factoryLabel('sheet', 'anything-new')).toBe(FACTORY_LABEL);
  });

  it('leaves every other لوله sub on «کارخانه»', () => {
    // These pipes ARE rolled by named Iranian mills, so «برند» would be a
    // false claim about what the stored value is.
    for (const sub of [
      'gas',
      'industrial',
      'scaffold',
      'galvanized',
      'spiral',
      'furniture',
      'well-casing',
      'thick-walled',
    ]) {
      expect(factoryLabel('pipe', sub)).toBe(FACTORY_LABEL);
    }
  });

  it('keeps the generic «کارخانه» for a mixed «همه» view or an unknown sub', () => {
    // A مانیسمان row under a «کارخانه» header is merely generic; a گازی row
    // under a «برند» header would be wrong. The fallback errs that way.
    expect(factoryLabel('pipe', null)).toBe(FACTORY_LABEL);
    expect(factoryLabel('pipe', undefined)).toBe(FACTORY_LABEL);
    expect(factoryLabel('pipe')).toBe(FACTORY_LABEL);
    expect(factoryLabel('pipe', 'something-new')).toBe(FACTORY_LABEL);
  });

  it('calls the non-ferrous sheet lines «برند», as their ahanonline tables do', () => {
    // 1405/06/09. `انواع-ورق/ورق-آلومینیوم` (64 priced rows) and its آجدار
    // sibling (25) render «آلیاژ | ضخامت | حالت | ابعاد | برند», that column
    // reading «نورد آلومینیوم اراک» and «پارس آلومان کار» — the exact two
    // names our 17 live rows carry as «اراک»/«پارس». `انواع-ورق/ورق-مسی`
    // (9 rows) renders «ضخامت | سایز | برند | حالت» reading «باهنر», the one
    // value all 9 of our copper-sheet rows store. Both fetched 2026-08-31.
    // Unlike مانیسمان these really ARE mill identities — only the word above
    // them was wrong.
    for (const sub of ['aluminum-sheet', 'copper-sheet']) {
      expect(factoryLabel('felezat-rangi', sub)).toBe(BRAND_LABEL);
    }
    // لوله مسی stores a brand too, but ahanonline's لوله مسی page publishes
    // no brand column at all — so there is no source label to match, and it
    // stays on the generic word.
    for (const sub of ['copper-pipe', 'aluminum-rebar', 'aluminum-angle', null]) {
      expect(factoryLabel('felezat-rangi', sub)).toBe(FACTORY_LABEL);
    }
  });

  it('never touches another category, even one with a same-named sub', () => {
    for (const slug of ['rebar', 'ibeam', 'sheet', 'profile', 'steel', 'angle-channel', 'wire']) {
      for (const sub of [...SEAMLESS, 'gas', null, 'aluminum-sheet', 'copper-sheet']) {
        expect(factoryLabel(slug, sub)).toBe(FACTORY_LABEL);
      }
    }
    expect(factoryLabel(null, 'seamless-internal')).toBe(FACTORY_LABEL);
    expect(factoryLabel(undefined, 'seamless-internal')).toBe(FACTORY_LABEL);
  });

  it('is a separate question from whether the column is published at all', () => {
    // مانیسمان keeps a meaningful factory column — it is only NAMED
    // differently. استیل is the opposite case: the column goes away entirely.
    // A caller that needs both answers has to ask both.
    for (const sub of SEAMLESS) {
      expect(factoryIsMeaningful('pipe', sub)).toBe(true);
      expect(factoryLabel('pipe', sub)).toBe(BRAND_LABEL);
    }
    expect(factoryIsMeaningful('steel', 'angle')).toBe(false);
    expect(factoryLabel('steel', 'angle')).toBe(FACTORY_LABEL);
  });
});

describe('regionFromFactory — recovering a city from a fabricated mill name', () => {
  it('reads the city out of the names that embed one', () => {
    expect(regionFromFactory('پایا اصفهان')).toBe('اصفهان');
    expect(regionFromFactory('تهران شرق')).toBe('تهران');
    expect(regionFromFactory('فولاد مشهد')).toBe('مشهد');
    expect(regionFromFactory('نورد میلاد یزد')).toBe('یزد');
  });

  it('returns nothing for a name with no city in it', () => {
    // These are the rows that land in «نامشخص». Guessing a city for them is
    // exactly the fabrication this whole change exists to undo.
    for (const name of [
      'نیکان پروفیل',
      'کیان پرشیا',
      'جهان پروفیل پارس',
      'پروفیل یاران',
      'پروفیل صابری',
    ]) {
      expect(regionFromFactory(name), name).toBeUndefined();
    }
    expect(regionFromFactory(undefined)).toBeUndefined();
    expect(regionFromFactory('')).toBeUndefined();
  });

  it('matches whole tokens only, so a city inside a longer word is not one', () => {
    // «قم» is a real entry in the freight city list and a substring of plenty
    // of Persian words that have nothing to do with Qom.
    expect(regionFromFactory('مقاوم سازان')).toBeUndefined();
    expect(regionFromFactory('ساریان فولاد')).toBeUndefined();
    // …but a ZWNJ is a word boundary like a space.
    expect(regionFromFactory('فولاد\u200cاصفهان')).toBe('اصفهان');
  });
});

describe('groupModeFor — what a table can honestly be sectioned by', () => {
  const withRegion = (n: number) => Array.from({ length: n }, () => ({ region: 'تهران' }));
  const bare = (n: number) => Array.from({ length: n }, () => ({}) as { region?: string });

  it('prefers a real mill over everything else', () => {
    expect(groupModeFor([{ factory: 'فولاد مشهد' }, { region: 'تهران' }])).toBe('factory');
  });

  it('sections by region once half the rows resolve to a city', () => {
    expect(groupModeFor([...withRegion(3), ...bare(3)])).toBe('region');
    expect(groupModeFor(withRegion(1))).toBe('region');
  });

  it('falls back to one flat table below that', () => {
    expect(groupModeFor([...withRegion(1), ...bare(4)])).toBe('none');
    expect(groupModeFor(bare(5))).toBe('none');
    expect(groupModeFor([])).toBe('none');
  });
});

describe('groupKeyFor', () => {
  it('names the catch-all bucket after what is missing', () => {
    expect(groupKeyFor('factory', { factory: 'فولاد مشهد' })).toBe('فولاد مشهد');
    expect(groupKeyFor('factory', {})).toBe('سایر');
    expect(groupKeyFor('region', { region: 'اصفهان' })).toBe('اصفهان');
    // Not an em dash: a پروفیل IS rolled somewhere, we just do not know where.
    expect(groupKeyFor('region', {})).toBe('نامشخص');
  });

  it('puts every row in the one unnamed section under «none»', () => {
    expect(groupKeyFor('none', { factory: 'فولاد مشهد', region: 'مشهد' })).toBe('');
  });
});
