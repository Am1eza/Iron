'use client';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { normalizeDigits, toPersianDigits } from '@/lib/utils/format';
import styles from './otp.module.css';

export type OtpInputHandle = {
  focus: () => void;
};

/**
 * Accessible OTP input (Components A6 / accessibility §6):
 * N boxes, auto-advance, paste-fills-all, numeric, one-time-code autofill.
 * Controlled: value is the Latin-digit string; display is Persian.
 */
export const OtpInput = forwardRef<OtpInputHandle, {
  length?: number;
  value: string;
  onChange: (val: string) => void;
  error?: boolean;
  label?: string;
}>(function OtpInput(
  { length = 5, value, onChange, error, label = 'کد تأیید پیامک‌شده' },
  ref,
) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const chars = value.padEnd(length).slice(0, length).split('');

  useImperativeHandle(ref, () => ({
    focus: () => refs.current[0]?.focus(),
  }));

  const setChar = (i: number, c: string) => {
    const next = value.split('');
    next[i] = c;
    onChange(next.join('').slice(0, length).replace(/\s/g, ''));
  };

  const handleChange = (i: number, raw: string) => {
    const d = normalizeDigits(raw).replace(/\D/g, '');
    if (!d) {
      setChar(i, '');
      return;
    }
    setChar(i, d[d.length - 1]!);
    if (i < length - 1) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !chars[i]?.trim() && i > 0) refs.current[i - 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = normalizeDigits(e.clipboardData.getData('text')).replace(/\D/g, '').slice(0, length);
    if (pasted) {
      e.preventDefault();
      onChange(pasted);
      refs.current[Math.min(pasted.length, length - 1)]?.focus();
    }
  };

  return (
    <div
      className={`${styles.wrap} ${error ? `${styles.error} ${styles.shake}` : ''}`}
      role="group"
      aria-label={label}
    >
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className={styles.box}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          aria-label={`رقم ${toPersianDigits(i + 1)}`}
          aria-invalid={error || undefined}
          aria-describedby={error ? 'otp-error' : undefined}
          value={chars[i]?.trim() ? toPersianDigits(chars[i]!.trim()) : ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
        />
      ))}
    </div>
  );
});
