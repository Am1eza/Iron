/**
 * Service worker — immutable static assets ONLY.
 *
 * Why this exists: the production incident behind PRs #193/#194 was a JS
 * chunk that failed to download on a weak connection (`ChunkLoadError`).
 * Nothing recovers that except re-fetching the chunk. Serving those chunks
 * from a local cache means a repeat visit — and, once a chunk has been seen
 * once, the reload after a failure — doesn't depend on the network at all.
 *
 * ================== READ BEFORE ADDING ANYTHING HERE ==================
 * ahantime publishes LIVE prices, stock and order state. A customer shown a
 * stale price is a real business problem, not a cosmetic one. This worker
 * must therefore never sit in front of anything that can change:
 *
 *   - no HTML navigations         - no /api/*          - no RSC payloads
 *   - no /admin, no panel host    - no /uploads/*      - no product images
 *
 * The fetch handler is an explicit ALLOWLIST with an early `return` for
 * everything else, deliberately not a denylist: a denylist silently starts
 * caching whatever gets added to the site next. If you need a new path
 * cached, add it to ALLOWLIST below and justify why it is immutable.
 * ======================================================================
 */

// Bump this string to force every client to drop its cache and re-fill.
// `activate` deletes every cache belonging to this origin whose name isn't
// this one, so a bump is a clean slate.
const CACHE = 'ahantime-static-v1';

/**
 * Hard cap on cached entries. This is the answer to "what stops the cache
 * growing forever across deploys?" — and it's why the cache name is NOT tied
 * to the build id.
 *
 * Tying it to a build id is the usual advice, but it buys nothing here: every
 * URL this worker caches is content-hashed (`_next/static/...-<hash>.js`), so
 * a URL from an old build is never requested again. It cannot be served
 * stale; it can only take up space. Bounding the entry count solves the
 * actual problem directly, without needing to thread a build id from
 * `next build` through the config, the layout and a query string — and
 * without the failure mode where that plumbing silently produces a constant
 * id and the cache stops rotating at all.
 *
 * Trimming is oldest-first: `cache.keys()` resolves in insertion order, so
 * the head of that list is the least recently ADDED entry. Not true LRU —
 * a long-lived chunk that is read often but written once still ages out —
 * which is fine, because ageing out costs one network fetch, not correctness.
 */
const MAX_ENTRIES = 240;

/**
 * Every path prefix this worker will touch, and how.
 *
 *  - `immutable: true`  → cache-first, never revalidated. ONLY for URLs whose
 *    filename contains a build/content hash, where a given URL's bytes can
 *    never change by definition.
 *  - `immutable: false` → stale-while-revalidate: serve the cached copy for
 *    speed, refresh it in the background so a replaced file lands on the next
 *    visit. Used for the hand-maintained static files under `public/`, which
 *    are NOT hashed (replacing `brand/icon-192.png` keeps the same URL).
 *
 * Deliberately absent, each for a reason:
 *   /products/*  product photos — replaced in place by admins, and already
 *                covered by next/image's optimizer cache + the Caddyfile.
 *   /uploads/*   admin-uploaded files; not ours to cache.
 *   /media/*     the hero video (megabytes) — would evict everything useful.
 */
const ALLOWLIST = [
  { prefix: '/_next/static/', immutable: true },
  { prefix: '/brand/', immutable: false },
  { prefix: '/fonts/', immutable: false },
  { prefix: '/assets/', immutable: false },
];

function matchRule(url) {
  return ALLOWLIST.find((rule) => url.pathname.startsWith(rule.prefix));
}

self.addEventListener('install', (event) => {
  // No precache list on purpose: the chunk names change every build and a
  // hardcoded list goes stale silently. This worker fills on demand instead.
  // skipWaiting so a newly deployed worker takes over without needing the
  // user to close every tab — safe here because the worker owns no state a
  // half-updated client could disagree about.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  await Promise.all(keys.slice(0, keys.length - MAX_ENTRIES).map((k) => cache.delete(k)));
}

/** Only a real, complete, same-origin 200 is worth storing. `response.ok`
 *  alone would happily cache a 206 partial or an opaque cross-origin body. */
function isCacheable(response) {
  return Boolean(response) && response.status === 200 && response.type === 'basic';
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Anything that isn't a plain same-origin GET is handed straight back to
  // the browser, untouched, before we even look at the path.
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Belt-and-braces against the two things that must never be cached even if
  // a future edit widens ALLOWLIST by mistake: a document navigation, and an
  // RSC payload request (which Next sends for the SAME url as a page, marked
  // only by a request header — so a path check alone would not catch it).
  if (req.mode === 'navigate' || req.destination === 'document') return;
  if (req.headers.get('RSC') || req.headers.get('Next-Router-Prefetch')) return;

  const rule = matchRule(url);
  if (!rule) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);

      if (cached && rule.immutable) return cached;

      const network = fetch(req)
        .then(async (response) => {
          if (isCacheable(response)) {
            await cache.put(req, response.clone());
            await trim(cache);
          }
          return response;
        })
        .catch((err) => {
          // A cached copy is a better answer than a network error — this is
          // the weak-connection case the whole file exists for.
          if (cached) return cached;
          throw err;
        });

      // stale-while-revalidate for the non-immutable entries: answer from
      // cache immediately, let the refresh above settle on its own.
      if (cached) {
        event.waitUntil(network.catch(() => {}));
        return cached;
      }
      return network;
    })(),
  );
});
