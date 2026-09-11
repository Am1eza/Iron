/**
 * H-173 — re-runnable scan (also wired into a vitest test, see
 * src/lib/validation/zodStringMaxScan.test.ts) for `z.string()` fields with
 * no length cap, across every schema that actually gates API input: the
 * shared `lib/validation/**` schemas AND every inline `z.object(...)` schema
 * defined directly in an `app/api/**` route handler (there are far more of
 * the latter than the former — the ~67-schema figure in the original manual
 * review referred to routes using SOME schema, most of them inline, not
 * literally 67 exported objects in lib/validation).
 *
 * Usage: `pnpm exec tsx scripts/schemaLengthCapScan.ts` — prints every
 * finding and exits 1 if any are not on the documented allowlist.
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanFiles, type Finding } from './lib/zodStringMaxScan';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const root = path.join(__dirname, '..');
const targets = [
  // env.ts/env.test.ts validate operator-set CONFIGURATION (env vars), not
  // attacker-reachable API input — a long secret/URL is not the abuse this
  // audit item is about, and .max()-ing them would be actively wrong (e.g. a
  // legitimately long DATABASE_URL). Everything else in lib/validation gates
  // real request input.
  ...walk(path.join(root, 'src', 'lib', 'validation')).filter((f) => !/[/\\]env\.tsx?$/.test(f)),
  ...walk(path.join(root, 'src', 'app', 'api')).filter((f) => f.endsWith('route.ts')),
];

export function runScan(): Finding[] {
  return scanFiles(targets);
}

const isMain = path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const findings = runScan();
  if (findings.length === 0) {
    console.log(`PASS: scanned ${targets.length} files, every z.string() field is length-bounded.`);
    process.exit(0);
  }
  console.log(`Found ${findings.length} unbounded z.string() field(s) across ${targets.length} scanned files:\n`);
  for (const f of findings) {
    console.log(`  ${path.relative(root, f.file)}:${f.line}:${f.column}  ${f.snippet}`);
  }
  process.exit(1);
}
