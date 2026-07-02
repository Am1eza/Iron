import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit } from '@/lib/server/utils/apiGuard';
import { adminListArticles, createArticle } from '@/lib/server/repos/articlesRepo';

/** GET /api/admin/articles?status=&type= — all articles for the content queue. */
export async function GET(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'content:write');
  if ('response' in auth) return auth.response;
  const p = req.nextUrl.searchParams;
  const status = p.get('status');
  const type = p.get('type');
  const result = await adminListArticles({
    status: status && ['draft', 'scheduled', 'published'].includes(status) ? (status as 'draft') : undefined,
    type: type === 'blog' || type === 'news' ? type : undefined,
    page: Math.max(1, Number(p.get('page') ?? 1) || 1),
  });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}

const createPayload = z.object({
  slug: z.string().trim().min(1).max(120),
  type: z.enum(['blog', 'news']),
  title: z.string().trim().min(1).max(200),
  excerpt: z.string().trim().max(500).optional(),
  bodyMd: z.string().max(100_000).optional(),
  source: z.enum(['ai', 'human']).optional(),
});

/** POST /api/admin/articles — create a draft. */
export async function POST(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'content:write');
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, createPayload);
  if (!v.ok) return v.response;
  const article = await createArticle({ ...v.data, authorId: auth.session.id });
  await audit(auth.session.id, 'content.create', { type: 'article', id: article.id }, null, { slug: article.slug });
  return NextResponse.json({ article }, { status: 201 });
}
