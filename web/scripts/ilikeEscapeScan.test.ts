/**
 * H-178 — the escaping was already right at every call site; what was missing
 * was anything that would keep it right. The audit's own note: "a future fix
 * that adds a new ILIKE and forgets escapeLike, nothing catches — except
 * another manual audit."
 *
 * This is that catch. It also tests the SCANNER against hand-written fixtures,
 * because an architecture test that silently matched nothing would be worse
 * than no test at all: it would report success forever.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runScan } from './ilikeEscapeScan';
import { scanFiles } from './lib/ilikeEscapeScan';

/** Write a throwaway .ts file and scan it. */
function scanSource(source: string): ReturnType<typeof scanFiles> {
  const dir = mkdtempSync(path.join(tmpdir(), 'ilike-scan-'));
  const file = path.join(dir, 'subject.ts');
  try {
    writeFileSync(file, source, 'utf8');
    return scanFiles([file]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('H-178 — every LIKE/ILIKE pattern is escaped', () => {
  it('finds no hand-built pattern anywhere in the server', () => {
    const findings = runScan();
    if (findings.length > 0) {
      const list = findings
        .map((f) => `  ${f.file}:${f.line}:${f.column}  ${f.snippet}`)
        .join('\n');
      expect.fail(
        `Found ${findings.length} LIKE/ILIKE pattern(s) not built by likeEscape.ts. Use ` +
          `likeContains()/likeContainsDigitVariants() instead of a template literal — an unescaped ` +
          `%/_ makes the search answer a different question than the one typed, and a bare % turns ` +
          `a substring scan into a full table scan:\n${list}`,
      );
    }
  });
});

describe('the scanner itself actually detects things (guard against a vacuous pass)', () => {
  it('catches a hand-written template pattern', () => {
    const findings = scanSource(`
      import { ilike } from 'drizzle-orm';
      export const w = (q: string) => ilike(skus.name, \`%\${q}%\`);
    `);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.snippet).toContain('ilike(');
  });

  it('catches a bare identifier that never went through the helper', () => {
    const findings = scanSource(`
      import { ilike } from 'drizzle-orm';
      export const w = (q: string) => { const term = q.trim(); return ilike(skus.name, term); };
    `);
    expect(findings).toHaveLength(1);
  });

  it('accepts a direct helper call', () => {
    expect(
      scanSource(`
        import { ilike } from 'drizzle-orm';
        import { likeContains } from '@/lib/server/utils/likeEscape';
        export const w = (q: string) => ilike(skus.name, likeContains(q));
      `),
    ).toEqual([]);
  });

  it('follows the helper through a local binding', () => {
    expect(
      scanSource(`
        import { ilike } from 'drizzle-orm';
        import { likeContains } from '@/lib/server/utils/likeEscape';
        export const w = (q: string) => { const term = likeContains(q); return ilike(skus.name, term); };
      `),
    ).toEqual([]);
  });

  it('follows it through the flatMap shape the repos actually use', () => {
    // `const terms = likeContainsDigitVariants(q)` → `terms.flatMap((t) => ilike(col, t))`
    // is the real shape in ordersRepo/leadsRepo/alertsRepo. A grep cannot tell
    // this apart from the unsafe version; the taint analysis can.
    expect(
      scanSource(`
        import { ilike, or } from 'drizzle-orm';
        import { likeContainsDigitVariants } from '@/lib/server/utils/likeEscape';
        export const w = (q: string) => {
          const terms = likeContainsDigitVariants(q);
          return or(...terms.flatMap((t) => [ilike(orders.ref, t), ilike(leads.contactName, t)]));
        };
      `),
    ).toEqual([]);
  });

  it('follows it through the .map(likeContains) shape', () => {
    expect(
      scanSource(`
        import { ilike } from 'drizzle-orm';
        import { likeContains } from '@/lib/server/utils/likeEscape';
        export const w = (q: string) => {
          const patterns = [q, q.trim()].filter((t) => t.length > 0).map(likeContains);
          return patterns.map((p) => ilike(haystack, p));
        };
      `),
    ).toEqual([]);
  });

  it('honours an explicit, documented escape hatch', () => {
    expect(
      scanSource(`
        import { ilike } from 'drizzle-orm';
        // like-escaped: pattern is a fixed literal, no user input reaches it
        export const w = () => ilike(skus.name, '%میلگرد%');
      `),
    ).toEqual([]);
  });

  it('does not treat an unrelated function call as an escape', () => {
    const findings = scanSource(`
      import { ilike } from 'drizzle-orm';
      export const w = (q: string) => ilike(skus.name, normalizeDigits(q));
    `);
    expect(findings).toHaveLength(1);
  });
});
