import { NextResponse, type NextRequest } from 'next/server';
import { requireApiUser, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { leadsForUser, leadItemsOf, proformasOfLead, toLineItem } from '@/lib/server/repos/leadsRepo';

/** GET /api/me/leads — the signed-in user's leads (by account or verified mobile). */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth.response;

  const rows = await leadsForUser(auth.session.id, auth.session.mobile);
  const leads = await Promise.all(
    rows.map(async (l) => {
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
  return NextResponse.json({ leads }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
