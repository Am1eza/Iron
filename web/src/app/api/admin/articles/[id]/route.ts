import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { adminGetArticle, updateArticle, deleteDraftArticle } from '@/lib/server/repos/articlesRepo';

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
  coverUrl: z.preprocess((v) => (v === '' ? null : v), z.string().url().nullable().optional()),
  authorId: z.string().min(1).nullable().optional(),
  // Editor SEO overrides. Empty url fields → undefined so a blank input never
  // fails .url() (forms send '' for "unset").
  seo: z
    .object({
      title: z.string().trim().max(70).optional(),
      description: z.string().trim().max(200).optional(),
      canonical: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
      ogImage: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
    })
    .nullable()
    .optional(),
  // Only 'draft' — moving DOWN in privilege (cancel/revert a scheduled
  // publish) is a safe content:write operation. Scheduling or publishing
  // is content:publish's job (POST .../publish, which also stamps
  // approvedBy): 'scheduled' used to be accepted here too, with nothing
  // but a comment enforcing the split — content:write alone could PATCH
  // straight to 'scheduled' with a past publishAt and the cron job would
  // publish it within ~60s with approvedBy left null, entirely bypassing
  // the approval gate this endpoint's docstring claims to guarantee.
  status: z.enum(['draft']).optional(),
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

/** DELETE /api/admin/articles/{id} — draft only (see deleteDraftArticle). A
 *  published/scheduled article must be unpublished first (PATCH status:'draft'). */
async function DELETEImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'content:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const existing = await adminGetArticle(id);
  if (!existing) return NextResponse.json({ error: 'not_found', message: 'مقاله یافت نشد.' }, { status: 404 });
  if (existing.status !== 'draft') {
    return NextResponse.json(
      { error: 'not_draft', message: 'فقط پیش‌نویس قابل حذف است — ابتدا انتشار را لغو کنید.' },
      { status: 400 },
    );
  }
  await deleteDraftArticle(id);
  await audit(auth.session.id, 'content.delete', { type: 'article', id }, existing, null);
  return NextResponse.json({ ok: true });
}

export const GET = withApiErrorHandling(GETImpl);
export const PATCH = withApiErrorHandling(PATCHImpl);
export const DELETE = withApiErrorHandling(DELETEImpl);
