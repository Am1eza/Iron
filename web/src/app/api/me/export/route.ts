import { NextResponse, type NextRequest } from 'next/server';
import { requireApiUser, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { userById } from '@/lib/auth/store';
import { publicUser } from '@/lib/auth/publicUser';
import { favoritesForUser } from '@/lib/server/repos/favoritesRepo';
import { alertsForUser } from '@/lib/server/repos/alertsRepo';
import { clubStatus } from '@/lib/server/repos/clubRepo';
import { leadsForUser, leadItemsOfMany, proformasOfLeads, toLineItem } from '@/lib/server/repos/leadsRepo';
import { ordersForUser, warehouseForUser } from '@/lib/server/repos/ordersRepo';
import { requestsForUser } from '@/lib/server/repos/requestsRepo';
import { settlementsForUser } from '@/lib/server/repos/warehouseSettlementsRepo';
import { rateLimit } from '@/lib/server/utils/rateLimit';

/**
 * GET /api/me/export — a GDPR-style data export: every record the account
 * page's own tabs already show the user, bundled into one JSON download
 * («دریافت اطلاعات من»). Deliberately reuses the same repo calls as
 * /api/me/{orders,leads,warehouse,favorites,alerts,club,requests} rather
 * than fetching those routes internally, so this stays one DB round trip
 * per resource with no HTTP hop.
 */
async function GETImpl(req: NextRequest) {
  // W20: this is the most expensive endpoint under /api/me/* (8 parallel
  // repo calls plus an N+1 loop below over up to 100 leads) and previously
  // had no rate limit at all, unlike every other write-adjacent public/
  // authenticated route in the app.
  const limited = await rateLimit(req, 'me-export', { limit: 5, windowMs: 60_000 });
  if (limited) return limited;
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth.response;
  const { session } = auth;

  const [user, favorites, alerts, club, leadRows, orders, warehouseItems, warehouseSettlements, requests] = await Promise.all([
    userById(session.id),
    favoritesForUser(session.id),
    alertsForUser(session.id),
    clubStatus(session.id),
    // Export wants everything in one go — request the max page size.
    leadsForUser(session.id, session.mobile, 1, 100).then((r) => r.rows),
    ordersForUser(session.id, 1, 100).then((r) => r.rows),
    warehouseForUser(session.id),
    // W20: was missing entirely — a customer's warehouse billing history is
    // unambiguously their own personal data (the table exists specifically
    // so it can be queried per-user) but had no way to obtain it, anywhere.
    settlementsForUser(session.id),
    requestsForUser(session.id, 1, 100).then((r) => r.rows),
  ]);

  // Two queries for the whole export rather than two per lead — this endpoint
  // is unbounded by design (it must return everything the user has), so the
  // per-lead version scaled directly with how long the customer has been here.
  const leadIds = leadRows.map((l) => l.id);
  const [itemsByLead, proformasByLead] = await Promise.all([
    leadItemsOfMany(leadIds),
    proformasOfLeads(leadIds),
  ]);
  const leads = leadRows.map((l) => ({
    id: l.id,
    ref: l.ref,
    contact: { name: l.contactName ?? undefined, mobile: l.contactMobile, verified: l.contactVerified },
    source: l.source,
    items: (itemsByLead.get(l.id) ?? []).map(toLineItem),
    channelPref: l.channelPref,
    status: l.status,
    createdAt: l.createdAt.toISOString(),
    proformaRefs: (proformasByLead.get(l.id) ?? []).map((p) => p.ref),
  }));

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
      warehouseSettlements,
      requests,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export const GET = withApiErrorHandling(GETImpl);
