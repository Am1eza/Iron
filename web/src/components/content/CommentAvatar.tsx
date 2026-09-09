'use client';
import { useTranslations } from 'next-intl';
import styles from './CommentAvatar.module.css';

/**
 * A single brand-teal initial-letter circle (US-14.9) — deliberately not a
 * per-name color wheel: this site's whole visual identity is one accent
 * color (see tokens.css), and a rainbow of avatar colors would be the first
 * inconsistent thing on the page. No photo upload exists for a commenter,
 * so there is nothing else to show anyway.
 */
export function CommentAvatar({ name }: { name: string | null }) {
  const fallbackName = useTranslations('comments')('anonymousAuthor');
  const initial = (name ?? fallbackName).trim().charAt(0) || fallbackName.charAt(0);
  return (
    <span className={styles.avatar} aria-hidden="true">
      {initial}
    </span>
  );
}
