'use client';
import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import styles from './Reveal.module.css';

/**
 * On-scroll reveal — a gentle fade + translateY when the element enters the
 * viewport (motion-design). Reduced-motion → content is shown immediately, no
 * transform. Purely decorative: content is always in the DOM (SEO/a11y safe).
 */
export function Reveal({
  children,
  as: Tag = 'div',
  delay = 0,
  className,
}: {
  children: ReactNode;
  as?: ElementType;
  /** Stagger in ms. */
  delay?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (reduced) {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  return (
    <Tag
      ref={ref}
      className={[styles.reveal, shown ? styles.shown : '', className].filter(Boolean).join(' ')}
      style={{ transitionDelay: shown && delay ? `${delay}ms` : undefined }}
    >
      {children}
    </Tag>
  );
}
