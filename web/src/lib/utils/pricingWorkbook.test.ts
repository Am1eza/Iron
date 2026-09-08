import { describe, expect, it } from 'vitest';
import { safeSpreadsheetText } from './pricingWorkbook';

describe('spreadsheet text output', () => {
  it.each(['=1+1', '+cmd', '-2+3', '@SUM(A1)'])('neutralizes %s', (value) => {
    expect(safeSpreadsheetText(value)).toBe(`'${value}`);
  });
  it('leaves ordinary Persian product text unchanged', () => {
    expect(safeSpreadsheetText('میلگرد ۱۴')).toBe('میلگرد ۱۴');
  });
});
