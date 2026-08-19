import { describe, it, expect } from 'vitest';
import {
  sizeLabel,
  usesThickness,
  usesDimensions,
  usesGradeColumn,
  gradeColumnLabel,
  gradeColumnCell,
  gradeColumnCard,
  SIZE_LABEL,
  THICKNESS_LABEL,
  DIMENSIONS_LABEL,
  GRADE_LABEL,
  STANDARD_LABEL,
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

  it('never offers it to any other category', () => {
    for (const slug of ['rebar', 'ibeam', 'pipe', 'profile', 'angle-channel', 'wire', 'steel']) {
      expect(usesDimensions(slug)).toBe(false);
    }
  });

  it('says no for an unknown, mixed or missing category', () => {
    // Same reasoning as the size label: the «استیل» hub mixes categories, and
    // growing an extra column there because one cross-listed ورق row wandered
    // in would be wrong for every other row in the table.
    expect(usesDimensions(undefined)).toBe(false);
    expect(usesDimensions(null)).toBe(false);
    expect(usesDimensions('')).toBe(false);
    expect(usesDimensions('something-new')).toBe(false);
  });
});

describe('the grade/standard column', () => {
  const row = (subCategoryId: string, fields: { grade?: string; standard?: string } = {}) => ({
    subCategoryId,
    ...fields,
  });

  it('leaves every non-تیرآهن category exactly as it was', () => {
    for (const slug of ['rebar', 'sheet', 'pipe', 'profile', 'angle-channel', 'wire', 'steel']) {
      expect(usesGradeColumn(slug, null)).toBe(true);
      expect(usesGradeColumn(slug, 'anything')).toBe(true);
      expect(gradeColumnLabel(slug)).toBe(GRADE_LABEL);
      expect(gradeColumnCell(slug, row('plain', { grade: 'A3' }))).toBe('A3');
      expect(gradeColumnCell(slug, row('plain'))).toBe('نامشخص');
    }
    // …including the mixed/unknown lists, which must never lose a column just
    // because they have no single category to answer for.
    expect(usesGradeColumn(undefined, 'hash-sabok')).toBe(true);
    expect(gradeColumnLabel(null)).toBe(GRADE_LABEL);
  });

  it('drops the column on the تیرآهن sub-pages that have no grade', () => {
    for (const sub of ['tirahan', 'ipe', 'light', 'lane-zanburi', 'castellated']) {
      expect(usesGradeColumn('ibeam', sub)).toBe(false);
    }
  });

  it('keeps it for هاش سبک/هاش سنگین, renamed to «استاندارد»', () => {
    for (const sub of ['hash-sabok', 'hash-sangin']) {
      expect(usesGradeColumn('ibeam', sub)).toBe(true);
    }
    expect(gradeColumnLabel('ibeam')).toBe(STANDARD_LABEL);
  });

  it('keeps it in the mixed «همه» تیرآهن table, where هاش rows are present', () => {
    expect(usesGradeColumn('ibeam', null)).toBe(true);
  });

  it('reads `standard`, not `grade`, for هاش rows', () => {
    // `grade` is deliberately ignored even when filled: the owner asked for
    // that field gone from تیرآهن, and HEA/HEB belongs in `standard`.
    expect(gradeColumnCell('ibeam', row('hash-sabok', { standard: 'HEA', grade: 'ST37' }))).toBe(
      'HEA',
    );
    expect(gradeColumnCell('ibeam', row('hash-sangin', { standard: 'HEB' }))).toBe('HEB');
    expect(gradeColumnCell('ibeam', row('hash-sabok'))).toBe('نامشخص');
  });

  it('shows a dash, not «نامشخص», for non-هاش تیرآهن rows in the mixed table', () => {
    // The column does not APPLY to an IPE beam — «نامشخص» would wrongly imply
    // the value merely hasn't been entered yet.
    expect(gradeColumnCell('ibeam', row('ipe', { grade: 'ST37' }))).toBe('—');
    expect(gradeColumnCell('ibeam', row('tirahan'))).toBe('—');
  });

  it('gives the mobile card a line only when there is a real value', () => {
    expect(gradeColumnCard('ibeam', row('hash-sabok', { standard: 'HEA' }))).toEqual({
      label: STANDARD_LABEL,
      value: 'HEA',
    });
    // Empty هاش, and every non-هاش تیرآهن row: no line at all, never a dash.
    expect(gradeColumnCard('ibeam', row('hash-sabok'))).toBeNull();
    expect(gradeColumnCard('ibeam', row('ipe', { grade: 'ST37' }))).toBeNull();
    // Other categories: unchanged «گرید: …», omitted when unfilled.
    expect(gradeColumnCard('rebar', row('plain', { grade: 'A3' }))).toEqual({
      label: GRADE_LABEL,
      value: 'A3',
    });
    expect(gradeColumnCard('rebar', row('plain'))).toBeNull();
  });
});
