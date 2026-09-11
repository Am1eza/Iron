import { describe, it, expect } from 'vitest';
import { scanSource } from './zodStringMaxScan';

describe('scanSource', () => {
  it('flags a bare z.string() field with no bound', () => {
    const src = `import { z } from 'zod';\nexport const s = z.object({ name: z.string() });\n`;
    const findings = scanSource('test.ts', src);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.line).toBe(2);
  });

  it('does not flag a field with .max()', () => {
    const src = `import { z } from 'zod';\nexport const s = z.object({ name: z.string().max(60) });\n`;
    expect(scanSource('test.ts', src)).toHaveLength(0);
  });

  it('does not flag a field with .max() chained on a LATER line (multi-line schema)', () => {
    const src = `import { z } from 'zod';\nexport const s = z.object({\n  message: z\n    .string()\n    .min(1)\n    .max(2000),\n});\n`;
    expect(scanSource('test.ts', src)).toHaveLength(0);
  });

  it('does not flag a fixed-format validator (.regex/.uuid/.superRefine)', () => {
    const src = [
      `import { z } from 'zod';`,
      `export const a = z.object({ id: z.string().regex(/^[a-z]+$/) });`,
      `export const b = z.object({ id: z.string().uuid() });`,
      `export const c = z.string().superRefine((v, ctx) => {});`,
    ].join('\n');
    expect(scanSource('test.ts', src)).toHaveLength(0);
  });

  it('does not flag a field with a documented "unbounded:" exemption comment', () => {
    const src = `import { z } from 'zod';\nexport const s = z.object({\n  // unbounded: internal, never user-supplied\n  raw: z.string(),\n});\n`;
    expect(scanSource('test.ts', src)).toHaveLength(0);
  });

  it('ignores files that do not import zod (e.g. an unrelated local `z`)', () => {
    const src = `const z = { string: () => ({}) };\nconst s = z.string();\n`;
    expect(scanSource('test.ts', src)).toHaveLength(0);
  });

  it('flags multiple unbounded fields in one schema', () => {
    const src = `import { z } from 'zod';\nexport const s = z.object({ a: z.string(), b: z.string().optional() });\n`;
    expect(scanSource('test.ts', src)).toHaveLength(2);
  });
});
