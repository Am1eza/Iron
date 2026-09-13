/**
 * The i18n audit's own condition 5: «یک فرایند بازبینی … بدون این فرایند،
 * این الگو تکرار می‌شود».
 *
 * The sweep it asked for has been done. This is the part that keeps it done.
 * The failure mode it guards is genuinely invisible without a test: a
 * component that hardcodes its Persian looks perfect to the Persian-speaking
 * majority, renders perfectly in every screenshot, and passes every existing
 * assertion — it is only wrong for the visitor who switched language, and
 * that visitor leaves rather than filing a bug. Which is exactly how the
 * original ~1940 lines accumulated.
 *
 * Fixture tests below prove the scanner detects rather than passing
 * vacuously, and that it does NOT flag the two things that would make it
 * unusable in this codebase: Persian in comments (this repo documents itself
 * in Persian) and Persian behind an explicit, documented exemption.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runScan } from './hardcodedPersianScan';
import { scanFiles } from './lib/hardcodedPersianScan';

function scanSource(source: string): ReturnType<typeof scanFiles> {
  const dir = mkdtempSync(path.join(tmpdir(), 'fa-scan-'));
  const file = path.join(dir, 'Subject.tsx');
  try {
    writeFileSync(file, source, 'utf8');
    return scanFiles([file]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('no untranslated user-visible Persian in customer-facing components', () => {
  it('finds none', () => {
    const findings = runScan();
    if (findings.length > 0) {
      const list = findings
        .map((f) => `  ${f.file}:${f.line}:${f.column}  [${f.kind}]  ${f.snippet}`)
        .join('\n');
      expect.fail(
        `Found ${findings.length} user-visible Persian string(s) that never went through the message ` +
          `catalogue. A visitor who switched to en/ar/zh sees these in Persian. Add a key to ` +
          `messages/*.json and read it with useTranslations()/getTranslations(), or — if the string is ` +
          `genuinely never rendered to a customer — add a "// i18n-exempt: <reason>" comment:\n${list}`,
      );
    }
  });
});

describe('the scanner detects what it claims to (guard against a vacuous pass)', () => {
  it('catches Persian rendered as JSX text', () => {
    const findings = scanSource('export const C = () => <p>قیمت میلگرد</p>;');
    expect(findings).toHaveLength(1);
    expect(findings[0]!.kind).toBe('jsx-text');
  });

  it('catches Persian in a user-visible prop', () => {
    const findings = scanSource('export const C = () => <ul aria-label="فهرست قیمت‌ها" />;');
    expect(findings).toHaveLength(1);
    expect(findings[0]!.kind).toBe('prop');
  });

  it('catches Persian in an object label — the breadcrumb shape', () => {
    const findings = scanSource(
      "export const crumbs = [{ label: 'خانه', href: '/' }, { label: 'قیمت‌ها' }];",
    );
    expect(findings).toHaveLength(2);
    expect(findings[0]!.kind).toBe('object-label');
  });

  it('catches a Persian template literal, not just a plain string', () => {
    const findings = scanSource(
      'export const C = ({ n }: { n: string }) => <h1 title={`قیمت روز ${n}`} />;',
    );
    expect(findings).toHaveLength(1);
  });

  it('does NOT flag Persian in a comment — this repo documents itself in Persian', () => {
    // A regex over file text fails this. It is the single most important
    // negative case: `PriceHeader.tsx`'s own header comment is «بر اساس
    // کارخانه», and a scanner that flagged it would be turned off within a
    // week.
    expect(
      scanSource(`
        /** The «بر اساس کارخانه» rail — قیمت‌ها grouped by mill. */
        // قیمت روز
        export const C = () => <p>{t('title')}</p>;
      `),
    ).toEqual([]);
  });

  it('does NOT flag a translated component', () => {
    expect(
      scanSource(`
        export const C = () => <p aria-label={t('label')}>{t('body')}</p>;
      `),
    ).toEqual([]);
  });

  it('honours an explicit, documented exemption', () => {
    expect(
      scanSource(`
        // i18n-exempt: staff-only log line, never rendered to a customer
        export const C = () => <p>خطای داخلی</p>;
      `),
    ).toEqual([]);
  });

  it('does NOT flag Persian digits on their own — those are formatting, not copy', () => {
    expect(scanSource('export const C = () => <span className="tnum">۴۲٬۵۰۰</span>;')).toEqual([]);
  });

  it('does NOT flag a non-user-visible prop', () => {
    // `data-*`, `className`, `key` and friends are not read by anyone.
    expect(scanSource('export const C = () => <div data-note="یادداشت" />;')).toEqual([]);
  });
});
