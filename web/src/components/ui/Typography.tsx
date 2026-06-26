import type { CSSProperties, ElementType, ReactNode } from 'react';
import styles from './Typography.module.css';

/**
 * Typography components — bind text to the `--t-*` type tokens and semantic colors
 * so type is never hand-rolled. Persian-first; numerals/prices use the tabular set.
 */

type TextVariant =
  | 'display'
  | 'body-lg'
  | 'body'
  | 'body-sm'
  | 'caption'
  | 'overline'
  | 'label'
  | 'micro';

type TextColor = 'strong' | 'default' | 'muted' | 'accent' | 'action' | 'inverse';

const colorVar: Record<TextColor, string> = {
  strong: 'var(--color-text-strong)',
  default: 'var(--color-text)',
  muted: 'var(--color-text-muted)',
  accent: 'var(--color-accent-text)',
  action: 'var(--color-action-text)',
  inverse: 'var(--color-text-inverse)',
};

export function Text({
  variant = 'body',
  color = 'default',
  align,
  as: Tag = 'p',
  children,
  className,
}: {
  variant?: TextVariant;
  color?: TextColor;
  align?: CSSProperties['textAlign'];
  as?: ElementType;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Tag
      className={[styles.reset, className].filter(Boolean).join(' ')}
      style={{ font: `var(--t-${variant})`, color: colorVar[color], textAlign: align }}
    >
      {children}
    </Tag>
  );
}

export function Heading({
  level = 2,
  display = false,
  color = 'strong',
  children,
  className,
  id,
}: {
  level?: 1 | 2 | 3 | 4;
  display?: boolean;
  color?: TextColor;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const Tag = `h${level}` as ElementType;
  const token = display ? 'var(--t-display)' : `var(--t-h${level})`;
  return (
    <Tag
      id={id}
      className={[styles.reset, className].filter(Boolean).join(' ')}
      style={{ font: token, color: colorVar[color] }}
    >
      {children}
    </Tag>
  );
}

/** Eyebrow / section kicker. */
export function Overline({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={[styles.reset, className].filter(Boolean).join(' ')}
      style={{ font: 'var(--t-overline)', color: 'var(--color-accent-text)' }}
    >
      {children}
    </p>
  );
}

/** Tabular numeral wrapper — keeps digits aligned for scanning (prices, counts). */
export function Num({
  children,
  className,
  dir = 'ltr',
}: {
  children: ReactNode;
  className?: string;
  dir?: 'ltr' | 'rtl';
}) {
  return (
    <span dir={dir} className={['tnum', styles.num, className].filter(Boolean).join(' ')}>
      {children}
    </span>
  );
}
