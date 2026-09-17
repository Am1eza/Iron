/**
 * Build-time replacement for `sharp` on the Cloudflare Workers target —
 * wired via `next.config.mjs`'s `turbopack.resolveAlias` (only active when
 * `BUILD_CLOUDFLARE=1`, set by the `cf:build`/`cf:preview`/`cf:deploy`
 * scripts). See `mediaProcessing.ts`'s module doc comment for why: sharp is
 * a native (libvips) addon with no Workers-compatible build, and Next's own
 * output-file-tracing pulls its platform `.node` binaries into the build
 * graph regardless of how the `import sharp from 'sharp'` call site is
 * written, hard-failing OpenNext's esbuild bundling step. Aliasing the
 * SPECIFIER itself, before Next's build ever resolves it, is the only point
 * in the pipeline that actually keeps sharp out of the trace.
 *
 * `reencodeUploadedImage` is unreachable on the Cloudflare deployment in
 * practice (it serves ahantime.com in mock mode — no DB, no auth, no
 * uploads; see GEO-ROUTING.md and `uploadStorage.ts`'s own Workers guard),
 * so this default export only needs to fail loudly if that assumption is
 * ever wrong, not behave like the real thing.
 */
export default function sharpWorkersStub(): never {
  throw new Error(
    'sharp is stubbed out on the Cloudflare Workers build (next.config.mjs turbopack.resolveAlias) — image re-encoding is not available on this deployment target.',
  );
}
