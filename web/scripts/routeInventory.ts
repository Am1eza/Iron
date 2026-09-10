/**
 * H-171 — prints the machine-checked route inventory (auth/rate-limit/schema
 * coverage per route.ts under src/app/api). This is the re-runnable artifact
 * the audit asked for: a one-time manual review of 154 routes is now a
 * command anyone (or CI) can run again after any change.
 *
 * The invariants this inventory FOUND with zero exceptions — every
 * /api/admin/** and /api/me/** route calls an auth guard — are hard-enforced
 * as a regression test in routeInventory.test.ts, not just reported here.
 * Rate-limit coverage is reported only, not enforced: H-185 in
 * docs/audit-api-input-H.md documents that 91/94 admin routes deliberately
 * have no route-specific rate limit yet (a separate, larger structural fix,
 * out of this item's scope) — a hard gate here would just fail CI on an
 * already-known, differently-tracked gap.
 *
 * Usage: `pnpm exec tsx scripts/routeInventory.ts`
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRouteInventory } from './lib/routeInventory';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.join(__dirname, '..', 'src', 'app', 'api');
const routes = buildRouteInventory(apiRoot);

function pct(n: number, total: number): string {
  return total === 0 ? '0%' : `${Math.round((n / total) * 100)}%`;
}

console.log(`Route inventory — ${routes.length} route.ts files under src/app/api\n`);

for (const family of ['admin', 'me', 'internal', 'other'] as const) {
  const rows = routes.filter((r) => r.family === family);
  if (rows.length === 0) continue;
  const authed = rows.filter((r) => r.hasAuthGuard).length;
  const rateLimited = rows.filter((r) => r.hasRateLimit).length;
  const withBody = rows.filter((r) => r.methods.some((m) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(m)));
  const validated = withBody.filter((r) => r.hasValidateBody).length;
  console.log(
    `${family.padEnd(9)} ${String(rows.length).padStart(3)} routes | ` +
      `auth ${authed}/${rows.length} (${pct(authed, rows.length)}) | ` +
      `rate-limit ${rateLimited}/${rows.length} (${pct(rateLimited, rows.length)}) | ` +
      `validateBody ${validated}/${withBody.length} of body-accepting routes (${pct(validated, withBody.length)})`,
  );
}

const missingAuth = routes.filter((r) => (r.family === 'admin' || r.family === 'me') && !r.hasAuthGuard);
if (missingAuth.length > 0) {
  console.log(`\n⚠ ${missingAuth.length} admin/me route(s) with NO auth guard call found:`);
  for (const r of missingAuth) console.log(`  ${r.relPath}`);
} else {
  console.log('\n✓ Every admin/me route calls requireApiPermission/requireApiUser/getSessionVerified.');
}
