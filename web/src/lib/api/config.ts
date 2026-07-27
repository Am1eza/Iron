/**
 * Client-safe API configuration.
 *
 * Deliberately reads `process.env.NEXT_PUBLIC_*` directly instead of importing
 * the zod-validated `publicEnv`: this module is on every browser bundle's
 * critical path (http.ts → every api resource), and that one import dragged
 * zod — 56 kB raw / 12.7 kB gz — into the JavaScript every visitor downloads
 * and parses, on every page, purely to re-validate three literals that Next
 * already inlines at build time. The defaults below MUST stay identical to
 * `publicSchema` in lib/validation/env.ts, which still validates them on the
 * server (and is where a genuinely bad value should fail the boot).
 *
 * Docker Compose passes unset optional vars as empty strings (`${VAR:-}`), so
 * '' is normalized to "absent" the same way env.ts does for server vars.
 */
const val = (v: string | undefined) => (v === undefined || v === '' ? undefined : v);

/** 'mock' | 'live' — anything unrecognized falls back to the safe 'mock'. */
export const API_MODE: 'mock' | 'live' = val(process.env.NEXT_PUBLIC_API_MODE) === 'live' ? 'live' : 'mock';

const SITE_URL = val(process.env.NEXT_PUBLIC_SITE_URL) ?? 'https://ahantime.com';

/** Absolute on the server (fetch needs it), relative in the browser. */
export const BASE_URL = typeof window === 'undefined' ? SITE_URL : '';

export const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_GET_RETRIES = 2;
