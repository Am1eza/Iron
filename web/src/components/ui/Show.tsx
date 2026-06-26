import type { ReactNode } from 'react';
import type { Breakpoint } from '@/lib/responsive/breakpoints';
import styles from './Show.module.css';

/**
 * Responsive visibility — CSS-driven (no JS), so it's SSR-safe and never causes a
 * hydration mismatch or layout flash. Renders children always; toggles `display`
 * via media queries. Use `above`/`below` (a breakpoint name).
 */
export function Show({
  above,
  below,
  children,
}: {
  above?: Breakpoint;
  below?: Breakpoint;
  children: ReactNode;
}) {
  const cls = [
    styles.show,
    above ? styles[`above-${above}`] : '',
    below ? styles[`below-${below}`] : '',
  ]
    .filter(Boolean)
    .join(' ');
  return <div className={cls}>{children}</div>;
}
