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
 *
 * Deliberately untyped against `ExportedHandler`/`CloudflareEnv` (the
 * ambient ones `wrangler types` generates into `cloudflare-env.d.ts`):
 * that file is gitignored and only exists after running `pnpm cf-typegen`
 * locally — neither this repo's CI nor Cloudflare's own Workers Builds
 * pipeline generates it first, so referencing those names broke `tsc`/
 * `next build`'s type-check in both with "Cannot find name 'ExportedHandler'"
 * the first time this file was added. Minimal local types instead, so this
 * compiles the same with or without that generated file present.
 */
type ScheduledCron = { cron: string };
type WaitUntilCtx = { waitUntil(promise: Promise<unknown>): void };

// @ts-expect-error — generated build artifact, no types until `pnpm cf:build` runs.
import { default as handler } from './.open-next/worker.js';
import { runScheduledJobs } from './src/lib/server/jobs/cronRunner';
import { reportError } from './src/lib/errors/report';

export default {
  fetch: handler.fetch,
  async scheduled(event: ScheduledCron, env: Record<string, unknown>, ctx: WaitUntilCtx) {
    ctx.waitUntil(
      runScheduledJobs(event.cron, env).catch((err) => {
        reportError(err, { scope: 'cron', cron: event.cron });
      }),
    );
  },
};
