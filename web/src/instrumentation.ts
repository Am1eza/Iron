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
