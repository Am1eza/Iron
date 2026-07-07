/**
 * A stable, NON-NUMERIC catalog overview injected into the advisor's context so
 * it knows which product categories/sub-categories exist without spending a tool
 * round on trivial "what do you sell?" questions. Deliberately carries NO
 * prices/weights — those come only from tools (grounding invariant). Cached in
 * Redis (categories change rarely); falls back to '' if the DB/Redis are down.
 */
import { listCategories } from '@/lib/server/repos/catalogRepo';
import { CATEGORY_SUBS } from '@/lib/data/nav';
import { cacheGetJson, cacheSetJson } from '@/lib/server/redis';

const CACHE_KEY = 'ai:domain-facts';
const TTL_SECONDS = 600;

export async function getDomainFacts(): Promise<string> {
  const cached = await cacheGetJson<string>(CACHE_KEY);
  if (cached) return cached;

  let facts = '';
  try {
    const cats = (await listCategories()).filter((c) => c.isActive);
    const parts = cats.map((c) => {
      const subs = (CATEGORY_SUBS[c.slug] ?? []).map((s) => s.name);
      return subs.length ? `${c.name} (${subs.join('، ')})` : c.name;
    });
    if (parts.length > 0) {
      facts =
        'دستهٔ محصولات آهن‌تایم (فقط برای آگاهی از دامنه؛ برای هر قیمت، وزن یا زمان تحویل حتماً از ابزارها استفاده کن و هرگز عدد نساز): ' +
        parts.join('؛ ') +
        '.';
    }
  } catch {
    facts = '';
  }
  if (facts) await cacheSetJson(CACHE_KEY, facts, TTL_SECONDS);
  return facts;
}
