import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// OpenNext Cloudflare adapter config. Caching defaults to in-Worker; for
// incremental cache / ISR back it with R2 or KV — see
// https://opennext.js.org/cloudflare/caching
const config = defineCloudflareConfig();

const openNextConfig = {
  ...config,
  // `buildCommand` is a base OpenNext option (see @opennextjs/aws's
  // OpenNextConfig), not exposed through defineCloudflareConfig's own
  // (Cloudflare-only) input type — set by extending its returned object
  // instead of passing it in above, which is a type error.
  //
  // This is what actually invokes `next build` (see @opennextjs/aws's
  // buildNextjsApp), and it needs BUILD_CLOUDFLARE=1 set so
  // next.config.mjs's turbopack alias keeps `sharp`'s native bindings out of
  // this build (see mediaProcessing.ts / sharp.workers-stub.ts).
  // package.json's cf:build/cf:preview/cf:deploy scripts also set this same
  // var one layer up, but that only takes effect if Cloudflare's dashboard
  // "Build command" literally runs `pnpm run cf:build` —
  // DEPLOY-CLOUDFLARE.md documents leaving Cloudflare's own Next.js
  // auto-detection as an accepted alternative, which would invoke the
  // OpenNext CLI directly and skip that script entirely. Setting it HERE,
  // inside the config the OpenNext CLI itself always loads before building,
  // does not depend on which command Cloudflare was configured with — only
  // on it ultimately using this adapter's build pipeline at all, which the
  // very existence of a "Workers Builds: ahantime" check confirms it does.
  // (Confirmed live: the dashboard's actual configured "Build command" is
  // `npx opennextjs-cloudflare build`, NOT `pnpm run cf:build` — so this is
  // the ONLY place a Cloudflare-build-only step reliably runs.)
  //
  // The `cf-proxy-swap` wrapper swaps `src/proxy.ts` (Node-runtime,
  // Postgres-backed — the Docker/self-hosted target) for
  // `src/proxy.workers.ts` (Edge-runtime, DB-free) for the duration of this
  // `next build` only, then restores the original tree. Next.js 16's
  // `proxy` convention is hardcoded to the Node.js runtime, which OpenNext's
  // Cloudflare adapter does not support ("Node Middleware... not yet
  // supported" — https://opennext.js.org/cloudflare#supported-nextjs-features);
  // every request to this Worker 500'd until this swap existed. See
  // proxy.workers.ts's own doc comment for the full why.
  buildCommand: "node scripts/cf-proxy-swap.mjs -- env BUILD_CLOUDFLARE=1 pnpm build",
};

export default openNextConfig;
