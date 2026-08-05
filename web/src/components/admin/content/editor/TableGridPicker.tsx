'use client';
/**
 * «جدول» — pick a size, get a real table (US-12.4).
 *
 * The renderer has understood GFM pipe tables for a while; the editor offered
 * no way to make one. A non-technical writer was expected to type
 * `| سایز | وزن |` and a `| --- | --- |` separator row, exactly right, into a
 * plain textarea — so in practice the flagship «جدول وزن مقاطع فولادی» article
 * was the only one that ever had a table, and it was written by hand.
 *
 * Two ways in, deliberately: a hover grid for the mouse (fast, and the
 * convention every office suite uses) and plain number fields for the
 * keyboard. The grid is `aria-hidden` because it duplicates the fields — a
 * 48-button tab stop is not accessibility, it is an obstacle course.
 *
 * RTL: column 1 is the RIGHTMOST cell, matching the direction the table will
 * actually read in.
 */
import { useEffect, useRef, useState } from 'react';
import { toPersianDigits } from '@/lib/utils/format';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';
import { TableIcon } from './editorIcons';
import s from './editor.module.css';

const MAX_ROWS = 8;
const MAX_COLS = 6;
const MAX_ROWS_INPUT = 40;
const MAX_COLS_INPUT = 12;

/** Keeps a numeric field usable while typing: the committed number only moves
 *  when the text is a genuinely valid one, so clearing the field to retype
 *  (e.g. "8" → "" → "12") doesn't visibly snap to "1" on the empty middle
 *  step the way `Number(e.target.value) || 1` would on every keystroke. An
 *  invalid or empty value reverts to the last good number on blur instead. */
function useClampedNumberField(initial: number, min: number, max: number) {
  const [value, setValue] = useState(initial);
  const [text, setText] = useState(String(initial));
  const onChange = (raw: string) => {
    setText(raw);
    const n = Number(raw);
    if (raw.trim() !== '' && Number.isInteger(n) && n >= min && n <= max) setValue(n);
  };
  const onBlur = () => setText(String(value));
  return { value, text, onChange, onBlur };
}

export function TableGridPicker({
  onInsert,
  disabled,
}: {
  onInsert: (opts: { rows: number; cols: number; withHeaderRow: boolean }) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState({ rows: 0, cols: 0 });
  const rowsField = useClampedNumberField(3, 1, MAX_ROWS_INPUT);
  const colsField = useClampedNumberField(3, 1, MAX_COLS_INPUT);
  const [withHeaderRow, setWithHeaderRow] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Focuses the first field, cycles Tab inside the popover, restores focus to
  // the trigger on close — the same trap every other panel/dialog in this app
  // uses. `lockScroll: false` because this is an anchored inline popover, not
  // a modal: it doesn't cover the page behind it.
  const popoverRef = useFocusTrap<HTMLDivElement>(open, () => setOpen(false), { lockScroll: false });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const insert = (r: number, c: number) => {
    onInsert({ rows: Math.max(1, r), cols: Math.max(1, c), withHeaderRow });
    setOpen(false);
  };

  const previewRows = hover.rows || rowsField.value;
  const previewCols = hover.cols || colsField.value;
  const exceedsGrid = previewRows > MAX_ROWS || previewCols > MAX_COLS;

  return (
    <div className={s.pickerWrap} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={s.toolBtn}
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <TableIcon />
        جدول
      </button>

      {open ? (
        <div className={s.popover} role="dialog" aria-label="ساخت جدول" ref={popoverRef}>
          <div
            className={s.grid}
            aria-hidden="true"
            onMouseLeave={() => setHover({ rows: 0, cols: 0 })}
          >
            {Array.from({ length: MAX_ROWS }, (_, r) =>
              Array.from({ length: MAX_COLS }, (_, c) => (
                <span
                  key={`${r}-${c}`}
                  className={s.gridCell}
                  data-on={r < previewRows && c < previewCols ? '' : undefined}
                  onMouseEnter={() => setHover({ rows: r + 1, cols: c + 1 })}
                  onClick={() => insert(r + 1, c + 1)}
                />
              )),
            )}
          </div>
          <p className={s.gridReadout} aria-hidden="true">
            {toPersianDigits(previewRows)} سطر × {toPersianDigits(previewCols)} ستون
            {/* Every cell in the 8×6 grid above is already "lit" once either
                typed number passes its size — without this, ۸×۶ and ۴۰×۱۲
                look visually identical and the readout text is the only real
                signal, easy to miss. */}
            {exceedsGrid ? ' (بزرگ‌تر از شبکهٔ نمایشی؛ همین عدد درج می‌شود)' : ''}
          </p>

          <div className={s.fieldRow}>
            <label className={s.field}>
              <span className={s.fieldLabel}>سطر</span>
              <input
                className={`${s.input} ${s.numInput}`}
                type="number"
                min={1}
                max={MAX_ROWS_INPUT}
                value={rowsField.text}
                onChange={(e) => rowsField.onChange(e.target.value)}
                onBlur={rowsField.onBlur}
              />
            </label>
            <label className={s.field}>
              <span className={s.fieldLabel}>ستون</span>
              <input
                className={`${s.input} ${s.numInput}`}
                type="number"
                min={1}
                max={MAX_COLS_INPUT}
                value={colsField.text}
                onChange={(e) => colsField.onChange(e.target.value)}
                onBlur={colsField.onBlur}
              />
            </label>
          </div>

          <label className={s.checkboxRow}>
            <input
              type="checkbox"
              checked={withHeaderRow}
              onChange={(e) => setWithHeaderRow(e.target.checked)}
            />
            <span>
              سطر اول، عنوان ستون‌ها باشد
              <span className={s.hint}>تقریباً همیشه درست است — عنوان ستون به صفحه‌خوان‌ها و گوگل می‌گوید هر عدد چیست.</span>
            </span>
          </label>

          <button
            type="button"
            className={s.popoverPrimary}
            onClick={() => insert(rowsField.value, colsField.value)}
          >
            درج جدول
          </button>
        </div>
      ) : null}
    </div>
  );
}
