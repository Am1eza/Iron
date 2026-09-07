import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { listAllSubCategories, listCategories } from '@/lib/server/repos/catalogRepo';
import { jsonWithEtag } from '@/lib/server/utils/httpCache';

/** GET /api/categories — active categories, ordered (client caches 5 min). */
async function GETImpl(req: Request) {
  const guard = requireDb();
  if (guard) return guard;
  const [categories, subs] = await Promise.all([listCategories(), listAllSubCategories()]);
  // Same treatment as the price tables below it: a retired category must not
  // keep being served for a further 600s after the taxonomy write has already
  // purged every page that renders it.
  return jsonWithEtag(req, { categories, subs }, 300);
}

export const GET = withApiErrorHandling(GETImpl);
