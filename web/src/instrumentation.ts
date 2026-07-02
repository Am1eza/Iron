import type { Instrumentation } from 'next';

/**
 * Next.js instrumentation — runs once per server boot (nodejs runtime).
 * Starts the in-process background jobs when a database is configured.
 * Job list grows per phase (market poll, staleness, alerts, publishing).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
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
