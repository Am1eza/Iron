'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { routes } from '@/lib/routes';
import { normalizeDigits } from '@/lib/utils/format';
import { SearchIcon, CloseIcon } from '@/components/primitives/icons';
import styles from './SearchBox.module.css';

/**
 * Search page input — the controlled، large variant of site search. Mirrors the
 * header SearchBar behaviour (digit-normalized so «۱۴» و «14» both match) but is
 * pre-filled from the current query and submits back to /search?q=… so results
 * re-render from the server. Reduced-motion friendly (only token transitions).
 */
export function SearchBox({
  initial = '',
  autoFocus = false,
}: {
  initial?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [q, setQ] = useState(initial);

  // Keep the field in sync if the user navigates between queries (e.g. via a
  // suggestion chip) without a full remount.
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
    <form role="search" className={styles.bar} onSubmit={submit} data-event="search_use">
      <SearchIcon className={styles.icon} size={22} aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        inputMode="search"
        className={styles.input}
        placeholder="جستجوی محصول، سایز، کارخانه یا مقاله…"
        aria-label="جستجو در آهن‌تایم"
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
      <button type="submit" className={styles.submit}>
        جستجو
      </button>
    </form>
  );
}
