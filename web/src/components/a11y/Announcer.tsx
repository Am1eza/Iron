'use client';
import { useAnnouncerStore } from '@/lib/stores/announcer';

/**
 * Global ARIA live regions (mount once, in the providers). Two regions:
 * polite (most messages) and assertive (errors/urgent). Visually hidden.
 */
export function Announcer() {
  const polite = useAnnouncerStore((s) => s.polite);
  const assertive = useAnnouncerStore((s) => s.assertive);
  return (
    <>
      <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {polite}
      </div>
      <div className="visually-hidden" role="alert" aria-live="assertive" aria-atomic="true">
        {assertive}
      </div>
    </>
  );
}
