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
 */
import { useState } from 'react';
import { parse } from 'date-fns-jalali';
import { normalizeDigits, formatJalali } from '@/lib/utils/format';
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

  return (
    <input
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
          onChange('');
          return;
        }
        const iso = jalaliTextToIso(next);
        if (iso) {
          setInvalid(false);
          onChange(iso);
        } else {
          setInvalid(true);
        }
      }}
    />
  );
}
