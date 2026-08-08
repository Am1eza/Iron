import { NextResponse, type NextRequest } from 'next/server';
import { validateBody } from '@/lib/validation/request';
import { letterheadUpdatePayload } from '@/lib/validation/api';
import { getSessionVerified } from '@/lib/auth/session';
import { assertSameOrigin } from '@/lib/auth/origin';
import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { clubStatus, getLetterhead, setLetterhead } from '@/lib/server/repos/clubRepo';

/** GET /api/me/letterhead — the signed-in member's saved letterhead fields
 *  (for the account form to prefill). 404s for non-پولادی members — same
 *  hide-don't-reveal convention as admin-only routes: a lower tier has no
 *  legitimate reason to probe whether this endpoint exists. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const session = await getSessionVerified();
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated', message: 'وارد نشده‌اید.' }, { status: 401 });
  }
  const status = await clubStatus(session.id);
  if (status.tier !== 'poolad') {
    return NextResponse.json({ error: 'not_found', message: 'یافت نشد.' }, { status: 404 });
  }
  const letterhead = await getLetterhead(session.id);
  return NextResponse.json({ letterhead }, { headers: { 'Cache-Control': 'no-store' } });
}

/** PUT /api/me/letterhead — update company name / address / phone. Logo is a
 *  separate endpoint (multipart upload, see letterhead/logo/route.ts). */
async function PUTImpl(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (origin) return origin;
  const guard = requireDb();
  if (guard) return guard;
  const session = await getSessionVerified();
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated', message: 'وارد نشده‌اید.' }, { status: 401 });
  }
  const status = await clubStatus(session.id);
  if (status.tier !== 'poolad') {
    return NextResponse.json({ error: 'not_found', message: 'یافت نشد.' }, { status: 404 });
  }

  const v = await validateBody(req, letterheadUpdatePayload);
  if (!v.ok) return v.response;

  const ok = await setLetterhead(session.id, {
    companyName: v.data.companyName ?? null,
    address: v.data.address ?? null,
    phone: v.data.phone ?? null,
  });
  if (!ok) {
    // clubStatus already confirmed a membership row exists, so this only
    // fires on a genuine race (e.g. the row was deleted between the two
    // calls) — worth a distinct message rather than a bare 500.
    return NextResponse.json({ error: 'no_membership', message: 'عضویت باشگاه یافت نشد.' }, { status: 409 });
  }
  const letterhead = await getLetterhead(session.id);
  return NextResponse.json({ letterhead });
}

export const GET = withApiErrorHandling(GETImpl);
export const PUT = withApiErrorHandling(PUTImpl);
