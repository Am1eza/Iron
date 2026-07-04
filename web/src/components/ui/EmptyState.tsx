'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import { IBeamGlyph, SparkIcon } from '@/components/primitives/icons';
import styles from './EmptyState.module.css';

type CtaAction = { label: string; href?: string; onClick?: () => void };

/**
 * C6 · Empty / zero / error state — the "no dead-ends" component (empty-states.md).
 * Centered glyph + headline + one-line body + ONE amber primary CTA + optional
 * secondary + an always-available «پرسش از آهن‌تایم» link. Sizes: full / section / inline.
 * On `size="full"` focus moves to the heading and the region is announced.
 */
export function EmptyState({
  size = 'section',
  tone = 'empty',
  glyph,
  headline,
  headingLevel,
  body,
  primary,
  secondary,
  showAi = false,
}: {
  size?: 'full' | 'section' | 'inline';
  tone?: 'empty' | 'error';
  glyph?: ReactNode;
  headline: string;
  /** Heading level for `headline` — defaults to h1 for `full` (whole-page states like 404/500) and h2 otherwise. */
  headingLevel?: 1 | 2 | 3;
  body?: string;
  primary?: CtaAction;
  secondary?: CtaAction;
  showAi?: boolean;
}) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    if (size === 'full') headingRef.current?.focus();
  }, [size]);

  const Heading = `h${headingLevel ?? (size === 'full' ? 1 : 2)}` as 'h1' | 'h2' | 'h3';

  return (
    <div
      className={[styles.empty, styles[size]].join(' ')}
      // role="alert"/"status" already implies the correct aria-live
      // politeness — an explicit aria-live here would force "polite" even
      // for the error/alert case, downgrading it.
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {size !== 'inline' ? (
        <span className={styles.glyph} aria-hidden="true">
          {glyph ?? <IBeamGlyph size={size === 'full' ? 56 : 44} />}
        </span>
      ) : null}

      <Heading className={styles.headline} ref={headingRef} tabIndex={size === 'full' ? -1 : undefined}>
        {headline}
      </Heading>
      {body ? <p className={styles.body}>{body}</p> : null}

      {(primary || secondary || showAi) && (
        <div className={styles.actions}>
          {primary ? <Cta action={primary} variant="primary" /> : null}
          {secondary ? <Cta action={secondary} variant="ghost" /> : null}
          {showAi ? (
            <Link href={routes.ai()} className={styles.ai} data-event="ai_entry">
              <SparkIcon size={16} />
              پرسش از آهن‌تایم
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Cta({ action, variant }: { action: CtaAction; variant: 'primary' | 'ghost' }) {
  const cls = `${styles.cta} ${variant === 'primary' ? styles.ctaPrimary : styles.ctaGhost}`;
  if (action.href) {
    return (
      <Link href={action.href} className={cls}>
        {action.label}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={action.onClick}>
      {action.label}
    </button>
  );
}
