import type { ElementType, ReactNode } from 'react';
import styles from './Card.module.css';

/**
 * F10 · Card — white paper, hairline, `--radius-md`, no shadow by default
 * (shadow only when floating). `interactive` adds hover lift for linked cards.
 */
export function Card({
  children,
  className,
  interactive = false,
  padded = true,
  as: Tag = 'div',
  role,
  'aria-live': ariaLive,
  'aria-atomic': ariaAtomic,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  padded?: boolean;
  as?: ElementType;
  /** e.g. `role="status"` to make a result panel an announced live region. */
  role?: string;
  'aria-live'?: 'polite' | 'assertive' | 'off';
  'aria-atomic'?: boolean | 'true' | 'false';
}) {
  return (
    <Tag
      className={[
        styles.card,
        interactive ? styles.interactive : '',
        padded ? styles.padded : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      role={role}
      aria-live={ariaLive}
      aria-atomic={ariaAtomic}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={[styles.header, className].filter(Boolean).join(' ')}>{children}</div>;
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={[styles.body, className].filter(Boolean).join(' ')}>{children}</div>;
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={[styles.footer, className].filter(Boolean).join(' ')}>{children}</div>;
}
