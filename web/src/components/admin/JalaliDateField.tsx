'use client';
/**
 * Jalali date input for admin filters/schedulers — replaces the native
 * `<input type="date">` pickers, which pop a GREGORIAN calendar inside a
 * fully-Jalali product (two contradictory date paradigms in one panel).
 *
 * Free-typed «۱۴۰۴/۰۵/۰۱» (Persian or Latin digits, / or -), parsed with
 * date-fns-jalali (already the app's Jalali engine via formatJalali). Emits
 * the GREGORIAN ISO `yyyy-MM-dd` the APIs expect, '' when cleared. Invalid
 * non-empty text shows an inline error state and emits nothing.
 *
 * The free-text box is the FAST PATH and is deliberately untouched: a rep who
 * knows the date types it quicker than any picker. The calendar popup is
 * purely additive, for the "which Saturday was that?" case.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  parse,
  format as formatJ,
  startOfMonth,
  addMonths,
  addDays,
  getDay,
  isSameDay,
  differenceInCalendarDays,
} from 'date-fns-jalali';
import { normalizeDigits, toPersianDigits } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';
import { CalendarIcon } from '@/components/primitives/icons';
import { IconButton } from '@/components/ui';
import ui from './adminUi.module.css';

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** '1404/05/01'-style Jalali text → Gregorian ISO date, or null if invalid. */
export function jalaliTextToIso(raw: string): string | null {
  const text = normalizeDigits(raw).trim().replace(/-/g, '/');
  if (!/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(text)) return null;
  const d = parse(text, 'yyyy/M/d', new Date());
  if (Number.isNaN(d.getTime())) return null;
  return toIsoDate(d);
}

/** Saturday-first weekday headers — the Iranian week, not the Gregorian one. */
export const WEEKDAY_HEADERS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] as const;

/**
 * How many blank cells precede the 1st of `month` in a SATURDAY-FIRST grid.
 *
 * This is the single highest-risk line in the whole picker. `getDay()` is
 * date-fns' (and JS's) Gregorian-indexed weekday — 0=Sunday … 6=Saturday —
 * and it stays that way in date-fns-jalali, because the day of the week is a
 * property of the instant, not of the calendar you print it in. An Iranian
 * week starts on SATURDAY, so Saturday must land in column 0:
 *
 *   getDay: Sat 6 → 0, Sun 0 → 1, Mon 1 → 2, Tue 2 → 3, Wed 3 → 4,
 *           Thu 4 → 5, Fri 5 → 6            ⇒  (getDay + 1) % 7
 *
 * Get this wrong by one and EVERY date in the picker sits in the wrong column
 * across all six call sites — including article publish scheduling. Hence a
 * named, exported, individually-tested function rather than an inline
 * expression.
 */
export function leadingBlanks(month: Date): number {
  return (getDay(startOfMonth(month)) + 1) % 7;
}

/**
 * Days in the Jalali month containing `month`, by DIFFERENCING the calendar
 * itself. Never a hardcoded 31/31/31/31/31/31/30/30/30/30/30/29 table: the
 * last month (Esfand) is 30 days in a leap year, and Jalali leap years follow
 * a 33-year cycle, not `% 4`. date-fns-jalali already knows; we just ask.
 */
export function daysInJalaliMonth(month: Date): number {
  const start = startOfMonth(month);
  return differenceInCalendarDays(startOfMonth(addMonths(start, 1)), start);
}

