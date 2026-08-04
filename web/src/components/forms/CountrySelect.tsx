'use client';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  DEFAULT_PHONE_COUNTRY,
  dialCode,
  getLoadedPhoneMeta,
  loadPhoneMeta,
  type CountryCode,
  type PhoneMetaModule,
} from '@/lib/utils/phone';
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
 * there. Search matches name OR dial code.
 *
 * ── Accessibility (WCAG 2.2 · 4.1.2 Name, Role, Value · 2.1.1 Keyboard) ──
 * This used to be a button with `aria-haspopup="listbox"` opening a
 * `role="dialog"` that contained a plain text input and a `role="listbox"`,
 * with the highlighted option tracked only by a CSS class and the current
 * selection announced by a visually-hidden span OUTSIDE the button. A screen
 * reader therefore heard an unlabelled "کشور" button, never learned which
 * country was selected, and once inside the popup got no notification at all
 * as the arrow keys moved the highlight — the highlight is not DOM focus, and
 * without `aria-activedescendant` nothing conveys it. Choosing a country by
 * screen reader was not possible.
 *
 * It is now the ARIA 1.2 editable-combobox-with-listbox pattern:
 *  · the trigger's accessible name includes the CURRENT country, so collapsed
 *    state is readable;
 *  · the search input is `role="combobox"` with `aria-expanded`,
 *    `aria-controls` and `aria-autocomplete="list"`;
 *  · every option has a stable id and the input carries
 *    `aria-activedescendant`, so each arrow key announces the new option
 *    while DOM focus stays in the input (which is what makes type-ahead and
 *    arrow navigation coexist);
 *  · `aria-selected` marks the active option, `data-current` (visual only,
 *    plus a visually-hidden «انتخاب‌شده») marks the one actually in use;
 *  · Home/End jump, Escape closes AND returns focus to the trigger (otherwise
 *    focus falls to <body>), Tab closes, ArrowUp/Down on the collapsed
 *    trigger opens.
 *
 * ── Bundle (perf) ──
 * The country list and dial codes come from libphonenumber-js's ~124KB of
 * metadata. That used to be a static import, which made /login — one phone
 * field — the heaviest public route on the site, all of it downloaded and
 * parsed before first paint for a form whose default country is Iran. The
 * metadata is now a dynamic chunk (`lib/utils/phoneMeta`), prefetched on
 * pointer/focus of the trigger and awaited on open. Iran's flag and dial code
 * are static constants, so the collapsed control renders identically with
 * zero metadata loaded and the first paint is unchanged. The popup reserves
 * the list's full height while loading, so nothing shifts when it lands.
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
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [meta, setMeta] = useState<PhoneMetaModule | null>(() => getLoadedPhoneMeta());
  const [wanted, setWanted] = useState(() => getLoadedPhoneMeta() !== null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);

  // Pull the metadata chunk once anything suggests the user is heading for the
  // control (hover, focus, or an actual open). Never on mount — that would put
  // it back in the first-paint critical path, which is the whole problem.
  const want = useCallback(() => setWanted(true), []);
  useEffect(() => {
    if (!wanted || meta) return;
    let alive = true;
    loadPhoneMeta().then(
      (m) => alive && setMeta(m),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [wanted, meta]);

  const names = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: 'region' });
    } catch {
      return null;
    }
  }, [locale]);

  const countries = useMemo(() => {
    if (!meta) return [];
    const list = meta.listPhoneCountries().map((c) => ({
      code: c,
      name: names?.of(c) ?? c,
      dial: meta.dialCode(c),
      flag: flagEmoji(c),
    }));
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [meta, names, query]);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    setQuery('');
    if (refocus) triggerRef.current?.focus();
  }, []);

  // Close on outside click; focus the search when opening.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener('mousedown', onDoc);
    const id = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.clearTimeout(id);
    };
  }, [open, close]);

  // Park the highlight on the current country as soon as the list exists.
  useEffect(() => {
    if (!open || countries.length === 0) return;
    setActive((i) => {
      if (i > 0) return Math.min(i, countries.length - 1);
      const found = countries.findIndex((c) => c.code === value);
      return found >= 0 ? found : 0;
    });
    // `value` is intentionally read once per open, not tracked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, countries.length]);

  // Keep the active option scrolled into view.
  useEffect(() => {
    // Feature-detected: scrollIntoView is missing in jsdom and was absent from
    // some older mobile WebViews — an unguarded call here throws inside an
    // effect, which unmounts the whole form.
    activeRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const pick = (c: CountryCode) => {
    onChange(c);
    close(true);
  };

  const onSearchKeyDown = (e: React.KeyboardEvent) => {
    const last = countries.length - 1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, last));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(Math.max(0, last));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = countries[active];
      if (c) pick(c.code);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'Tab') {
      // Tab must leave the whole control, not land on an option.
      close(false);
    }
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      want();
      setOpen(true);
    }
  };

  const currentName = names?.of(value) ?? value;
  const currentDial = dialCode(value) ?? value;

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onPointerEnter={want}
        onFocus={want}
        onKeyDown={onTriggerKeyDown}
        onClick={() => {
          want();
          setOpen((o) => !o);
        }}
      >
        <span className={styles.flag} aria-hidden="true">
          {flagEmoji(value)}
        </span>
        <span className={styles.dial}>{currentDial}</span>
        <span className={styles.caret} aria-hidden="true">
          ▾
        </span>
        {/* The button's accessible name — «کشور: ایران», not a bare «کشور».
            This lives INSIDE the button on purpose: as a sibling span it was
            never part of the name and the selected country was unreachable. */}
        <span className="visually-hidden">{`${ariaLabel ?? t('country')}: ${currentName}`}</span>
      </button>

      {open ? (
        <div className={styles.popup}>
          <input
            ref={searchRef}
            className={styles.search}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={countries[active] ? optionId(active) : undefined}
            aria-label={t('searchCountry')}
            autoComplete="off"
            value={query}
            placeholder={t('searchCountry')}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onSearchKeyDown}
          />
          <ul className={styles.list} id={listId} role="listbox" aria-label={ariaLabel ?? t('country')}>
            {!meta ? (
              // Reserves the populated list's exact height, so the country
              // list landing never shifts the page under the user's finger.
              <li className={styles.loading} role="status">
                {t('searchCountry')}…
              </li>
            ) : countries.length === 0 ? (
              <li className={styles.empty} role="status">
                {t('noCountry')}
              </li>
            ) : (
              countries.map((c, i) => (
                <li
                  key={c.code}
                  id={optionId(i)}
                  ref={i === active ? activeRef : undefined}
                  role="option"
                  aria-selected={i === active}
                  data-current={c.code === value ? '' : undefined}
                  className={`${styles.option} ${i === active ? styles.optionActive : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(c.code)}
                >
                  <span className={styles.flag} aria-hidden="true">
                    {c.flag}
                  </span>
                  <span className={styles.name}>{c.name}</span>
                  <span className={styles.optionDial}>{c.dial}</span>
                  {c.code === value ? <span className="visually-hidden">(انتخاب‌شده)</span> : null}
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export { DEFAULT_PHONE_COUNTRY };
