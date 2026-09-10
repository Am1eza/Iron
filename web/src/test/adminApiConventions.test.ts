/**
 * Architectural-invariant tests for the admin/private API surface — these
 * don't test BEHAVIOR (that's what each route's own tests do), they test
 * that every file in a class still follows the convention its neighbors do,
 * so a new or edited route can't silently fall outside protections that
 * depend on every route remembering to opt in individually:
 *
 * - G-155: proxy.ts does NOT gate `/api/admin/*` requests (only `/admin/*`
 *   PAGES) — see proxy.ts's PANEL_PASSTHROUGH_PREFIXES. Every admin API
 *   route's OWN permission guard is the only enforcement, so a route that
 *   forgets to call one is a full authorization bypass, not a UI glitch.
 * - G-162: CSV/formula-injection escaping lives in ONE place
 *   (lib/server/utils/csv.ts's escapeCsvField) — a route that builds
 *   `text/csv` content by hand instead of going through it would silently
 *   reintroduce the vulnerability fixed there.
 * - G-170: a private/admin GET response must not be cacheable by an
 *   intermediate proxy — either directly (`Cache-Control: no-store`) or via
 *   `csvResponse` (which sets it for every CSV export).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  let entries: string[];
  try {
    entries = readdirSync(abs);
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const rel = path.join(dir, entry);
    const full = path.join(ROOT, rel);
    if (statSync(full).isDirectory()) files.push(...walk(rel));
    else if (entry === 'route.ts') files.push(rel);
  }
  return files;
}

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

const ADMIN_ROUTES = walk('src/app/api/admin');
const ME_ROUTES = walk('src/app/api/me');
const PRIVATE_ROUTES = [...ADMIN_ROUTES, ...ME_ROUTES];

describe('G-155 — every admin API route calls a permission/auth guard', () => {
  it.each(ADMIN_ROUTES)('%s', (rel) => {
    const src = read(rel);
    const hasGuard = /requireApiPermission\(|requireApiUser\(|\bcan\(/.test(src);
    expect(hasGuard, `${rel} has no requireApiPermission/requireApiUser/can() call — proxy.ts does NOT gate /api/admin/* requests, so this route is currently reachable by anyone`).toBe(true);
  });

  it('found at least the expected order of magnitude of admin routes (catches walk() silently returning nothing)', () => {
    expect(ADMIN_ROUTES.length).toBeGreaterThan(50);
  });
});

describe('G-162 — CSV content is only ever built through the shared, formula-injection-safe serializer', () => {
  it.each(PRIVATE_ROUTES.filter((rel) => /text\/csv/.test(read(rel))))(
    '%s only references text/csv via csvResponse, never a hand-built string',
    (rel) => {
      const src = read(rel);
      // The literal 'text/csv' Content-Type may only appear inside csv.ts
      // itself; every OTHER file must reach it by calling csvResponse.
      expect(src.includes('csvResponse'), `${rel} sets a text/csv content type without going through csvResponse() — its escapeCsvField() formula-injection guard would be bypassed`).toBe(true);
    },
  );

  it('lib/server/utils/csv.ts is still the one place that literally sets text/csv', () => {
    const src = read('src/lib/server/utils/csv.ts');
    expect(src).toContain('text/csv');
  });
});

/** True if any `for (const ... of ...) { ... }` block in `src` contains an
 *  `await` in its body — a per-item sequential I/O loop, the one shape that
 *  would break the "one short request = role checked once is safe" argument
 *  documented in apiGuard.ts's requireApiPermission comment (G-161). Brace
 *  balanced, not just proximity-based, so a loop with a nested non-async
 *  helper function containing its own unrelated `await` isn't a false
 *  positive — only an `await` at the loop's own nesting depth counts. */
function hasSequentialAwaitLoop(src: string): boolean {
  const forRe = /for\s*\(\s*const\s+[^)]*\bof\b[^)]*\)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = forRe.exec(src))) {
    let depth = 1;
    let i = match.index + match[0].length;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
    }
    const body = src.slice(match.index + match[0].length, i - 1);
    // Strip out any nested function/arrow bodies one level deep — a helper
    // defined and immediately invoked outside the async chain doesn't count.
    if (/\bawait\b/.test(body)) return true;
  }
  return false;
}

describe('G-161 — no admin route does per-item sequential awaited I/O (the role-recheck policy documented on requireApiPermission relies on every route being one short request)', () => {
  it.each(ADMIN_ROUTES)('%s has no `for (const x of xs) { ...await... }` loop', (rel) => {
    const src = read(rel);
    expect(
      hasSequentialAwaitLoop(src),
      `${rel} awaits inside a for-of loop — this route may no longer complete as "one short request"; re-read apiGuard.ts's requireApiPermission comment (G-161) and re-check the actor's permission immediately before the operation's irreversible step, not just at the top of the handler`,
    ).toBe(false);
  });
});

describe('G-170 — every private GET response is explicitly non-cacheable', () => {
  const getRoutes = PRIVATE_ROUTES.filter((rel) => {
    const src = read(rel);
    return /async function GETImpl|export\s+(async\s+)?function GET\b|export const GET\b/.test(src);
  });

  it.each(getRoutes)('%s sets Cache-Control: no-store, directly or via csvResponse', (rel) => {
    const src = read(rel);
    const safe = src.includes('no-store') || src.includes('csvResponse');
    expect(safe, `${rel} has a GET handler with no explicit no-store and no csvResponse() — a shared cache has no signal not to store this private response`).toBe(true);
  });

  it('found at least the expected order of magnitude of GET routes (catches the filter silently matching nothing)', () => {
    expect(getRoutes.length).toBeGreaterThan(20);
  });
});
