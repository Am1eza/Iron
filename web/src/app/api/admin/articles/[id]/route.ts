import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { adminGetArticle, updateArticle, deleteDraftArticle } from '@/lib/server/repos/articlesRepo';
import { DuplicateArticleSlugError } from '@/lib/server/repos/articlesRepo';
import {
  safeRevalidatePath,
  revalidateArticleSection,
  revalidateArticleUrl,
} from '@/lib/server/utils/revalidate';
import {
  articleSeoSchema,
  articleSlugSchema,
  articleTagsSchema,
  articleCategoryIdsSchema,
  articleNewsTopicIdsSchema,
  articleFaqSchema,
  uploadPathSchema,
} from '@/lib/validation/utils';
import { richDocSchema } from '@/lib/content/richDoc';
import { createRedirect, RedirectLoopError } from '@/lib/server/repos/redirectsRepo';
import { reportError } from '@/lib/errors/report';
import { routes } from '@/lib/routes';

function articlePath(type: 'blog' | 'news', slug: string): string {
  return type === 'news' ? routes.news(slug) : routes.blog(slug);
}

/**
 * Bust the public caches an article write can affect. /blog and /news declare
 * `revalidate = 600`, so without this an unpublished article stayed fully
 * readable and indexable at its public URL for another ten minutes while the
 * panel already showed it as a draft — the worst case being a factual
 * correction or a retraction of market news.
 *
 * Takes the PREVIOUS {type, slug} too, not just an old slug string: moving an
 * article from blog to news moves its public URL under a different base
 * entirely (`/blog/x` → `/news/x`), and revalidating the new base against the
 * old slug (what a slug-only signature would do) purges the wrong page.
 */
function revalidateArticle(next: { type: 'blog' | 'news'; slug: string }, prev?: { type: 'blog' | 'news'; slug: string }): void {
  revalidateArticleSection(next.type);
  revalidateArticleUrl(next.type, next.slug);
  if (prev && (prev.type !== next.type || prev.slug !== next.slug)) {
    revalidateArticleSection(prev.type);
    revalidateArticleUrl(prev.type, prev.slug);
  }
  // The sitemap is a route like any other; a publish/retract must reach Google.
  safeRevalidatePath('/sitemap.xml');
}

/**
 * Preserve the old URL when a slug or type change moves it. Best-effort: the
 * article write is already committed, and a failed redirect must never turn a
 * successful save into an error the editor has to act on.
 */
async function redirectArticleUrl(from: string, to: string): Promise<void> {
  if (from === to) return;
  try {
    await createRedirect({ fromPath: from, toPath: to, permanent: true });
  } catch (err) {
    if (err instanceof RedirectLoopError) return;
    reportError(err, { stage: 'articles.redirectArticleUrl', from, to });
  }
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
  slug: articleSlugSchema(120).optional(),
  // A misfiled post used to need delete+recreate to move between blog and
  // news — and DELETE refuses anything already published, so once live it
  // was permanently stuck under the wrong section.
  type: z.enum(['blog', 'news']).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  excerpt: z.string().trim().max(500).nullable().optional(),
  // The structured body (US-12.4). `bodyMd` stays accepted for a caller that
  // has only markdown, but the repo DERIVES it from `bodyJson` whenever this
  // field is present, so a client cannot send a body and a mismatched search
  // projection for it. Every node type/attribute outside `richDocSchema`'s
  // whitelist is a 400 here, not a silent pass-through to the renderer.
  bodyMd: z.string().max(100_000).optional(),
  bodyJson: richDocSchema.nullable().optional(),
  coverUrl: z.preprocess((v) => (v === '' ? null : v), uploadPathSchema.nullable().optional()),
  authorId: z.string().min(1).nullable().optional(),
  tags: articleTagsSchema,
  relatedCategoryIds: articleCategoryIdsSchema,
  relatedNewsTopicIds: articleNewsTopicIdsSchema,
  faq: articleFaqSchema,
  // Editor SEO overrides, including the focus keyword the on-page checklist
  // keys off. Shared with the create route. canonical is validated by
  // internalPathSchema (parser-based, not a startswith-slash regex) inside
  // articleSeoSchema itself — see lib/validation/utils.ts.
  seo: articleSeoSchema,
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
  revalidateArticle({ type: article.type, slug: article.slug }, { type: before.type, slug: before.slug });
  // A slug or type change moves the public URL. Only articles that were ever
  // live need a redirect — a draft never had one to preserve.
  const urlMoved = (v.data.slug && v.data.slug !== before.slug) || (v.data.type && v.data.type !== before.type);
  if (urlMoved && before.status !== 'draft') {
    await redirectArticleUrl(articlePath(before.type, before.slug), articlePath(article.type, article.slug));
  }
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
  revalidateArticle({ type: existing.type, slug: existing.slug });
  return NextResponse.json({ ok: true });
}

export const GET = withApiErrorHandling(GETImpl);
export const PATCH = withApiErrorHandling(PATCHImpl);
export const DELETE = withApiErrorHandling(DELETEImpl);
