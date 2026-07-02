import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { adminGetArticle, updateArticle } from '@/lib/server/repos/articlesRepo';

/** GET /api/admin/articles/{id} — full article for the editor. */
async function GETImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'content:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const article = await adminGetArticle(id);
  if (!article) return NextResponse.json({ error: 'not_found', message: 'مقاله یافت نشد.' }, { status: 404 });
  return NextResponse.json({ article }, { headers: { 'Cache-Control': 'no-store' } });
}

const patchPayload = z.object({
  slug: z.string().trim().min(1).max(120).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  excerpt: z.string().trim().max(500).nullable().optional(),
  bodyMd: z.string().max(100_000).optional(),
  coverUrl: z.string().url().nullable().optional(),
  status: z.enum(['draft', 'scheduled']).optional(), // publishing goes through /publish
  publishAt: z.string().datetime().nullable().optional(),
});

/** PATCH /api/admin/articles/{id} — edit draft/scheduled fields. */
async function PATCHImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'content:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const v = await validateBody(req, patchPayload);
  if (!v.ok) return v.response;
  const article = await updateArticle(id, {
    ...v.data,
    excerpt: v.data.excerpt === undefined ? undefined : v.data.excerpt,
    publishAt: v.data.publishAt === undefined ? undefined : v.data.publishAt ? new Date(v.data.publishAt) : null,
  });
  if (!article) return NextResponse.json({ error: 'not_found', message: 'مقاله یافت نشد.' }, { status: 404 });
  await audit(auth.session.id, 'content.update', { type: 'article', id }, null, { fields: Object.keys(v.data) });
  return NextResponse.json({ article });
}

export const GET = withApiErrorHandling(GETImpl);
export const PATCH = withApiErrorHandling(PATCHImpl);
