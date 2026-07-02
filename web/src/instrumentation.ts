import type { Instrumentation } from 'next';

/**
 * Next.js instrumentation — runs once per server boot (nodejs runtime).
 * Validates required env vars (throwing crashes the boot — the intended
 * fail-fast behavior for a live-mode deploy missing DATABASE_URL/
 * SESSION_SECRET/SMSIR_* — see env.ts).
 *
 * Deliberately does NOT import anything from `src/lib/server/jobs/**` or
 * `src/lib/server/db/**` here (not even behind a runtime-guarded dynamic
 * `import()`) — `pg`'s dependency tree pulls in Node built-ins
 * (fs/path/stream) that Next.js 15's webpack dev-mode bundler cannot
 * resolve for THIS SPECIFIC compilation unit, crashing `next dev` (every
 * route 500s) even though the runtime guard never reaches the import
 * locally. `serverExternalPackages` does not fix it (confirmed by testing:
 * externalizing 'pg' just relocates the error to 'pg-connection-string',
 * externalizing that too relocates it again to 'pgpass', and so on down
 * the tree) — an unresolved Next.js 15.x limitation specific to the
 * instrumentation entry (vercel/next.js#73179). `next build`/the
 * Cloudflare Workers build are both confirmed unaffected. The background
 * job scheduler now runs as its own process instead (scripts/jobs.ts,
 * started by docker-entrypoint.sh) — see that file for the full rationale.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { getServerEnv } = await import('@/lib/validation/env');
  getServerEnv();
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
