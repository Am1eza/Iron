/**
 * The Saturday-first column offset is the single most dangerous number in this
 * component: it is shared by six live call sites (audit filters, lead filters,
 * lead detail, warehouse, and article publish scheduling), and getting it wrong
 * by one puts EVERY date in the wrong column — a bug that looks like a working
 * calendar. It gets a test per weekday, plus the leap-year month length that a
 * hardcoded 31/30/29 table would silently get wrong.
 */
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { parse, startOfMonth, getDay } from 'date-fns-jalali';
import {
  JalaliDateField,
  jalaliTextToIso,
  leadingBlanks,
  daysInJalaliMonth,
  WEEKDAY_HEADERS,
} from './JalaliDateField';

const jMonth = (y: number, m: number) => startOfMonth(parse(`${y}/${m}/1`, 'yyyy/M/d', new Date()));

describe('leadingBlanks — Saturday-first offset', () => {
  it('maps every one of the seven possible month-start weekdays to the right column', () => {
    // getDay() is JS/Gregorian-indexed (0=Sunday … 6=Saturday) even in
    // date-fns-jalali, because the weekday belongs to the instant, not the
    // calendar. An Iranian week starts on Saturday, so Saturday → column 0.
    const expected: Record<number, number> = {
      6: 0, // شنبه
      0: 1, // یک‌شنبه
      1: 2, // دوشنبه
      2: 3, // سه‌شنبه
      3: 4, // چهارشنبه
      4: 5, // پنج‌شنبه
      5: 6, // جمعه
    };
    // Walk enough consecutive Jalali months to hit all seven start weekdays.
    const seen = new Set<number>();
    for (let y = 1403; y <= 1406; y++) {
      for (let m = 1; m <= 12; m++) {
        const month = jMonth(y, m);
        const weekday = getDay(month);
        seen.add(weekday);
        expect(leadingBlanks(month)).toBe(expected[weekday]);
      }
    }
    expect(seen.size).toBe(7); // all seven weekdays were actually exercised
  });

  it('puts a month that starts on SATURDAY flush against the first column', () => {
    // 1404/06/01 is a شنبه (verified against date-fns-jalali).
    const month = jMonth(1404, 6);
    expect(getDay(month)).toBe(6);
    expect(leadingBlanks(month)).toBe(0);
  });

  it('puts a month that starts on FRIDAY in the LAST column', () => {
    // 1404/01/01 is a جمعه — the maximum possible offset.
    const month = jMonth(1404, 1);
    expect(getDay(month)).toBe(5);
    expect(leadingBlanks(month)).toBe(6);
  });

  it('never produces an offset outside 0..6', () => {
    for (let m = 1; m <= 12; m++) {
      const n = leadingBlanks(jMonth(1404, m));
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  it('has weekday headers in Saturday-first order', () => {
    expect(WEEKDAY_HEADERS).toEqual(['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']);
  });
});

describe('daysInJalaliMonth — derived, never a hardcoded table', () => {
  it('gives Esfand 30 days in the leap year 1403 and 29 in the common year 1404', () => {
    expect(daysInJalaliMonth(jMonth(1403, 12))).toBe(30);
    expect(daysInJalaliMonth(jMonth(1404, 12))).toBe(29);
  });

  it('gives 31 for the first six months and 30 for months 7–11', () => {
    for (let m = 1; m <= 6; m++) expect(daysInJalaliMonth(jMonth(1404, m))).toBe(31);
    for (let m = 7; m <= 11; m++) expect(daysInJalaliMonth(jMonth(1404, m))).toBe(30);
  });

  it('sums to 366 in a leap year and 365 otherwise', () => {
    const sum = (y: number) =>
      Array.from({ length: 12 }, (_, i) => daysInJalaliMonth(jMonth(y, i + 1))).reduce((a, b) => a + b, 0);
    expect(sum(1403)).toBe(366);
    expect(sum(1404)).toBe(365);
  });
});

describe('JalaliDateField — prop sync', () => {
  it('re-derives the displayed text when `value` changes EXTERNALLY (the stale-text bug)', () => {
    const { rerender } = render(<JalaliDateField value="2025-07-15" onChange={() => {}} label="از تاریخ" />);
    const input = screen.getByLabelText('از تاریخ') as HTMLInputElement;
    const before = input.value;
    expect(before).not.toBe('');

    // A filter reset / Back navigation hands down a different ISO.
    rerender(<JalaliDateField value="2025-09-01" onChange={() => {}} label="از تاریخ" />);
    expect((screen.getByLabelText('از تاریخ') as HTMLInputElement).value).not.toBe(before);

    // …and clearing it empties the box rather than leaving stale text.
    rerender(<JalaliDateField value="" onChange={() => {}} label="از تاریخ" />);
    expect((screen.getByLabelText('از تاریخ') as HTMLInputElement).value).toBe('');
  });

  it('does NOT rewrite half-typed text when the parent echoes back what we emitted', () => {
    function Host() {
      const [v, setV] = useState('');
      return <JalaliDateField value={v} onChange={setV} label="تاریخ" />;
    }
    render(<Host />);
    const input = screen.getByLabelText('تاریخ') as HTMLInputElement;
    // A complete, valid date: this emits, the parent echoes it back, and the
    // text must survive verbatim (not be reformatted under the caret).
    fireEvent.change(input, { target: { value: '1404/05/01' } });
    expect(input.value).toBe('1404/05/01');
    // Now a partial edit — still no clobbering.
    fireEvent.change(input, { target: { value: '1404/5/' } });
    expect(input.value).toBe('1404/5/');
  });
});

describe('JalaliDateField — calendar popup', () => {
  const openCalendar = (label = 'تاریخ') => {
    fireEvent.click(screen.getByLabelText(`${label} — انتخاب از تقویم`));
    return screen.getByRole('dialog', { name: 'انتخاب تاریخ' });
  };

  it('opens a non-modal dialog so the page behind stays usable', () => {
    render(<JalaliDateField value="2025-07-15" onChange={() => {}} label="تاریخ" />);
    const dialog = openCalendar();
    expect(dialog).toHaveAttribute('aria-modal', 'false');
  });

  it('does NOT lock body scroll — it is a popover, not a modal', () => {
    render(<JalaliDateField value="2025-07-15" onChange={() => {}} label="تاریخ" />);
    openCalendar();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('renders exactly one focusable cell (roving tabIndex, not 42 tab stops)', () => {
    render(<JalaliDateField value="2025-07-15" onChange={() => {}} label="تاریخ" />);
    openCalendar();
    const focusable = screen.getAllByRole('gridcell').filter((c) => c.getAttribute('tabindex') === '0');
    expect(focusable).toHaveLength(1);
  });

  it('marks the selected day with aria-selected', () => {
    render(<JalaliDateField value="2025-07-15" onChange={() => {}} label="تاریخ" />);
    openCalendar();
    const selected = screen.getAllByRole('gridcell').filter((c) => c.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
  });

  it('renders one cell per day of the displayed month', () => {
    // 2025-07-15 → 1404/04/24; Tir has 31 days.
    render(<JalaliDateField value="2025-07-15" onChange={() => {}} label="تاریخ" />);
    openCalendar();
    expect(screen.getAllByRole('gridcell')).toHaveLength(31);
  });

  it('Enter selects the focused day and emits the ISO that jalaliTextToIso agrees with', () => {
    const onChange = vi.fn();
    render(<JalaliDateField value="2025-07-15" onChange={onChange} label="تاریخ" />);
    openCalendar();
    const grid = screen.getByRole('grid');
    fireEvent.keyDown(grid, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledTimes(1);
    // The initial focus day is the selected value, so the emitted ISO must be
    // exactly what the ONE conversion path produces for 1404/04/24.
    expect(onChange).toHaveBeenCalledWith(jalaliTextToIso('1404/04/24'));
    expect(onChange).toHaveBeenCalledWith('2025-07-15');
  });

  it('ArrowLeft moves FORWARD in time (mirrored for RTL) and Enter emits the next day', () => {
    const onChange = vi.fn();
    render(<JalaliDateField value="2025-07-15" onChange={onChange} label="تاریخ" />);
    const dialog = openCalendar();
    fireEvent.keyDown(screen.getByRole('grid'), { key: 'ArrowLeft' });
    fireEvent.keyDown(screen.getByRole('grid'), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('2025-07-16');
    expect(dialog).not.toBeInTheDocument();
  });

  it('ArrowRight moves BACKWARD in time', () => {
    const onChange = vi.fn();
    render(<JalaliDateField value="2025-07-15" onChange={onChange} label="تاریخ" />);
    openCalendar();
    fireEvent.keyDown(screen.getByRole('grid'), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('grid'), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('2025-07-14');
  });

  it('ArrowDown moves a whole week forward', () => {
    const onChange = vi.fn();
    render(<JalaliDateField value="2025-07-15" onChange={onChange} label="تاریخ" />);
    openCalendar();
    fireEvent.keyDown(screen.getByRole('grid'), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('grid'), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('2025-07-22');
  });

  it('Escape closes the popup and emits NOTHING', () => {
    const onChange = vi.fn();
    render(<JalaliDateField value="2025-07-15" onChange={onChange} label="تاریخ" />);
    const dialog = openCalendar();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialog).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Escape does not reach an ancestor dialog — a nested drawer must stay open', () => {
    // ContentQueue renders this field inside a drawer that has its OWN focus
    // trap listening for Escape on `document`. One Escape must close only the
    // topmost layer (the picker), never both.
    const outerEscape = vi.fn();
    document.addEventListener('keydown', outerEscape);
    try {
      render(<JalaliDateField value="2025-07-15" onChange={() => {}} label="تاریخ" />);
      const dialog = openCalendar();
      outerEscape.mockClear();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(dialog).not.toBeInTheDocument();
      expect(outerEscape).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', outerEscape);
    }
  });

  it('Home and End jump to the first and last day of the month', () => {
    const onChange = vi.fn();
    render(<JalaliDateField value="2025-07-15" onChange={onChange} label="تاریخ" />);
    openCalendar();
    fireEvent.keyDown(screen.getByRole('grid'), { key: 'Home' });
    fireEvent.keyDown(screen.getByRole('grid'), { key: 'Enter' });
    // 1404/04/01
    expect(onChange).toHaveBeenCalledWith(jalaliTextToIso('1404/04/01'));

    onChange.mockClear();
    openCalendar();
    fireEvent.keyDown(screen.getByRole('grid'), { key: 'End' });
    fireEvent.keyDown(screen.getByRole('grid'), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(jalaliTextToIso('1404/04/31'));
  });

  it('clicking a day emits through the SAME conversion path as typing it', () => {
    const onChange = vi.fn();
    render(<JalaliDateField value="2025-07-15" onChange={onChange} label="تاریخ" />);
    openCalendar();
    fireEvent.click(screen.getAllByRole('gridcell')[0]!);
    expect(onChange).toHaveBeenCalledWith(jalaliTextToIso('1404/04/01'));
  });

  it('marks today with aria-current="date"', () => {
    render(<JalaliDateField value="" onChange={() => {}} label="تاریخ" />);
    openCalendar();
    const current = screen.getAllByRole('gridcell').filter((c) => c.getAttribute('aria-current') === 'date');
    expect(current).toHaveLength(1);
  });
});
