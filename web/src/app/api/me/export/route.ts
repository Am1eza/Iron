import { NextResponse, type NextRequest } from 'next/server';
import { requireApiUser, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { userById } from '@/lib/auth/store';
import { publicUser } from '@/lib/auth/publicUser';
import { favoritesForUser } from '@/lib/server/repos/favoritesRepo';
import { alertsForUser } from '@/lib/server/repos/alertsRepo';
import { clubStatus } from '@/lib/server/repos/clubRepo';
import { leadsForUser, leadItemsOf, proformasOfLead, toLineItem } from '@/lib/server/repos/leadsRepo';
import { ordersForUser, warehouseForUser } from '@/lib/server/repos/ordersRepo';
import { requestsForUser } from '@/lib/server/repos/requestsRepo';

/**
 * GET /api/me/export — a GDPR-style data export: every record the account
 * page's own tabs already show the user, bundled into one JSON download
 * («دریافت اطلاعات من»). Deliberately reuses the same repo calls as
 * /api/me/{orders,leads,warehouse,favorites,alerts,club,requests} rather
 * than fetching those routes internally, so this stays one DB round trip
 * per resource with no HTTP hop.
 */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth.response;
  const { session } = auth;

  const [user, favorites, alerts, club, leadRows, orders, warehouseItems, requests] = await Promise.all([
    userById(session.id),
    favoritesForUser(session.id),
    alertsForUser(session.id),
    clubStatus(session.id),
    // Export wants everything in one go — request the max page size.
    leadsForUser(session.id, session.mobile, 1, 100).then((r) => r.rows),
    ordersForUser(session.id),
    warehouseForUser(session.id),
    requestsForUser(session.id),
  ]);

  const leads = await Promise.all(
    leadRows.map(async (l) => {
      const [items, proformas] = await Promise.all([leadItemsOf(l.id), proformasOfLead(l.id)]);
      return {
        id: l.id,
        ref: l.ref,
        contact: { name: l.contactName ?? undefined, mobile: l.contactMobile, verified: l.contactVerified },
        source: l.source,
        items: items.map(toLineItem),
        channelPref: l.channelPref,
        status: l.status,
        createdAt: l.createdAt.toISOString(),
        proformaRefs: proformas.map((p) => p.ref),
      };
    }),
  );

  return NextResponse.json(
    {
      exportedAt: new Date().toISOString(),
      user: publicUser(user ?? session),
      favorites,
      alerts,
      club,
      leads,
      orders,
      warehouseItems,
      requests,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export const GET = withApiErrorHandling(GETImpl);
