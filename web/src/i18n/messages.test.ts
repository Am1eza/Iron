import { describe, expect, it } from 'vitest';
import { LOCALES, DEFAULT_LOCALE } from './config';
import fa from '../../messages/fa.json';
import en from '../../messages/en.json';
import ar from '../../messages/ar.json';
import zh from '../../messages/zh.json';

/**
 * The four catalogues are key-identical by hand, and nothing enforced it.
 * A missing key does not fail the build: `next-intl` renders the key path as
 * literal text (`home.why.warehouse.title`) in the switched locale, which is
 * exactly the sort of thing nobody notices until a visitor does — the site
 * renders `fa` server-side, so a hole in `en`/`ar`/`zh` is invisible unless you
 * actively switch language.
 *
 * It also pins the ICU placeholders. A translator dropping `{count}` from
 * `home.why.tools.meta`, or renaming `{sku}` to `{skus}`, throws at render
 * time in that locale only.
 */
const CATALOGUES: Record<string, unknown> = { fa, en, ar, zh };

type Leaf = [path: string, value: string];

function leaves(node: unknown, prefix = ''): Leaf[] {
  if (typeof node === 'string') return [[prefix, node]];
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([key, value]) =>
      leaves(value, prefix ? `${prefix}.${key}` : key),
    );
  }
  throw new Error(`unexpected non-string leaf at ${prefix}`);
}

/** `{count}` → `count`; ignores next-intl rich-text tags like `<b>`. */
function placeholders(message: string): string[] {
  return [...message.matchAll(/\{(\w+)/g)].map((m) => m[1]!).sort();
}

const base = new Map(leaves(fa));

describe('message catalogues', () => {
  it('covers every configured locale', () => {
    expect(Object.keys(CATALOGUES).sort()).toEqual([...LOCALES].sort());
    expect(CATALOGUES[DEFAULT_LOCALE]).toBe(fa);
  });

  for (const locale of LOCALES) {
    if (locale === DEFAULT_LOCALE) continue;

    it(`${locale} has exactly the same keys as ${DEFAULT_LOCALE}`, () => {
      const keys = new Set(leaves(CATALOGUES[locale]).map(([path]) => path));
      expect([...base.keys()].filter((k) => !keys.has(k))).toEqual([]);
      expect([...keys].filter((k) => !base.has(k))).toEqual([]);
    });

    it(`${locale} keeps every ICU placeholder`, () => {
      for (const [path, message] of leaves(CATALOGUES[locale])) {
        expect({ path, vars: placeholders(message) }).toEqual({
          path,
          vars: placeholders(base.get(path)!),
        });
      }
    });
  }

  it('never leaves a non-Persian catalogue holding Persian-only letters', () => {
    // گ چ پ ژ do not exist in Arabic — their presence in ar.json (or in en/zh
    // at all) means a Persian string was pasted in untranslated.
    const persianOnly = /[پچژگیک]/;
    for (const locale of ['en', 'ar', 'zh'] as const) {
      const leaked = leaves(CATALOGUES[locale])
        .filter(([, message]) => persianOnly.test(message))
        .map(([path]) => path);
      expect(leaked).toEqual([]);
    }
  });
});
