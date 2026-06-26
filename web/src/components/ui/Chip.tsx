'use client';
import type { ReactNode } from 'react';
import { CloseIcon } from '@/components/primitives/icons';
import styles from './Chip.module.css';

/**
 * B2 · Chip / Tag.
 * - `suggestion` (AI): cobalt-tinted, used for starter questions.
 * - `filter`: selectable; when `selected` shows the accent outline; `onRemove` adds «×».
 */
export function Chip({
  children,
  variant = 'filter',
  selected = false,
  onClick,
  onRemove,
  className,
}: {
  children: ReactNode;
  variant?: 'suggestion' | 'filter';
  selected?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <span
      className={[
        styles.chip,
        styles[variant],
        selected ? styles.selected : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className={styles.main}
        onClick={onClick}
        aria-pressed={variant === 'filter' ? selected : undefined}
      >
        {children}
      </button>
      {onRemove ? (
        <button
          type="button"
          className={styles.remove}
          aria-label="حذف"
          onClick={onRemove}
        >
          <CloseIcon size={14} />
        </button>
      ) : null}
    </span>
  );
}
