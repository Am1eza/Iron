'use client';
import { useUiStore } from '@/lib/stores/ui';
import styles from './ThemeToggle.module.css';

/**
 * Theme toggle (Color Tokens). Flips the persisted `theme`; <StoreHydrator/>
 * applies it to `:root[data-theme]`, which re-points every semantic color token.
 */
export function ThemeToggle() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const dark = theme === 'dark';

  return (
    <button
      type="button"
      className={styles.toggle}
      role="switch"
      aria-checked={dark}
      aria-label={dark ? 'حالت روشن' : 'حالت تیره'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      <span className={styles.icon} aria-hidden="true">
        {dark ? (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 13A9 9 0 1111 3a7 7 0 0010 10z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4.5" />
            <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
          </svg>
        )}
      </span>
    </button>
  );
}
