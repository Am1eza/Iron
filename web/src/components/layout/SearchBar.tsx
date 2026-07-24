'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { routes } from '@/lib/routes';
import { normalizeDigits } from '@/lib/utils/format';
import { SearchIcon, CloseIcon } from '@/components/primitives/icons';
import styles from './SearchBar.module.css';

type Props = {
  size?: 'sm' | 'lg';
  autoFocus?: boolean;
  placeholder?: string;
  /** Visually-hidden label text for the input. */
  label?: string;
  /** Pre-fill (controlled) — the /search page passes the current ?q= so the
   *  field re-syncs when the user navigates between queries e.g. via a
   *  suggestion chip, without a full remount. */
  initial?: string;
};

/**
 * N15 · Search as navigation. Submits to `/جستجو?q=` (digit-normalized so «۱۴» and
 * «14» both match). `lg` is the home/AI/search-page variant; `sm` is the header
 * utility variant.
 */
export function SearchBar({
  size = 'sm',
  autoFocus = false,
  placeholder = 'جستجوی محصول، سایز، کارخانه…',
  label = 'جستجو در آهن‌تایم',
  initial = '',
}: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [q, setQ] = useState(initial);

  useEffect(() => {
    setQ(initial);
  }, [initial]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = normalizeDigits(q).trim();
    if (term.length === 0) {
      inputRef.current?.focus();
      return;
    }
    router.push(routes.search(term));
  };

  return (
    <form
      role="search"
      className={`${styles.bar} ${size === 'lg' ? styles.lg : styles.sm}`}
      onSubmit={submit}
      data-event="search_use"
    >
      <SearchIcon className={styles.icon} size={size === 'lg' ? 22 : 18} />
      <input
        ref={inputRef}
        type="search"
        inputMode="search"
        className={styles.input}
        placeholder={placeholder}
        aria-label={label}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus={autoFocus}
        enterKeyHint="search"
      />
      {q.length > 0 && (
        <button
          type="button"
          className={styles.clear}
          aria-label="پاک کردن جستجو"
          onClick={() => {
            setQ('');
            inputRef.current?.focus();
          }}
        >
          <CloseIcon size={16} />
        </button>
      )}
      {size === 'lg' && (
        <button type="submit" className={styles.submit}>
          جستجو
        </button>
      )}
    </form>
  );
}
