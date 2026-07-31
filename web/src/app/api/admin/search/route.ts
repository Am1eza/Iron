import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { rateLimit } from '@/lib/server/utils/rateLimit';
import { adminSearchScopesFor, type AdminSearchHit } from '@/lib/auth/adminSearch';
import { ROLE_LABEL } from '@/lib/auth/roles';
import { adminListLeads } from '@/lib/server/repos/leadsRepo';
import { adminListSkus } from '@/lib/server/repos/catalogAdminRepo';
import { adminListArticles } from '@/lib/server/repos/articlesRepo';
import { listUsers } from '@/lib/auth/store';
import { normalizeDigits, toPersianDigits } from '@/lib/utils/format';
import { routes } from '@/lib/routes';

/** Shortest query worth a four-way fan-out; below this the palette is nav-only. */
const MIN_Q = 2;
const MAX_PER_TYPE = 5;

const ARTICLE_STATUS_LABEL: Record<string, string> = {
  draft: 'پیش‌نویس',
  scheduled: 'زمان‌بندی‌شده',
  published: 'منتشرشده',
};

/**
 * GET /api/admin/search?q=&limit= — the command palette's entity search.
 *
 * `admin:access` is the FLOOR, not the gate: every staff role may open the
 * palette, so gating the whole route at (say) `leads:read` would lock a
 * سردبیر محتوا out of searching its own articles. The real authorization is
 * PER ENTITY TYPE, decided by `adminSearchScopesFor(role)` — the fan-out
 * below is built from that list, so a denied type is never queried and
 * contributes no rows, no group and no count. An empty «سرنخ‌ها (۰)» group
 * would itself be the leak: it confirms the entity exists and that the
 * viewer's query did or didn't match it.
 *
 * Rate-limited because this fires per keystroke (debounced client-side) and
 * each call is up to four trigram/ILIKE queries.
 */
async function GETImpl(req: NextRequest) {
  const limited = await rateLimit(req, 'admin-search', { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'admin:access');
  if ('response' in auth) return auth.response;

  const p = req.nextUrl.searchParams;
  // Slice BEFORE use (same precedent as catalogAdminRepo.adminListSkus): the
  // ILIKE terms are built from this string and a megabyte-long `q` is a free
  // sequential scan otherwise.
  const q = (p.get('q') ?? '').trim().slice(0, 100);
  const rawLimit = Number(p.get('limit'));
  const perType = Number.isFinite(rawLimit)
    ? Math.min(MAX_PER_TYPE, Math.max(1, Math.floor(rawLimit)))
    : MAX_PER_TYPE;

  const noStore = { 'Cache-Control': 'no-store' };
  if (q.length < MIN_Q) {
    return NextResponse.json({ results: [] as AdminSearchHit[] }, { headers: noStore });
  }

  const scopes = adminSearchScopesFor(auth.session.role);
  // Mobile numbers are stored Latin; an admin on a Persian keyboard types
  // «۰۹۱۲…». Names/slugs pass through untouched.
  const qDigits = normalizeDigits(q);

  const tasks: Array<Promise<AdminSearchHit[]>> = [];

  if (scopes.includes('lead')) {
    tasks.push(
      adminListLeads({ q: qDigits, perPage: perType }).then(({ leads }) =>
        leads.map((l) => ({
          kind: 'lead' as const,
          href: `${routes.admin.leads()}/${l.id}`,
          label: l.contactName?.trim() || toPersianDigits(l.contactMobile),
          sublabel: `${l.ref} · ${toPersianDigits(l.contactMobile)}`,
        })),
      ),
    );
  }

  if (scopes.includes('sku')) {
    tasks.push(
      // `adminListSkus` already matches slug/name/size/factory/grade/standard
      // across both digit spellings, so it gets the RAW q, not the normalized
      // one — normalizing here would defeat its Persian-digit branch.
      //
      // Active-only (the repo default) on purpose: the result navigates to
      // /admin/catalog?q=…, whose own list also defaults to active — offering
      // a retired SKU here would land the admin on an empty table.
      adminListSkus({ q, perPage: perType }).then(({ rows }) =>
        rows.map(({ sku }) => ({
          kind: 'sku' as const,
          href: `${routes.admin.catalog()}?q=${encodeURIComponent(sku.slug)}`,
          label: sku.name,
          sublabel: [sku.size, sku.factory].filter(Boolean).join(' · ') || sku.slug,
        })),
      ),
    );
  }

  if (scopes.includes('article')) {
    tasks.push(
      adminListArticles({ q, page: 1, perPage: perType }).then(({ articles }) =>
        articles.map((a) => ({
          kind: 'article' as const,
          // `status` rides along because the content queue is a TAB per
          // status with no "all" tab — a published article deep-linked
          // without it lands on «پیش‌نویس» and shows nothing.
          href: `${routes.admin.content()}?q=${encodeURIComponent(a.slug)}&status=${encodeURIComponent(a.status)}`,
          label: a.title,
          sublabel: ARTICLE_STATUS_LABEL[a.status] ?? a.status,
        })),
      ),
    );
  }

  if (scopes.includes('user')) {
    tasks.push(
      // `listUsers` already ILIKEs mobile + name — no new SQL needed.
      listUsers({ q: qDigits, page: 1, perPage: perType }).then(({ users }) =>
        users.map((u) => ({
          kind: 'user' as const,
          href: `${routes.admin.users()}?q=${encodeURIComponent(u.mobile)}`,
          label: u.name?.trim() || toPersianDigits(u.mobile),
          sublabel: `${ROLE_LABEL[u.role] ?? u.role} · ${toPersianDigits(u.mobile)}`,
        })),
      ),
    );
  }

  const groups = await Promise.all(tasks);
  return NextResponse.json({ results: groups.flat() }, { headers: noStore });
}

export const GET = withApiErrorHandling(GETImpl);
