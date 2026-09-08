/**
 * Shared `next-intl` test double — resolves real Persian text out of
 * `messages/fa.json` instead of a hand-typed dictionary per test file.
 *
 * `LoginForm.test.tsx`/`CountrySelect.test.tsx` each hand-roll their own
 * `vi.mock('next-intl', ...)` with a small literal `{ key: 'text' }` map.
 * That works for one or two keys, but a component with dozens of `t()`
 * calls (the price/catalog surfaces) would need the same Persian strings
 * copy-pasted into every one of its test files — and a typo there silently
 * asserts against text the app never actually renders. Reading `fa.json`
 * instead means a test can never drift from what `messages.test.ts` already
 * guarantees is the real, key-complete catalogue: there is exactly one
 * Persian source of truth for a string, in the app and in its tests.
 *
 * Usage, in a test file:
 * ```ts
 * vi.mock('next-intl', async () => {
 *   const { mockUseLocale, mockUseTranslations } = await import('@/test/intlMock');
 *   return { useLocale: mockUseLocale, useTranslations: mockUseTranslations };
 * });
 * ```
 */
import { createElement, Fragment, type ReactNode } from 'react';
import fa from '../../messages/fa.json';

function readPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, segment) => {
    if (node && typeof node === 'object' && segment in (node as Record<string, unknown>)) {
      return (node as Record<string, unknown>)[segment];
    }
    return undefined;
  }, source);
}

/** `{name}` → the matching value from `params`, left as-is if unmatched —
 *  a plain stand-in for next-intl's real ICU interpolation, sufficient for
 *  assertions (`messages.test.ts` already checks every placeholder is real
 *  ICU and present in every locale). */
function interpolate(template: string, params?: Record<string, unknown>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * Minimal `t.rich()` stand-in — enough to resolve `{param}` values and
 * `<tag>chunks</tag>` markup against a `values` map of render functions
 * (next-intl's real shape, see `AboutContent.tsx`'s `t.rich('storyP1', { b:
 * (chunks) => <strong>{chunks}</strong> })`). Not full ICU: no plural/select,
 * no nested tags — every `t.rich` call in this codebase today is one flat
 * sentence with a handful of `{param}`s and one tag, and this covers exactly
 * that shape.
 */
function richInterpolate(
  template: string,
  values: Record<string, ((chunks: ReactNode) => ReactNode) | string | number>,
): ReactNode {
  const pattern = /\{(\w+)\}|<(\w+)>([\s\S]*?)<\/\2>/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(template))) {
    if (match.index > lastIndex) parts.push(template.slice(lastIndex, match.index));
    const [, paramName, tagName, tagContent] = match;
    if (paramName) {
      const value = values[paramName];
      parts.push(value === undefined ? match[0] : String(value));
    } else if (tagName) {
      const renderer = values[tagName];
      parts.push(
        createElement(
          Fragment,
          { key: key++ },
          typeof renderer === 'function' ? renderer(tagContent) : tagContent,
        ),
      );
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < template.length) parts.push(template.slice(lastIndex));
  return parts;
}

export function mockUseLocale(): string {
  return 'fa';
}

export function mockUseTranslations(namespace?: string) {
  const resolve = (key: string): string => {
    const fullPath = namespace ? `${namespace}.${key}` : key;
    const value = readPath(fa, fullPath);
    return typeof value === 'string' ? value : fullPath;
  };
  const t = (key: string, params?: Record<string, unknown>): string =>
    interpolate(resolve(key), params);
  t.rich = (
    key: string,
    values: Record<string, ((chunks: ReactNode) => ReactNode) | string | number>,
  ): ReactNode => richInterpolate(resolve(key), values);
  return t;
}
