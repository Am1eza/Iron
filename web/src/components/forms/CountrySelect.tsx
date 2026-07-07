'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { listPhoneCountries, dialCode, type CountryCode } from '@/lib/utils/phone';
import type { AppLocale } from '@/i18n/config';
import styles from './CountrySelect.module.css';

/** ISO 3166 alpha-2 → flag emoji (regional-indicator symbols). */
function flagEmoji(cc: string): string {
  return cc
    .toUpperCase()
    .replace(/./g, (ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65));
}

/**
 * Country selector for the phone field. Fixes the native-`<select>` overflow
 * bug (long localized names like «امارات متحده عربی» were clipped): the TRIGGER
 * shows only flag + dial code at a fixed width, so it never overflows; full
 * country names live in a wide searchable popup and truncate with ellipsis
 * there. Search matches name OR dial code. Keyboard: type to filter, arrows to
 * move, Enter to pick, Escape to close.
 */
export function CountrySelect({
  value,
  onChange,
  ariaLabel,
}: {
  value: CountryCode;
  onChange: (c: CountryCode) => void;
  ariaLabel?: string;
}) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations('phone');
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);

  const names = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: 'region' });
    } catch {
      return null;
    }
  }, [locale]);

  const countries = useMemo(() => {
    const list = listPhoneCountries().map((c) => ({
      code: c,
      name: names?.of(c) ?? c,
      dial: dialCode(c),
      flag: flagEmoji(c),
    }));
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) => c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [names, query]);

  // Close on outside click / Escape; focus the search when opening.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    const id = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.clearTimeout(id);
    };
  }, [open]);

  // Keep the active option scrolled into view.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (c: CountryCode) => {
    onChange(c);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, countries.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = countries[active];
      if (c) pick(c.code);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const current = countries.find((c) => c.code === value);
  const currentFlag = flagEmoji(value);
  const currentDial = dialCode(value);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-label={ariaLabel ?? t('country')}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          setActive(Math.max(0, countries.findIndex((c) => c.code === value)));
        }}
      >
        <span className={styles.flag} aria-hidden="true">
          {currentFlag}
        </span>
        <span className={styles.dial}>{currentDial}</span>
        <span className={styles.caret} aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div className={styles.popup} role="dialog">
          <input
            ref={searchRef}
            className={styles.search}
            type="text"
            value={query}
            placeholder={t('searchCountry')}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            aria-controls={listId}
          />
          <ul className={styles.list} id={listId} role="listbox">
            {countries.length === 0 ? (
              <li className={styles.empty}>{t('noCountry')}</li>
            ) : (
              countries.map((c, i) => (
                <li
                  key={c.code}
                  ref={i === active ? activeRef : undefined}
                  role="option"
                  aria-selected={c.code === value}
                  className={`${styles.option} ${i === active ? styles.optionActive : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(c.code)}
                >
                  <span className={styles.flag} aria-hidden="true">
                    {c.flag}
                  </span>
                  <span className={styles.name}>{c.name}</span>
                  <span className={styles.optionDial}>{c.dial}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
      {/* SR-friendly current selection when collapsed */}
      <span className="visually-hidden">{current?.name}</span>
    </div>
  );
}
