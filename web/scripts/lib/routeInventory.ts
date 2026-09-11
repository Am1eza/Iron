/**
 * H-171 — machine-checked inventory of every `route.ts` under src/app/api:
 * does it call an auth guard, is it rate-limited, does it validate its body.
 * A grep-based heuristic (per the audit's own acceptance criteria: "catching
 * the ABSENCE of expected patterns is enough, as long as it's automated and
 * re-run every time, not manual") — not full static analysis, but good
 * enough to turn a one-time manual review into something CI re-checks on
 * every future route.
 */
import fs from 'node:fs';
import path from 'node:path';

const AUTH_GUARD_PATTERN = /\b(requireApiPermission|requireApiUser|getSessionVerified)\(/;
const RATE_LIMIT_PATTERN = /\brateLimit\(/;
const VALIDATE_BODY_PATTERN = /\bvalidateBody\(/;
const BODY_METHOD_PATTERN = /export (?:const|async function) (POST|PUT|PATCH|DELETE)\b/g;

export interface RouteInfo {
  /** Path relative to src/app/api, e.g. "admin/users/route.ts". */
  relPath: string;
  absPath: string;
  methods: string[];
  hasAuthGuard: boolean;
  hasRateLimit: boolean;
  hasValidateBody: boolean;
  /** First path segment(s) — used to group into families (admin/me/public/...). */
  family: 'admin' | 'me' | 'internal' | 'other';
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name === 'route.ts') out.push(full);
  }
  return out;
}

function familyOf(relPath: string): RouteInfo['family'] {
  if (relPath.startsWith('admin' + path.sep)) return 'admin';
  if (relPath.startsWith('me' + path.sep)) return 'me';
  if (relPath.startsWith('internal' + path.sep)) return 'internal';
  return 'other';
}

/** Build the full inventory for every route.ts under `apiRoot`
 *  (src/app/api). Pure/read-only — never writes anything. */
export function buildRouteInventory(apiRoot: string): RouteInfo[] {
  return walk(apiRoot).map((absPath) => {
    const text = fs.readFileSync(absPath, 'utf8');
    const relPath = path.relative(apiRoot, absPath);
    const methods = [...text.matchAll(BODY_METHOD_PATTERN)].map((m) => m[1]!);
    // GET/HEAD/OPTIONS-only routes never accept a body — matched separately
    // so `methods` also reports pure-GET routes for the inventory report.
    for (const m of ['GET', 'HEAD', 'OPTIONS'] as const) {
      if (new RegExp(`export (?:const|async function) ${m}\\b`).test(text)) methods.push(m);
    }
    return {
      relPath,
      absPath,
      methods,
      hasAuthGuard: AUTH_GUARD_PATTERN.test(text),
      hasRateLimit: RATE_LIMIT_PATTERN.test(text),
      hasValidateBody: VALIDATE_BODY_PATTERN.test(text),
      family: familyOf(relPath),
    };
  });
}
