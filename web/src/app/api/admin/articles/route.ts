import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { articleSlugSchema } from '@/lib/validation/utils';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { adminListArticles, createArticle } from '@/lib/server/repos/articlesRepo';
import { DuplicateArticleSlugError } from '@/lib/server/repos/articlesRepo';

/** GET /api/admin/articles?status=&type=&q=&page= — the content queue list. */
async function GETImpl(req: NextRequest) {
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
    q: p.get('q') ?? undefined,
    // Number('1e30') is a real finite number that overflows OFFSET; the repo
    // clamps it, this just parses.
    page: Number(p.get('page') ?? 1),
  });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}

const createPayload = z.object({
  slug: articleSlugSchema(120),
  type: z.enum(['blog', 'news']),
  title: z.string().trim().min(1).max(200),
  excerpt: z.string().trim().max(500).optional(),
  bodyMd: z.string().max(100_000).optional(),
});

/** POST /api/admin/articles — create a draft. */
async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'content:write');
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, createPayload);
  if (!v.ok) return v.response;
  let article;
  try {
    article = await createArticle({ ...v.data, authorId: auth.session.id });
  } catch (err) {
    // A collision used to escape as a raw 23505 -> generic 500, so the editor
    // retried the same slug forever with no idea what was wrong.
    if (err instanceof DuplicateArticleSlugError) {
      return NextResponse.json(
        { error: 'duplicate_slug', message: err.message, fields: { slug: err.message } },
        { status: 409 },
      );
    }
    throw err;
  }
  await audit(auth.session.id, 'content.create', { type: 'article', id: article.id }, null, { slug: article.slug });
  return NextResponse.json({ article }, { status: 201 });
}

export const GET = withApiErrorHandling(GETImpl);
export const POST = withApiErrorHandling(POSTImpl);
