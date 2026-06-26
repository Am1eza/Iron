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
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  padded?: boolean;
  as?: ElementType;
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
