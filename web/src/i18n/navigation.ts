import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/**
 * Locale-aware `Link`/`redirect`/`usePathname`/`useRouter` — drop-in
 * replacements for `next/link`/`next/navigation`'s versions, same API,
 * except every href/push/replace target is automatically prefixed with the
 * CURRENT locale (or left bare for `fa`, per `routing.ts`'s
 * `localePrefix: 'as-needed'`). Every component that links or navigates
 * within the app must import from here instead of `next/link`/
 * `next/navigation` — a plain `next/link` on an `/en/...` page would point
 * back at the bare (fa) URL and silently drop the visitor's chosen language
 * on the very first click.
 *
 * `routes.ts` (`lib/routes.ts`) still returns bare, locale-neutral paths —
 * nothing there changed. This wrapper is what adds the locale prefix on top
 * of whatever `routes.ts` returns, so the two compose exactly as before:
 * `<Link href={routes.prices()}>` still works, now locale-aware.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
