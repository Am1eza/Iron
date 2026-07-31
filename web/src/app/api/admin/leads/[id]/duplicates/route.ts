import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { findDuplicateLeads, DUPLICATE_WINDOW_DAYS } from '@/lib/server/repos/leadsRepo';

/**
 * GET /api/admin/leads/{id}/duplicates — other live leads sharing this lead's
 * normalised mobile within the recency window.
 *
 * `leads:read`: SEEING that a number appears twice is ordinary lead work and
 * every rep who can open the lead should get the warning. Acting on it (the
 * merge) is a different question and a different permission — see ./merge.
 */
async function GETImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:read');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;

  const result = await findDuplicateLeads(id, DUPLICATE_WINDOW_DAYS);
  return NextResponse.json(
    {
      windowDays: result.windowDays,
      subjectHasActiveProforma: result.subjectHasActiveProforma,
      candidates: result.candidates.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export const GET = withApiErrorHandling(GETImpl);
