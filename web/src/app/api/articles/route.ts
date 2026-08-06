import { NextResponse, type NextRequest } from 'next/server';
import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { rateLimit } from '@/lib/server/utils/rateLimit';
import { listPublished } from '@/lib/server/repos/articlesRepo';

/** GET /api/articles?type=blog|news&page= — published articles. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  // Unauthenticated and DB-backed on every call — `Cache-Control: s-maxage`
  // buys nothing here because Caddy is a pure reverse proxy and does not
  // cache, and `?page=` varies the key anyway. Same reasoning (and the same
  // shape) as /api/search, whose docstring used to claim it was the only such
  // route. It is not; this is the second and /api/articles/[slug] the third.
  const limited = await rateLimit(req, 'articles', { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const type = req.nextUrl.searchParams.get('type') === 'news' ? 'news' : 'blog';
  // Clamp, don't just floor at 1: `Number('1e30')` is a real finite number,
  // and `(page - 1) * perPage` then overflows Postgres' bigint OFFSET into an
  // unhandled 500 — i.e. an anonymous client could generate GlitchTip noise on
  // demand. The admin sibling already clamps and says so; this one did not.
  const page = Math.min(
    10_000,
    Math.max(1, Math.floor(Number(req.nextUrl.searchParams.get('page') ?? 1)) || 1),
  );
  const result = await listPublished(type, page);
  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}

export const GET = withApiErrorHandling(GETImpl);
