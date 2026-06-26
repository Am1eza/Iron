/**
 * Code-splitting boundaries. Heavy or interaction-only client components are
 * loaded with `next/dynamic` so they stay out of the initial bundle and arrive
 * only when actually needed. Route-level splitting is automatic in the App Router;
 * these are the component-level splits.
 */
import dynamic from 'next/dynamic';

/** The «محصولات» mega-menu — only mounts on hover/click of the trigger. */
export const MegaMenu = dynamic(
  () => import('./layout/MegaMenu').then((m) => m.MegaMenu),
  { ssr: false },
);

/** Modal/dialog — interaction-only; no reason to ship on first paint. */
export const Modal = dynamic(() => import('./ui/Modal').then((m) => m.Modal), {
  ssr: false,
});
