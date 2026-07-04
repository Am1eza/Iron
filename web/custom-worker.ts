/**
 * Custom Worker entrypoint — wraps the OpenNext-generated fetch handler and
 * adds a `scheduled()` handler for the Cron Triggers configured in
 * `wrangler.jsonc` (`triggers.crons`). This is the documented OpenNext
 * pattern for adding non-fetch handlers:
 * https://opennext.js.org/cloudflare/howtos/custom-worker
 *
 * `.open-next/worker.js` only exists after `pnpm cf:build` runs — that's
 * fine, wrangler bundles this file (and its import) together at deploy
 * time, same as it would bundle `.open-next/worker.js` directly.
 */
// @ts-expect-error — generated build artifact, no types until `pnpm cf:build` runs.
import { default as handler } from './.open-next/worker.js';
import { runScheduledJobs } from './src/lib/server/jobs/cronRunner';
import { reportError } from './src/lib/errors/report';

export default {
  fetch: handler.fetch,
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      runScheduledJobs(event.cron, env as unknown as Record<string, unknown>).catch((err) => {
        reportError(err, { scope: 'cron', cron: event.cron });
      }),
    );
  },
} satisfies ExportedHandler<CloudflareEnv>;
