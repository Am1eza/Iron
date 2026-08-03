/**
 * Resolves whether the admin gate is enforced — the single decision behind both
 * the public-host `/admin` 404 rewrite and the admin JWT check in middleware.
 *
 * This is deliberately a pure function of the environment rather than an inline
 * `process.env.AUTH_ENFORCED === 'true'`, because that expression FAILED OPEN:
 * any deployment target that simply never set the variable got both protections
 * silently disabled. That happened in production — the secondary Cloudflare
 * Workers target (web/wrangler.jsonc) never set AUTH_ENFORCED and served the
 * real admin shell, unauthenticated, on its public *.workers.dev hostname.
 *
 * The rule now: enforced by default, and only an explicit 'false' outside
 * production can open it. A missing, empty, misspelled or unexpected value can
 * therefore only ever make the app MORE restrictive, never less.
 */
export function resolveAuthEnforced(env: {
  AUTH_ENFORCED?: string | undefined;
  NODE_ENV?: string | undefined;
}): boolean {
  const explicitlyDisabled = env.AUTH_ENFORCED === 'false';
  const isProduction = env.NODE_ENV === 'production';
  return !(explicitlyDisabled && !isProduction);
}
