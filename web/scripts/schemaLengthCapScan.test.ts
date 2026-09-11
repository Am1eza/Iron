/**
 * H-173 — CI-enforced regression test for the length-cap scan. Manual review
 * previously covered only the ~4 schemas a grep happened to find
 * (contactSchema/cooperationSchema/requestSchema/weightSchema); this walks
 * the real TypeScript AST of every schema file under lib/validation and
 * every app/api route.ts (the actual request-input surface — see
 * scripts/schemaLengthCapScan.ts's target list), so a future PR that adds a
 * new `z.string()` field with no `.max()`/`.length()`/fixed-format validator
 * fails THIS test automatically, not a future manual audit.
 */
import { describe, it, expect } from 'vitest';
import { runScan } from './schemaLengthCapScan';

describe('H-173 — every z.string() field is length-bounded', () => {
  it('has no unbounded z.string() field across lib/validation and app/api routes', () => {
    const findings = runScan();
    if (findings.length > 0) {
      const list = findings.map((f) => `  ${f.file}:${f.line}:${f.column}  ${f.snippet}`).join('\n');
      expect.fail(
        `Found ${findings.length} unbounded z.string() field(s). Add .max()/.length() (or a fixed-format ` +
          `validator like .regex()/.uuid()/.superRefine()), or mark it with a "// unbounded: <reason>" comment ` +
          `if it's deliberate:\n${list}`,
      );
    }
  });
});
