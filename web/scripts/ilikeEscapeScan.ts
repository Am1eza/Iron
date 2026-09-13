/**
 * H-178 — re-runnable scan (also wired into a vitest test, see
 * scripts/ilikeEscapeScan.test.ts) proving every ILIKE/LIKE pattern in the
 * server comes from `lib/server/utils/likeEscape.ts` rather than from a
 * hand-written `%${q}%`.
 *
 * Usage: `pnpm exec tsx scripts/ilikeEscapeScan.ts` — prints every finding
 * and exits 1 if there are any.
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanFiles, type Finding } from './lib/ilikeEscapeScan';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name))
      out.push(full);
  }
  return out;
}

const root = path.join(__dirname, '..');
/** Everything that can reach the database: the repos and the route handlers
 *  that occasionally build a predicate inline. */
const targets = [
  ...walk(path.join(root, 'src', 'lib', 'server')),
  ...walk(path.join(root, 'src', 'app', 'api')),
];

export function runScan(): Finding[] {
  return scanFiles(targets);
}

const isMain = path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const findings = runScan();
  for (const f of findings) {
    console.error(`${path.relative(root, f.file)}:${f.line}:${f.column}  ${f.snippet}`);
  }
  console.error(
    findings.length === 0
      ? `OK — every LIKE/ILIKE pattern across ${targets.length} files comes from likeEscape.ts`
      : `${findings.length} unescaped LIKE/ILIKE pattern(s).`,
  );
  process.exit(findings.length === 0 ? 0 : 1);
}
