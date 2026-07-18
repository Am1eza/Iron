# syntax=docker/dockerfile:1
# Production image for the آهن‌تایم (ahantime.com) Next.js app.
# Multi-stage: install deps → build (standalone) → tiny runner. Build context is web/.

# ---- 1. deps ----------------------------------------------------------------
FROM node:20-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- 2. build ---------------------------------------------------------------
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* are inlined into the client bundle at build time, so they must be
# present now (not just at runtime). Defaults match the app's own defaults.
ARG NEXT_PUBLIC_SITE_URL=https://ahantime.com
ARG NEXT_PUBLIC_API_MODE=mock
ARG NEXT_PUBLIC_DEPLOY_REGION=ir-docker
# Analytics ids — baked at build (they gate the tracker snippet + CSP origins).
# Empty by default → zero third-party code until the owner sets them + rebuilds.
ARG MATOMO_SITE_ID=
ARG GTM_ID=
ARG GA4_ID=
ARG GSC_VERIFICATION=
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_API_MODE=$NEXT_PUBLIC_API_MODE \
    NEXT_PUBLIC_DEPLOY_REGION=$NEXT_PUBLIC_DEPLOY_REGION \
    MATOMO_SITE_ID=$MATOMO_SITE_ID \
    GTM_ID=$GTM_ID \
    GA4_ID=$GA4_ID \
    GSC_VERIFICATION=$GSC_VERIFICATION \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    BUILD_STANDALONE=1
RUN pnpm build
# Bundle the DB/job scripts (migrate + seed + jobs) so the runner needs no
# dev deps. esbuild resolves the "@/" tsconfig alias; pg stays external
# (traced into the standalone node_modules via the app's own imports).
# esbuild is only a transitive dep (via tsx), so pnpm exposes no top-level
# `esbuild` bin and `npx esbuild` fails with "not found". Run it via pnpm dlx,
# which fetches esbuild from the npm registry (reachable even where Docker Hub is blocked).
RUN pnpm dlx esbuild scripts/migrate.mjs --bundle --platform=node --format=esm --outfile=scripts-dist/migrate.mjs --external:pg \
 && pnpm dlx esbuild scripts/seed.ts --bundle --platform=node --format=esm --outfile=scripts-dist/seed.mjs --external:pg \
 && pnpm dlx esbuild scripts/jobs.ts --bundle --platform=node --format=esm --outfile=scripts-dist/jobs.mjs --external:pg --banner:js='import{fileURLToPath as _f}from"url";import{dirname as _d}from"path";const __filename=_f(import.meta.url),__dirname=_d(__filename);'

# ---- 3. runner --------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
# Standalone bundle + the assets it does NOT include (static + public).
COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
# DB migrations + bundled migrate/seed scripts (see docker-entrypoint.sh).
COPY --from=build --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=build --chown=nextjs:nodejs /app/scripts-dist ./scripts
COPY --from=build --chown=nextjs:nodejs /app/docker-entrypoint.sh ./docker-entrypoint.sh
# Pre-create the uploads mount point owned by nextjs — Docker copies THIS
# directory's ownership into the named volume the first time it's mounted
# (compose's `uploads:/app/public/uploads`), so the non-root `nextjs` user
# can actually write into it (a freshly-created empty named volume defaults
# to root ownership otherwise).
RUN mkdir -p public/uploads && chown -R nextjs:nodejs public/uploads
USER nextjs
EXPOSE 3000
# Applies pending migrations (and optionally seeds) before starting server.js.
CMD ["sh", "docker-entrypoint.sh"]
