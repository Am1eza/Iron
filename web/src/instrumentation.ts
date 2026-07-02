import type { Instrumentation } from 'next';

/**
 * Next.js instrumentation — runs once per server boot (nodejs runtime).
 * Validates required env vars (throwing crashes the boot — the intended
 * fail-fast behavior for a live-mode deploy missing DATABASE_URL/
 * SESSION_SECRET/SMSIR_* — see env.ts; this was previously dead code, never
 * called from anywhere, so a misconfigured live deploy would boot "clean"
 * and only fail confusingly later, e.g. signing a JWT with an undefined
 * secret), then starts the in-process background jobs when a database is
 * configured. Job list grows per phase (market poll, staleness, alerts,
 * publishing).
 */
// KNOWN ISSUE: `next dev` fails to boot entirely — every route 500s — with
// "Module not found: Can't resolve 'fs'" from pg-connection-string, even
// though the runtime guard below never actually reaches the pg import
// locally (no DATABASE_URL). Webpack's dev bundler still eagerly resolves
// this dynamic import's dependency graph at compile time, and
// instrumentation.ts has its own compilation unit that doesn't respect
// `serverExternalPackages`/webpack `externals` (both tried in
// next.config.mjs, neither worked) — an apparently unresolved Next.js 15.x
// limitation (vercel/next.js#73179). `next build` and the Cloudflare
// Workers build are both confirmed unaffected — this is dev-server-only,
// but it currently makes local development impossible. Needs a fix from
// whoever owns this job-scheduler work — e.g. moving the pg import fully
// out of the instrumentation entry's static module graph.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { getServerEnv } = await import('@/lib/validation/env');
  getServerEnv();
  if (!process.env.DATABASE_URL) return;
  const { startJobs } = await import('@/lib/server/jobs/scheduler');
  const { jobs } = await import('@/lib/server/jobs');
  startJobs(jobs);
}

/**
 * Next.js 15's built-in error-observability hook — fires for uncaught
 * errors in Server Components/Route Handlers/actions on top of whatever a
 * handler's own try/catch already reported, so a bug in a code path we
 * haven't wrapped yet still surfaces instead of vanishing.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { reportError } = await import('@/lib/errors/report');
  reportError(error, {
    scope: 'onRequestError',
    path: request.path,
    method: request.method,
    routeType: context.routeType,
  });
};
