/**
 * A stable, NON-NUMERIC catalog overview injected into the advisor's context so
 * it knows which product categories/sub-categories exist without spending a tool
 * round on trivial "what do you sell?" questions. Deliberately carries NO
 * prices/weights — those come only from tools (grounding invariant). Cached in
 * Redis (categories change rarely); falls back to '' if the DB/Redis are down.
 */
import { gradesByCategory, listCategories } from '@/lib/server/repos/catalogRepo';
import { getSubsMap } from '@/lib/server/catalog';
import { cacheDel, cacheGetJson, cacheSetJson, jitterTtl } from '@/lib/server/redis';

const CACHE_KEY = 'ai:domain-facts';
const TTL_SECONDS = 600;

export async function getDomainFacts(): Promise<string> {
  const cached = await cacheGetJson<string>(CACHE_KEY);
  if (cached) return cached;

  let facts = '';
  try {
    const cats = (await listCategories()).filter((c) => c.isActive);
    const [subsMap, grades] = await Promise.all([getSubsMap(), gradesByCategory()]);
    const parts = cats.map((c) => {
      const subs = (subsMap[c.slug] ?? []).map((s) => s.name);
      return subs.length ? `${c.name} (${subs.join('، ')})` : c.name;
    });
    if (parts.length > 0) {
      facts =
        'دستهٔ محصولات آهن‌تایم (فقط برای آگاهی از دامنه؛ برای هر قیمت، وزن یا زمان تحویل حتماً از ابزارها استفاده کن و هرگز عدد نساز): ' +
        parts.join('؛ ') +
        '.';
    }
    // The ONLY grade codes that exist here. Without this the model answered
    // «چه گریدی می‌خواهی؟ (مثلاً B400B500 یا B500B600)» — two codes that are
    // in no product, no article and no table on this site. The vocabulary
    // gets the same treatment the numbers already had: it comes from the
    // catalog, or it is not said.
    const gradeParts = Object.entries(grades)
      .filter(([, list]) => list.length > 0)
      .map(([cat, list]) => `${cat}: ${list.join('، ')}`);
    if (gradeParts.length > 0) {
      facts +=
        ' گریدهای واقعی و تنها گریدهای مجاز برای نام بردن — ' +
        gradeParts.join('؛ ') +
        '. هیچ کد گرید دیگری وجود ندارد؛ اگر گریدی در این فهرست نیست، نامش را نساز و نگو.';
    }
  } catch {
    facts = '';
  }
  if (facts) await cacheSetJson(CACHE_KEY, facts, jitterTtl(TTL_SECONDS));
  return facts;
}

/**
 * Drop the cached facts after a taxonomy write.
 *
 * The TTL alone was the only invalidation, so for up to ten minutes after an
 * admin added, renamed or retired a category/sub-category the advisor kept
 * being told the OLD catalog shape. That is worse here than ordinary cache
 * lag, because these facts are the advisor's grounding for what this business
 * sells: it would confidently tell a customer a live product line does not
 * exist, or offer one that was just retired, and — since the string is
 * injected as a system message — it has no way to notice the contradiction
 * with what its tools return. «هرگز عدد نساز» is enforced for numbers; the
 * domain shape had no equivalent guard.
 *
 * Best-effort by design (no-op without Redis, never throws): the taxonomy
 * write is already committed and must not be failed by a cache miss. Worst
 * case on failure is the pre-existing TTL behaviour.
 */
export async function invalidateDomainFacts(): Promise<void> {
  await cacheDel(CACHE_KEY);
}

/** Exposed for tests — the key both `getDomainFacts` and the invalidation use. */
export const DOMAIN_FACTS_CACHE_KEY = CACHE_KEY;
