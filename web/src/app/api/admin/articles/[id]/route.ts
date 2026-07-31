import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { adminGetArticle, updateArticle, deleteDraftArticle } from '@/lib/server/repos/articlesRepo';
import { DuplicateArticleSlugError } from '@/lib/server/repos/articlesRepo';
import { safeRevalidatePath } from '@/lib/server/utils/revalidate';
import { slugSchema, uploadPathSchema } from '@/lib/validation/utils';

/**
 * Bust the public caches an article write can affect. /blog and /news declare
 * `revalidate = 600`, so without this an unpublished article stayed fully
 * readable and indexable at its public URL for another ten minutes while the
 * panel already showed it as a draft — the worst case being a factual
 * correction or a retraction of market news.
 */
function revalidateArticle(type: 'blog' | 'news', slug: string, oldSlug?: string): void {
  const base = type === 'news' ? '/news' : '/blog';
  safeRevalidatePath(base, 'layout');
  safeRevalidatePath(`${base}/${slug}`);
  if (oldSlug && oldSlug !== slug) safeRevalidatePath(`${base}/${oldSlug}`);
  // The sitemap is a route like any other; a publish/retract must reach Google.
  safeRevalidatePath('/sitemap.xml');
}

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
  slug: slugSchema(120).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  excerpt: z.string().trim().max(500).nullable().optional(),
  bodyMd: z.string().max(100_000).optional(),
  coverUrl: z.preprocess((v) => (v === '' ? null : v), uploadPathSchema.nullable().optional()),
  authorId: z.string().min(1).nullable().optional(),
  // Editor SEO overrides. Empty url fields → undefined so a blank input never
  // fails .url() (forms send '' for "unset").
  seo: z
    .object({
      title: z.string().trim().max(70).optional(),
      description: z.string().trim().max(200).optional(),
      canonical: z.preprocess(
        (v) => (v === '' ? undefined : v),
        z.string().regex(/^\//, 'نشانی متعارف باید یک مسیر داخلی باشد (با / شروع شود).').max(300).optional(),
      ),
      ogImage: z.preprocess((v) => (v === '' ? undefined : v), uploadPathSchema.optional()),
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
  // The real prior row, not null: the log could previously say only WHICH
  // fields changed, never what the title or body used to be — the one thing an
  // editorial trail exists for.
  const before = await adminGetArticle(id);
  if (!before) return NextResponse.json({ error: 'not_found', message: 'مقاله یافت نشد.' }, { status: 404 });
  let article;
  try {
    article = await updateArticle(id, {
      ...v.data,
      publishAt: v.data.publishAt === undefined ? undefined : v.data.publishAt ? new Date(v.data.publishAt) : null,
    });
  } catch (err) {
    if (err instanceof DuplicateArticleSlugError) {
      return NextResponse.json(
        { error: 'duplicate_slug', message: err.message, fields: { slug: err.message } },
        { status: 409 },
      );
    }
    throw err;
  }
  if (!article) return NextResponse.json({ error: 'not_found', message: 'مقاله یافت نشد.' }, { status: 404 });
  // Taking live content down is not an ordinary edit and must not read as one
  // in the activity log.
  const isUnpublish = v.data.status === 'draft' && before.status !== 'draft';
  await audit(
    auth.session.id,
    isUnpublish ? 'content.unpublish' : 'content.update',
    { type: 'article', id },
    before,
    article,
  );
  revalidateArticle(article.type, article.slug, before.slug);
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
  revalidateArticle(existing.type, existing.slug);
  return NextResponse.json({ ok: true });
}

export const GET = withApiErrorHandling(GETImpl);
export const PATCH = withApiErrorHandling(PATCHImpl);
export const DELETE = withApiErrorHandling(DELETEImpl);
