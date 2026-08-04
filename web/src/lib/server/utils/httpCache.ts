/**
 * Conditional-GET (ETag / 304) helper for the PUBLIC price API.
 *
 * Why this exists rather than a `revalidateTag` call:
 *
 * The `/api/categories/*` handlers sent `s-maxage=120, stale-while-revalidate=300`
 * while admin price saves invalidated only the ISR pages. Nothing invalidated
 * the API, so a corrected price could be served for up to 420s AFTER the HTML
 * pages had already updated — the site showing one number and its own public
 * API another, for the one product decision that is explicitly locked
 * («قیمت‌ها ۱۰۰٪ دستی»).
 *
 * The ISR fix is not transplantable here. `revalidatePath`/`revalidateTag`
 * purge caches Next.js OWNS; these handlers are dynamic route handlers whose
 * only caching is the `Cache-Control` header, honoured by clients and proxies
 * this origin cannot reach into. There is no purge API for a cache you do not
 * control — so the correct fix is the HTTP-native one: give the response a
 * VALIDATOR so any cache can cheaply ask "is this still current?" and be told
 * the truth, and stop advertising a stale-serving window that nothing can cut
 * short.
 *
 * `stale-while-revalidate` is exactly that un-cuttable window: 300s during
 * which a cache is explicitly licensed to serve a price it already knows may
 * be wrong. Dropping it caps worst-case staleness at the 120s `s-maxage`,
 * which is the same order as the ISR pages' own 300s window instead of
 * exceeding it — the HTML and the API can no longer disagree unboundedly. The
 * cost of the removal is paid back by the ETag: a revalidation on unchanged
 * data is a 304 with no body and no DB work beyond the query that produced it.
 */

/**
 * 64-bit FNV-1a over the payload, as 16 hex chars.
 *
 * Deliberately NOT `node:crypto` — this app has a second deployment target
 * (Cloudflare Workers) where the Node crypto module is not a given, and an
 * ETag needs collision resistance in practice, not cryptographic strength: a
 * collision here would have to be between two different price tables for the
 * SAME category, and 64 bits makes that vanishingly unlikely.
 *
 * Implemented in two 32-bit halves because JS bitwise ops truncate to 32 bits
 * and `BigInt` in a per-request hot path is not worth it.
 */
export function weakEtagOf(payload: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < payload.length; i++) {
    const c = payload.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 16);
}

/** True when the client already holds this exact representation. */
function matches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  // A client may send a list, and may or may not keep the W/ prefix.
  return ifNoneMatch
    .split(',')
    .map((t) => t.trim().replace(/^W\//, ''))
    .some((t) => t === etag || t === '*');
}

/**
 * JSON response with a weak ETag and conditional-GET handling.
 *
 * `sMaxAge` is the ONLY staleness window — no `stale-while-revalidate`, on
 * purpose (see the file header). Weak validators are correct here: the
 * comparison is semantic equivalence of the JSON payload, not byte equality of
 * the transfer.
 */
export function jsonWithEtag(req: Request, body: unknown, sMaxAge: number): Response {
  const json = JSON.stringify(body);
  const etag = `"${weakEtagOf(json)}"`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': `public, s-maxage=${sMaxAge}`,
    ETag: `W/${etag}`,
    // Without this a shared cache could serve one client's compressed variant
    // to another; harmless here, but the ETag makes the variant explicit.
    Vary: 'Accept-Encoding',
  };
  if (matches(req.headers.get('if-none-match'), etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(json, { status: 200, headers });
}
