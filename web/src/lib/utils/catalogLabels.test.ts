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
  it('offers «ابعاد» to ورق, whose سایز column is only the thickness', () => {
    expect(usesDimensions('sheet')).toBe(true);
    // The two are deliberately paired: a category asked for ابعاد is exactly a
    // category whose سایز means ضخامت. If that ever stops holding, the table
    // header would read «سایز | ابعاد», which is meaningless.
    expect(usesThickness('sheet')).toBe(true);
    expect(DIMENSIONS_LABEL).not.toBe(sizeLabel('sheet'));
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

  it('keeps ورق exactly category-wide and labelled ابعاد', () => {
    for (const sub of [null, 'black', 'anything-new']) {
      expect(usesDimensions('sheet', sub)).toBe(true);
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

  // لوله appears here with a sub that is NOT one of its pressure-pipe ones,
  // which is the point: gaining «رده» on مانیسمان/گازی/صنعتی must leave the
  // rest of the category — and every other category — on the plain «گرید»
  // column it has always had.
  // لوله and نبشی‌وناودانی appear here with subs that are NOT in their
  // respective allow-lists, which is the point: the new columns must leave the
  // rest of each category — and every other category — on the plain «گرید».
  // ورق is not in this slug list at all — it deviates category-wide (its
  // «حالت» applies to every sub, including the mixed «همه» view), unlike
  // لوله and نبشی‌وناودانی, which only ever deviate for a named sub.
  it('leaves every category outside the deviating ones exactly as it was', () => {
    for (const slug of ['rebar', 'pipe', 'angle-channel', 'wire', 'felezat-rangi']) {
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
  });

  it('falls back to «گرید» for an unknown, mixed or missing category', () => {
    expect(only(undefined, 'hash-sabok').label).toBe(GRADE_LABEL);
    expect(only(null, null).label).toBe(GRADE_LABEL);
  });

  /* ------------------------------- تیرآهن ------------------------------- */

  it('drops the column on a non-هاش تیرآهن sub, and gives هاش «استاندارد»+«طول شاخه»', () => {
    for (const sub of ['tirahan', 'ipe', 'anything-else']) {
      expect(attributeColumns('ibeam', sub)).toEqual([]);
    }
    // ahanonline's «تیرآهن-و-هاش/هاش» page carries a «حالت» column beside
    // «استاندارد» (re-verified live 1405/06/09) — we read it from
    // `branchLengthM`, which هاش SKUs already store, rather than a second
    // always-empty column. The mixed «همه» view deliberately stays on the
    // single-column default, same as every other ibeam sub not in the list.
    for (const sub of ['hash-sabok', 'hash-sangin']) {
      const cols = attributeColumns('ibeam', sub);
      expect(cols.map((c) => c.key)).toEqual(['standard', 'branchLength']);
      expect(cols[0]!.label).toBe(STANDARD_LABEL);
    }
    const mixed = only('ibeam', null);
    expect(mixed.key).toBe('standard');
    expect(mixed.label).toBe(STANDARD_LABEL);
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

  it('labels ورق «حالت» in every sub and preserves its verified rollout fallback', () => {
    for (const sub of ['black', 'cold', 'galvanized', 'colored', null]) {
      const col = only('sheet', sub);
      expect(col.key).toBe('legacyCondition');
      expect(col.label).toBe(CONDITION_LABEL);
      // Before the guarded move runs, the known legacy value remains visible
      // byte-for-byte. Afterward the independent column wins.
      expect(col.cell(row(sub ?? 'black', { grade: 'برش‌خورده' }))).toBe('برش‌خورده');
      expect(col.card(row(sub ?? 'black', { grade: 'رول' }))).toBe('رول');
      expect(col.cell(row(sub ?? 'black', { grade: 'رول', condition: 'برش‌خورده' }))).toBe(
        'برش‌خورده',
      );
      expect(col.cell(row(sub ?? 'black'))).toBe(UNKNOWN_VALUE);
      expect(col.card(row(sub ?? 'black'))).toBeNull();
    }
  });

  it('prefers the independent condition column while retaining the rollout fallback', () => {
    const col = only('sheet', 'black');
    expect(col.cell(row('black', { condition: 'شیت', grade: 'رول' }))).toBe('شیت');
    expect(col.cell(row('black', { grade: 'رول' }))).toBe('رول');
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
    const col = only('felezat-rangi', 'copper-pipe');
    expect(col.key).toBe('gradeAsThickness');
    expect(col.label).toBe(THICKNESS_LABEL);
    expect(col.cell(row('copper-pipe', { grade: 'ضخامت ۰.۸۱' }))).toBe('ضخامت ۰.۸۱');
  });

  it('gives آلومینیوم section subs their own «ضخامت»+«طول شاخه», verified against ahanyekta.com', () => {
    // No ahanonline page exists for these — checked against ahanyekta.com's
    // نبشی/لوله/پروفیل آلومینیوم pages instead (ناودانی included by the same
    // section-profile-family reasoning as its سیبلینگ نبشی). None of the
    // four currently has ANY stored data (checked live in prod), so every
    // cell below reads «نامشخص» — an honest gap, not a fabrication.
    for (const sub of ['aluminum-angle', 'aluminum-channel', 'aluminum-pipe', 'aluminum-profile']) {
      expect(usesDimensions('felezat-rangi', sub)).toBe(true);
      expect(dimensionsLabel('felezat-rangi', sub)).toBe(THICKNESS_LABEL);
      const col = only('felezat-rangi', sub);
      expect(col.key).toBe('branchLength');
      expect(col.label).toBe(BRANCH_LENGTH_LABEL);
      expect(col.cell(row(sub, { branchLengthM: 6 }))).toBe('۶ متر');
      expect(col.cell(row(sub))).toBe(UNKNOWN_VALUE);
    }
  });

  it('gives تسمه مسی «حالت», matching ahanonline\'s fixed supplied-form column', () => {
    // ahanonline's تسمه مسی page publishes «حالت» with a fixed phrase value
    // («شاخه ۴ متری») — the same `condition` concept aluminum-sheet already
    // uses, not an empty-column guess. copper-strip has zero stored
    // condition data today (checked live in prod), so this reads «نامشخص».
    const col = only('felezat-rangi', 'copper-strip');
    expect(col.key).toBe('condition');
    expect(col.label).toBe(CONDITION_LABEL);
    expect(col.cell(row('copper-strip', { condition: 'شاخه ۴ متری' }))).toBe('شاخه ۴ متری');
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
    for (const sub of ['prvfyl-sakhtmany', 'profil-sotuni']) {
      const col = only('profile', sub);
      expect(col.key).toBe('grade');
      expect(col.label).toBe(GRADE_LABEL);
    }
    // The priced subs disagree on «حالت»/«طول»/«طول سفارشی», but none has a
    // grade. The mixed page therefore omits the attribute column altogether.
    expect(attributeColumns('profile', null)).toEqual([]);
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

  it('gives Z «طول سفارشی», which reads «بر اساس سفارش» when unset', () => {
    const col = only('profile', 'profil-z');
    expect(col.key).toBe('customLength');
    expect(col.label).toBe(CUSTOM_LENGTH_LABEL);
    // پروفیل Z is cut to order, so an EMPTY length is an answer, not a gap —
    // «نامشخص» would tell the buyer we lost a number that never existed.
    expect(col.cell(row('profil-z'))).toBe('بر اساس سفارش');
    expect(col.card(row('profil-z'))).toBe('بر اساس سفارش');
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

  /* ---------------------------- نبشی و ناودانی ---------------------------- */

  it('swaps «گرید» for «حالت» on the five owner-approved نبشی/ناودانی subs', () => {
    // Live slugs. `grade` is null on every row of all five, so the «گرید»
    // column they had was printing «نامشخص» on every row of every page.
    // Relabelled from «شاخه» to «حالت» 1405/06/08 to match ahanonline's exact
    // wording for these subs (سپری and وال‌پست use their own labels — see
    // the tests below).
    for (const sub of ['nabshi', 'angle-unequal', 'spot', 'channel-light', 'channel-heavy']) {
      const col = only('angle-channel', sub);
      expect(col.key).toBe('branch');
      expect(col.label).toBe(CONDITION_LABEL);
      expect(col.label).toBe('حالت');
      // A swap, not an addition: «گرید» is gone from these pages.
      expect(attributeColumns('angle-channel', sub).some((c) => c.key === 'grade')).toBe(false);
    }
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


  it('does not give any OTHER category a «شاخه» column', () => {
    for (const slug of ['rebar', 'ibeam', 'sheet', 'profile', 'steel', 'pipe', 'wire']) {
      for (const sub of [null, 'nabshi', 'channel-light', 'separi']) {
        expect(attributeColumns(slug, sub).some((c) => c.key === 'branch')).toBe(false);
      }
    }
  });

  /* --------------------------------- لوله --------------------------------- */

  /** The لوله column set on a given sub. */
  const pipeCols = (sub: string | null) => attributeColumns('pipe', sub);

  it('adds «رده» beside «گرید» on مانیسمان only — a gain, not a swap', () => {
    // The live slugs, read from the production catalog: مانیسمان really is
    // split into داخلی/خارجی, and `data/nav.ts`'s single `seamless` would
    // have matched no rows at all. گازی/صنعتی/اسپیرال/جدار چاه/گوشت‌دار briefly
    // also carried «رده» (1405/06), reverted the same day: ahanonline.com's
    // own live pages for all five publish no «رده» column, and ASME B36.10
    // schedule numbers are not how this market classifies them — only
    // مانیسمان is actually sold and quoted by «رده ۴۰» / «رده ۸۰».
    for (const sub of ['seamless-internal', 'seamless-external']) {
      const cols = pipeCols(sub);
      expect(cols.map((c) => c.key)).toEqual(['grade', 'schedule']);
      expect(cols.map((c) => c.label)).toEqual([GRADE_LABEL, SCHEDULE_LABEL]);
      // A pipe genuinely has both facts, so neither displaces the other.
      expect(cols[0]!.cell(row(sub, { grade: 'ST37' }))).toBe('ST37');
      expect(cols[1]!.cell(row(sub, { schedule: '۴۰' }))).toBe('۴۰');
    }
  });

  it('reads «رده» from skus.schedule and never from standard or grade', () => {
    const schedule = pipeCols('seamless-internal')[1]!;
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
      expect(pipeCols(sub).map((c) => c.key)).toEqual(['grade']);
    }
  });

  it('keeps «رده» out of the mixed «همه» لوله view', () => {
    // Most لوله subs have no schedule, so the column would read «—» for the
    // majority of its own rows — the outcome the sub-scoping exists to avoid.
    expect(pipeCols(null).map((c) => c.key)).toEqual(['grade']);
  });

  it('does not give any OTHER category a «رده» column', () => {
    for (const slug of ['rebar', 'ibeam', 'sheet', 'profile', 'steel', 'angle-channel']) {
      for (const sub of [null, 'seamless-internal', 'gas', 'industrial']) {
        expect(attributeColumns(slug, sub).some((c) => c.key === 'schedule')).toBe(false);
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
    for (const slug of ['pipe', 'angle-channel']) {
      expect(only(slug, 'pipe').label).toBe(GRADE_LABEL);
      expect(only(slug, null).label).toBe(GRADE_LABEL);
    }
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
    for (const sub of ['angle', 'channel', 'pipe', 'profile', 'flange', 'mesh', 'anything-new', null]) {
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
});

describe('factoryLabel — «برند» on مانیسمان, «کارخانه» everywhere else', () => {
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

  it('never touches another category, even one with a same-named sub', () => {
    for (const slug of ['rebar', 'ibeam', 'sheet', 'profile', 'steel', 'angle-channel', 'wire']) {
      for (const sub of [...SEAMLESS, 'gas', null]) {
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
    for (const name of ['نیکان پروفیل', 'کیان پرشیا', 'جهان پروفیل پارس', 'پروفیل یاران', 'پروفیل صابری']) {
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
