/**
 * Re-runnable scan (also wired into a vitest test, see
 * scripts/hardcodedPersianScan.test.ts) for user-visible Persian that never
 * went through the message catalogue, in customer-facing components.
 *
 * Usage: `pnpm exec tsx scripts/hardcodedPersianScan.ts`
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanFiles, type Finding } from './lib/hardcodedPersianScan';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

/** Staff-only surfaces: Persian by design, no foreign reader. */
const EXCLUDED_DIRS = [path.join('src', 'components', 'admin'), path.join('src', 'app', 'admin')];

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (EXCLUDED_DIRS.some((ex) => full.includes(ex))) continue;
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const targets = [
  ...walk(path.join(root, 'src', 'components')),
  ...walk(path.join(root, 'src', 'app', '[locale]')),
];

export function runScan(): Finding[] {
  return scanFiles(targets);
}

const isMain = path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const findings = runScan();
  for (const f of findings) {
    console.error(
      `${path.relative(root, f.file)}:${f.line}:${f.column}  [${f.kind}]  ${f.snippet}`,
    );
  }
  console.error(
    findings.length === 0
      ? `OK — no untranslated user-visible Persian across ${targets.length} customer-facing components`
      : `${findings.length} untranslated user-visible Persian string(s) in ${targets.length} files.`,
  );
  process.exit(findings.length === 0 ? 0 : 1);
}
