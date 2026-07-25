'use client';
import { useUiStore } from '@/lib/stores/ui';
import { SunIcon, MoonIcon } from '@/components/primitives/icons';
import styles from './admin.module.css';

/**
 * Dark-mode toggle for the panel topbar — for night shifts. Rides the app's
 * existing theme infrastructure (ui store + StoreHydrator stamping
 * <html data-theme>, tokens.css [data-theme="dark"] values), which was fully
 * wired but had no control surface anywhere.
 */
export function AdminThemeToggle() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className={styles.themeBtn}
      aria-pressed={dark}
      aria-label={dark ? 'حالت روشن' : 'حالت تاریک'}
      title={dark ? 'حالت روشن' : 'حالت تاریک'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      {dark ? <SunIcon size={18} /> : <MoonIcon size={18} />}
    </button>
  );
}
