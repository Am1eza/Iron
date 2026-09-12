import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import type * as NextIntl from 'next-intl';
import faMessages from './messages/fa.json';

/**
 * Global next-intl fallback. The i18n audit wired `useTranslations()` into a
 * large set of SHARED primitives (Alert, Chip, Modal/useConfirm, Pagination,
 * PriceParts, KgQuantityModal, …) — components with dozens of pre-existing
 * unit tests all over the tree that render them bare, with no
 * `NextIntlClientProvider` ancestor. Without this, EVERY one of those tests
 * throws "Failed to call useTranslations because the context ... was not
 * found" the moment it renders a primitive that used to be translation-free.
 *
 * This is a PARTIAL mock (`importOriginal` + spread), not a full replacement:
 * `NextIntlClientProvider` and every other export stay the REAL next-intl
 * implementation untouched, so a test using `renderWithIntl`
 * (src/test/renderWithIntl.tsx) — which wraps in a REAL provider — still
 * gets the real library's ICU formatting (locale-correct digits, plurals,
 * `{placeholder}` interpolation) exactly as before this file existed; that
 * matters concretely for e.g. `ProductsMenu.test.tsx`/`MobileDrawer.test.tsx`,
 * which assert on real Persian-digit output, and `LocaleProvider.test.tsx`,
 * which renders three DIFFERENT locales through three different real
 * providers to test the locale-switch behavior itself. Only `useLocale`/
 * `useTranslations` are wrapped, and only to catch the specific "no provider
 * in the tree" throw and fall back to resolving straight out of the real
 * `fa` message catalog — for the many OTHER tests that render a primitive
 * bare, with no provider at all, and never cared about i18n before now.
 * `messages.test.ts` (fa/en/ar/zh key-parity, ICU-placeholder-parity,
 * no-Persian-leak) is the actual source of truth for catalog correctness
 * across all four locales — this fallback only needs to be right for `fa`.
 *
 * A test file can still override this with its own file-level
 * `vi.mock('next-intl', ...)` — Vitest lets a per-file mock win over this
 * setup-level one (see LoginForm.test.tsx and CountrySelect.test.tsx, both
 * predate this global mock and keep their own simpler one).
 */
function resolveMessage(key: string): string {
  const parts = key.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- walking an untyped JSON tree
  let node: any = faMessages;
  for (const part of parts) {
    if (node && typeof node === 'object' && part in node) node = node[part];
    else return key;
  }
  return typeof node === 'string' ? node : key;
}

function fallbackTranslator(namespace?: string) {
  return (key: string, values?: Record<string, unknown>) => {
    let msg = resolveMessage(namespace ? `${namespace}.${key}` : key);
    if (values) {
      for (const [k, v] of Object.entries(values)) {
        msg = msg.replaceAll(`{${k}}`, String(v));
      }
    }
    return msg;
  };
}

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof NextIntl>();
  return {
    ...actual,
    useLocale: (...args: Parameters<typeof actual.useLocale>) => {
      // `actual.useLocale()`/`useTranslations()` both call React's own
      // `useContext` unconditionally before deciding whether to throw — the
      // throw is plain JS control flow AFTER that hook call, not a
      // conditionally-skipped hook, so catching it here does not violate
      // the Rules of Hooks (call count/order stays identical every render).
      try {
        return actual.useLocale(...args);
      } catch {
        return 'fa';
      }
    },
    useTranslations: (...args: Parameters<typeof actual.useTranslations>) => {
      try {
        return actual.useTranslations(...args);
      } catch {
        return fallbackTranslator(args[0] as string | undefined);
      }
    },
  };
});

// Server-only counterpart of the mock above. `getTranslations`/`getLocale`
// from `next-intl/server` need Next's RSC ("react-server") module condition
// to resolve to their real implementation; vitest never sets that condition,
// so the package resolves to a stub that unconditionally throws "`...` is
// not supported in Client Components" — surfaced the moment I-09's metadata
// localization work (generateMetadata/crumbs reading `getTranslations()`
// server-side) got its first unit test coverage. Same fallback strategy as
// the `next-intl` mock above: try the real export, and on that throw, serve
// the fa catalog directly.
vi.mock('next-intl/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl/server')>();
  return {
    ...actual,
    getTranslations: async (...args: Parameters<typeof actual.getTranslations>) => {
      try {
        return await actual.getTranslations(...args);
      } catch {
        const arg = args[0];
        const namespace = typeof arg === 'string' ? arg : arg?.namespace;
        return fallbackTranslator(namespace);
      }
    },
    getLocale: async (...args: Parameters<typeof actual.getLocale>) => {
      try {
        return await actual.getLocale(...args);
      } catch {
        return 'fa';
      }
    },
  };
});

// `@/i18n/navigation` (next-intl/navigation's `createNavigation`, used by the
// URL-locale migration — I-07/I-08) calls `useLocale` from the `use-intl`
// PACKAGE directly, not through next-intl's own re-export above — mocking
// `use-intl` itself does not reliably catch it (next-intl's own bundle can
// resolve a different physical copy of that dependency under pnpm's isolated
// node_modules), so any component using the locale-aware `useRouter`/
// `usePathname`/`Link` throws "no provider" in a bare `render()`.
//
// Simpler and more robust: mock the module tests actually import
// (`@/i18n/navigation`) to delegate straight to `next/link`/`next/navigation`
// — which transparently picks up each test FILE's OWN existing
// `vi.mock('next/navigation', ...)` override (vi.mock intercepts by module
// specifier project-wide, regardless of who does the importing), so the
// dozens of pre-existing per-file navigation mocks keep working completely
// unchanged. Locale-prefixing itself is never what these unit tests are
// about; `LocaleSwitcher.test.tsx`/e2e specs are what actually exercise that.
vi.mock('@/i18n/navigation', async () => {
  const link = await import('next/link');
  const nav = await import('next/navigation');
  return {
    Link: link.default,
    useRouter: nav.useRouter,
    usePathname: nav.usePathname,
    redirect: nav.redirect,
    getPathname: (opts: { href: unknown }) =>
      typeof opts?.href === 'string' ? opts.href : (opts?.href as { pathname?: string })?.pathname,
  };
});

// Use the browser environment's storage, even when Node exposes its own
// global storage properties. Stores and components must share window storage.
const browserWindow = (globalThis as typeof globalThis & { jsdom?: { window: Window } }).jsdom
  ?.window;
if (browserWindow) {
  for (const key of ['localStorage', 'sessionStorage'] as const) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      enumerable: true,
      value: browserWindow[key],
      writable: true,
    });
  }
}

// Unmount React trees between tests to keep them isolated.
afterEach(() => cleanup());

// jsdom doesn't implement matchMedia — stub it for components that read it.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
