#!/usr/bin/env node
/**
 * Swaps `src/proxy.ts` (Node-runtime, Postgres-backed — the Docker/
 * self-hosted target) out for `src/proxy.workers.ts` (Edge-runtime,
 * DB-free — see that file's doc comment for why) for the duration of a
 * single command, then restores the original tree — success or failure.
 *
 * Next.js 16 only recognizes ONE of `proxy.ts`/`middleware.ts` as the
 * routing-gate convention at a time, and only `middleware.ts` can still opt
 * into the Edge runtime (the `proxy` convention hardcodes Node.js — see
 * proxy.workers.ts's comment) — so the swap physically renames the file,
 * it can't be a build-time alias/env-flag like the sharp stub in
 * next.config.mjs.
 *
 * Usage: node scripts/cf-proxy-swap.mjs -- <command> [args...]
 */
import { existsSync, renameSync, copyFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const webDir = dirname(dirname(fileURLToPath(import.meta.url)));
const proxyPath = join(webDir, 'src/proxy.ts');
const proxyStashPath = join(webDir, 'src/proxy.ts.cf-stash');
const workersSourcePath = join(webDir, 'src/proxy.workers.ts');
const middlewarePath = join(webDir, 'src/middleware.ts');

// These test files import `./proxy` directly and exist solely to exercise
// the Node-runtime proxy.ts (which isn't present during this build) —
// `next build`'s own TypeScript pass fails on the now-dangling import
// otherwise. Stashed alongside proxy.ts for the same reason/duration.
const proxyTestFiles = [
  join(webDir, 'src/proxy.test.ts'),
  join(webDir, 'src/proxy.locale.test.ts'),
];

const sepIndex = process.argv.indexOf('--');
const command = sepIndex === -1 ? process.argv.slice(2) : process.argv.slice(sepIndex + 1);
if (command.length === 0) {
  console.error('Usage: node scripts/cf-proxy-swap.mjs -- <command> [args...]');
  process.exit(1);
}

if (!existsSync(proxyPath)) {
  console.error(`cf-proxy-swap: expected ${proxyPath} to exist before swapping`);
  process.exit(1);
}
if (
  existsSync(proxyStashPath) ||
  existsSync(middlewarePath) ||
  proxyTestFiles.some((f) => existsSync(stashPathFor(f)))
) {
  console.error(
    'cf-proxy-swap: a previous run left the tree swapped (a .cf-stash file or ' +
      'src/middleware.ts already exists) — resolve manually before re-running.',
  );
  process.exit(1);
}

function stashPathFor(p) {
  return `${p}.cf-stash`;
}

function swapIn() {
  renameSync(proxyPath, proxyStashPath);
  copyFileSync(workersSourcePath, middlewarePath);
  for (const testFile of proxyTestFiles) {
    if (existsSync(testFile)) renameSync(testFile, stashPathFor(testFile));
  }
}

function swapOut() {
  if (existsSync(middlewarePath)) rmSync(middlewarePath);
  if (existsSync(proxyStashPath) && !existsSync(proxyPath)) {
    renameSync(proxyStashPath, proxyPath);
  }
  for (const testFile of proxyTestFiles) {
    const stash = stashPathFor(testFile);
    if (existsSync(stash) && !existsSync(testFile)) renameSync(stash, testFile);
  }
}

swapIn();
let result;
try {
  result = spawnSync(command[0], command.slice(1), { stdio: 'inherit', cwd: webDir });
} finally {
  swapOut();
}

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
