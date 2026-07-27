import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { assigneeDesk, type DeskLeadRow, type DeskList } from '@/lib/server/repos/leadsRepo';

/** Light lead shape for the personal desk (no items/notes needed here).
 *  Both timestamps go out as full ISO strings, NOT dates: a 09:00 and an
 *  18:00 callback are different appointments and the desk must be able to
 *  show which is which. */
function toDesk(r: DeskLeadRow) {
  return {
    id: r.id,
    ref: r.ref,
    contactName: r.contactName ?? undefined,
    contactMobile: r.contactMobile,
    status: r.status,
    source: r.source,
    createdAt: r.createdAt.toISOString(),
    callbackAt: r.callbackAt ? r.callbackAt.toISOString() : undefined,
    isOverdue: r.isOverdue,
  };
}

/** Every list ships its true total and its cap alongside the capped rows —
 *  see the DeskList contract in leadsRepo. */
function toList(l: DeskList) {
  return { rows: l.rows.map(toDesk), total: l.total, hasMore: l.hasMore, limit: l.limit };
}

/** GET /api/admin/my/desk — the current staff user's own assigned leads,
 *  callbacks and stats (میز کار من). Strictly scoped to session.id.
 *
 *  Response:
 *    { stats:    { assigned, active, won, lost, conversionPct },
 *      active:   { rows[], total, hasMore, limit },
 *      callbacks:{ overdue:  { rows[], total, hasMore, limit },
 *                  upcoming: { rows[], total, hasMore, limit } } }
 *
 *  `overdue` and `upcoming` are split server-side against a single clock and
 *  capped independently, so a backlog of missed calls can no longer crowd the
 *  scheduled ones out of the response. Each row also carries `isOverdue`.
 */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:read');
  if ('response' in auth) return auth.response;
  const desk = await assigneeDesk(auth.session.id);
  return NextResponse.json(
    {
      stats: desk.stats,
      active: toList(desk.active),
      callbacks: {
        overdue: toList(desk.callbacks.overdue),
        upcoming: toList(desk.callbacks.upcoming),
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export const GET = withApiErrorHandling(GETImpl);
