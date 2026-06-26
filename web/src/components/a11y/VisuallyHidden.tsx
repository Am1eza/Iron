import type { ElementType, ReactNode } from 'react';

/**
 * Visually-hidden content that remains available to screen readers (the global
 * `.visually-hidden` utility, as a component). Use for labels, live text, and
 * extra context that shouldn't show visually.
 */
export function VisuallyHidden({
  children,
  as: Tag = 'span',
}: {
  children: ReactNode;
  as?: ElementType;
}) {
  return <Tag className="visually-hidden">{children}</Tag>;
}
