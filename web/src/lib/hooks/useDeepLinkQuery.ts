'use client';
/**
 * Adopt a `?q=` deep link into a list screen's own local search state (W26).
 *
 * The admin command palette can now jump to a specific SKU / article / user,
 * but those three screens keep their search term in `useState`, not in the
 * URL — so a plain `router.push('/admin/catalog?q=slug')` would land on an
 * UNFILTERED list while the user believed they had searched. That is strictly
 * worse than returning no result at all, which is why this exists rather than
 * those entity types being dropped.
 *
 * Two details that a naive `useState(params.get('q'))` gets wrong:
 *
 * 1. Same-route navigation does NOT remount a client component, so a
 *    read-once-on-mount seed is stale for the second jump onward.
 * 2. The param is stripped again (`router.replace`, no history entry) right
 *    after it is adopted. Without that, jumping to the SAME query twice is a
 *    no-op — the URL never changes, so nothing re-fires — and the stale `?q=`
 *    would also fight the user's next keystroke on a Back navigation.
 *
 * The `if (!urlQ) return` guard is what keeps the strip from looping: the
 * replace re-runs this effect with an empty `urlQ`, which does nothing.
 *
 * Deliberately one-way (URL → state). These screens never write their search
 * box back to the URL; making them do so is a separate change.
 */
import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * @param apply receives the deep-linked term — set both the raw input and the
 *   committed/debounced term from it, so the box shows what was searched —
 *   plus a reader for the link's other params. A screen whose list is also
 *   behind a status tab (content) needs that second argument: landing on
 *   «پیش‌نویس» with a published article's slug typed in shows nothing, which
 *   is the same "you believe you searched" failure this hook exists to avoid.
 */
export function useDeepLinkQuery(apply: (q: string, param: (key: string) => string | null) => void): void {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const urlQ = params.get('q') ?? '';

  // Callers pass an inline arrow; a ref keeps it out of the dep array so the
  // effect fires on the URL changing and nothing else.
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    if (!urlQ) return;
    applyRef.current(urlQ, (key) => paramsRef.current.get(key));
    router.replace(pathname, { scroll: false });
  }, [urlQ, pathname, router]);
}