export function JalaliDateField({
  value,
  onChange,
  label,
  placeholder = '۱۴۰۴/۰۵/۰۱',
}: {
  /** Gregorian ISO date (yyyy-MM-dd) or ''. */
  value: string;
  onChange: (iso: string) => void;
  label: string;
  placeholder?: string;
}) {
  // Text is local state (the user types Jalali); the ISO value only leaves
  // through onChange on a valid parse. Initial display re-renders the stored
  // ISO back as Jalali so an edit round-trips cleanly.
  const [text, setText] = useState(() => (value ? formatJalali(`${value}T12:00:00`) : ''));
  const [invalid, setInvalid] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogId = useId();

  // Every ISO this component has EMITTED. `text` used to be seeded once with
  // `useState(() => …)`, so `value` was read at mount and never again: a
  // filter reset or a Back navigation changed `value` underneath and the box
  // went on showing the old Jalali text. (LeadsTab papered over exactly this
  // with `key=` remounts; the other four call sites just showed stale text.)
  //
  // A naive `useEffect(… , [value])` would fix that and break something
  // worse — it would rewrite a half-typed «۱۴۰۴/۵/» out from under the caret
  // on every keystroke, because our own onChange feeds `value` right back.
  // Comparing against the last ISO WE emitted distinguishes "the parent
  // echoed us" (ignore) from "the parent changed it" (re-derive).
  const lastEmitted = useRef(value);
  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setText(value ? formatJalali(`${value}T12:00:00`) : '');
      setInvalid(false);
    }
  }, [value]);

  const emit = (iso: string) => {
    lastEmitted.current = iso;
    onChange(iso);
  };

  const selected = useMemo(() => {
    if (!value) return null;
    const d = new Date(`${value}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [value]);

  // The month on screen, and the roving-focus day within it.
  const [cursor, setCursor] = useState<Date>(() => selected ?? new Date());
  const [focusDay, setFocusDay] = useState<Date>(() => selected ?? new Date());

  const openPicker = () => {
    const base = selected ?? new Date();
    setCursor(base);
    setFocusDay(base);
    setOpen(true);
  };

  // Escape must close the POPUP and nothing else. Both this popup's focus
  // trap and any ancestor drawer's (ContentQueue's editor drawer has its own)
  // listen for Escape on `document` in the BUBBLE phase, so a single Escape
  // would otherwise close the picker AND the drawer around it. A
  // CAPTURE-phase listener on document runs before every one of them;
  // stopImmediatePropagation then guarantees no other Escape handler —
  // including our own trap's — ever sees the event. Topmost layer wins, which
  // is the correct dialog semantic.
  useEffect(() => {
    if (!open) return;
    const onKeyDownCapture = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      setOpen(false);
    };
    document.addEventListener('keydown', onKeyDownCapture, true);
    return () => document.removeEventListener('keydown', onKeyDownCapture, true);
  }, [open]);

  // `lockScroll: false` — this is an inline, non-modal popover anchored to its
  // input. It covers nothing, so freezing page scroll behind it (right for
  // Modal/SkuDrawer) would be a bug here. onEscape is deliberately undefined:
  // Escape is handled in capture above so it can't reach an outer drawer.
  const popRef = useFocusTrap<HTMLDivElement>(open, undefined, { lockScroll: false });

  // Click-outside closes. (The trap handles Tab; it does not handle pointers.)
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      if (inputRef.current?.parentElement?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, popRef]);

  // Roving tabIndex: exactly ONE focusable cell (42 tab stops would be
  // unusable), moved with the arrow keys. Re-focus it after a keyboard move —
  // but NOT after a month-arrow CLICK, which also moves the roving day and
  // would otherwise yank focus off the ‹ / › button the user is still
  // clicking, making a second click impossible.
  const grabFocus = useRef(false);
  useEffect(() => {
    if (!open || !grabFocus.current) return;
    grabFocus.current = false;
    popRef.current?.querySelector<HTMLElement>('[data-roving]')?.focus();
  }, [open, focusDay, popRef]);

  /** Month nav must drag the roving day with it, or the grid ends up with no
   *  focusable cell at all (every tabIndex is -1). */
  const goMonth = (delta: number) => {
    const next = addMonths(cursor, delta);
    setCursor(next);
    setFocusDay(startOfMonth(next));
  };

  const commit = (day: Date) => {
    // ONE conversion path. The popup produces the same Jalali text a human
    // would have typed and hands it to jalaliTextToIso — the identical
    // function the text box uses. A second, "more direct" date→ISO path here
    // is exactly how a picker and its input start disagreeing by a day.
    const jalaliText = formatJ(day, 'yyyy/MM/dd');
    const iso = jalaliTextToIso(jalaliText);
    if (!iso) return;
    setText(toPersianDigits(jalaliText));
    setInvalid(false);
    emit(iso);
    setOpen(false);
    // Return focus to the input, not to the calendar button: the input is
    // where the value now lives and where an edit continues. This runs after
    // the trap's own restore (effect cleanups precede effect bodies).
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const onGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next: Date | null = null;
    switch (e.key) {
      // MIRRORED for RTL: the grid runs right-to-left, so ArrowLeft moves
      // FORWARD in time and ArrowRight moves back — the opposite of an LTR
      // calendar, and what an Iranian user's hand expects.
      case 'ArrowLeft':
        next = addDays(focusDay, 1);
        break;
      case 'ArrowRight':
        next = addDays(focusDay, -1);
        break;
      case 'ArrowDown':
        next = addDays(focusDay, 7);
        break;
      case 'ArrowUp':
        next = addDays(focusDay, -7);
        break;
      case 'PageDown':
        next = addMonths(focusDay, 1);
        break;
      case 'PageUp':
        next = addMonths(focusDay, -1);
        break;
      case 'Home':
        next = startOfMonth(focusDay);
        break;
      case 'End':
        next = addDays(startOfMonth(focusDay), daysInJalaliMonth(focusDay) - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        commit(focusDay);
        return;
      default:
        return;
    }
    e.preventDefault();
    grabFocus.current = true;
    setFocusDay(next);
    // Paging past an edge scrolls the visible month with the focus.
    if (formatJ(next, 'yyyy/MM') !== formatJ(cursor, 'yyyy/MM')) setCursor(next);
  };

  const blanks = leadingBlanks(cursor);
  const dayCount = daysInJalaliMonth(cursor);
  const monthStart = startOfMonth(cursor);
  const today = new Date();

  /** `blanks` leading nulls then 0..dayCount-1, chunked into weeks of 7. */
  const weeks = useMemo(() => {
    const cells: Array<number | null> = [
      ...Array.from({ length: blanks }, () => null),
      ...Array.from({ length: dayCount }, (_, i) => i),
    ];
    const out: Array<Array<number | null>> = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [blanks, dayCount]);

  return (
    <span className={ui.dateFieldWrap}>
      <input
        ref={inputRef}
        className={ui.textCell}
        style={{ inlineSize: '8.5rem', ...(invalid ? { borderColor: 'var(--color-loss)' } : {}) }}
        inputMode="numeric"
        dir="ltr"
        placeholder={placeholder}
        aria-label={label}
        aria-invalid={invalid || undefined}
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          if (next.trim() === '') {
            setInvalid(false);
            emit('');
            return;
          }
          const iso = jalaliTextToIso(next);
          if (iso) {
            setInvalid(false);
            emit(iso);
          } else {
            setInvalid(true);
          }
        }}
      />
      <IconButton
        size="sm"
        label={`${label} — انتخاب از تقویم`}
        icon={<CalendarIcon size={16} />}
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        onClick={() => (open ? setOpen(false) : openPicker())}
      />

      {open ? (
        <div
          ref={popRef}
          id={dialogId}
          className={ui.calendarPop}
          role="dialog"
          // NOT modal: the page behind stays interactive and scrollable, and
          // the input above remains usable while the picker is open.
          aria-modal="false"
          aria-label="انتخاب تاریخ"
        >
          <div className={ui.calendarHead}>
            <IconButton
              size="sm"
              label="ماه قبل"
              icon={<span aria-hidden="true">‹</span>}
              onClick={() => goMonth(-1)}
            />
            <strong className={ui.calendarTitle} aria-live="polite">
              {toPersianDigits(formatJ(cursor, 'MMMM yyyy'))}
            </strong>
            <IconButton
              size="sm"
              label="ماه بعد"
              icon={<span aria-hidden="true">›</span>}
              onClick={() => goMonth(1)}
            />
          </div>

          <div className={ui.calendarGrid} role="grid" aria-label="روزهای ماه" onKeyDown={onGridKeyDown}>
            <div className={ui.calendarRow} role="row">
              {WEEKDAY_HEADERS.map((h, i) => (
                <span key={i} role="columnheader" className={ui.calendarHeadCell} aria-hidden="true">
                  {h}
                </span>
              ))}
            </div>
            {/* Real week rows, not one row of 31 cells: a `role="grid"` whose
                single row holds a whole month is a lie about the structure a
                screen reader then reads out column by column. */}
            {weeks.map((week, w) => (
              <div key={w} className={ui.calendarDays} role="row">
                {week.map((dayIndex, c) => {
                  if (dayIndex === null) {
                    return <span key={`b${c}`} className={ui.calendarBlank} role="gridcell" aria-hidden="true" />;
                  }
                  const i = dayIndex;
                  const day = addDays(monthStart, i);
                const isSelected = selected ? isSameDay(day, selected) : false;
                const isFocus = isSameDay(day, focusDay);
                const isToday = isSameDay(day, today);
                // Friday is the Iranian weekend — a pure client-side weekday
                // computation, zero data. Deliberately NOT holidays: HOLIDAYS
                // is a server setting behind `settings:write`, and all six
                // call sites are filters/schedulers where a holiday is a
                // perfectly valid date anyway.
                const isFriday = getDay(day) === 5;
                return (
                  <button
                    key={i}
                    type="button"
                    role="gridcell"
                    aria-selected={isSelected}
                    aria-current={isToday ? 'date' : undefined}
                    data-roving={isFocus ? '' : undefined}
                    data-autofocus={isFocus ? '' : undefined}
                    tabIndex={isFocus ? 0 : -1}
                    className={[
                      ui.calendarDay,
                      isSelected ? ui.calendarDaySelected : '',
                      isToday ? ui.calendarDayToday : '',
                      isFriday ? ui.calendarDayOff : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => commit(day)}
                  >
                    {toPersianDigits(String(i + 1))}
                  </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </span>
  );
}
