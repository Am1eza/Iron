import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { assigneeDesk, type LeadRow } from '@/lib/server/repos/leadsRepo';

/** Light lead shape for the personal desk (no items/notes needed here). */
function toDesk(r: LeadRow) {
  return {
    id: r.id,
    ref: r.ref,
    contactName: r.contactName ?? undefined,
    contactMobile: r.contactMobile,
    status: r.status,
    source: r.source,
    createdAt: r.createdAt.toISOString(),
    callbackAt: r.callbackAt ? r.callbackAt.toISOString() : undefined,
  };
}

/** GET /api/admin/my/desk — the current staff user's own assigned leads,
 *  callbacks and stats (میز کار من). Strictly scoped to session.id. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:read');
  if ('response' in auth) return auth.response;
  const desk = await assigneeDesk(auth.session.id);
  return NextResponse.json(
    {
      stats: desk.stats,
      active: desk.active.map(toDesk),
      callbacks: desk.callbacks.map(toDesk),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export const GET = withApiErrorHandling(GETImpl);
