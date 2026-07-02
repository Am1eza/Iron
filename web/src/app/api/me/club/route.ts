import { NextResponse, type NextRequest } from 'next/server';
import { requireApiUser, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { clubStatus, joinClub } from '@/lib/server/repos/clubRepo';

/** GET /api/me/club — membership status + progress to the next tier. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth.response;
  const club = await clubStatus(auth.session.id);
  return NextResponse.json({ club }, { headers: { 'Cache-Control': 'no-store' } });
}

/** POST /api/me/club — join (tier آهنی). */
async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth.response;
  await joinClub(auth.session.id);
  const club = await clubStatus(auth.session.id);
  return NextResponse.json({ ok: true, club }, { status: 201 });
}

export const GET = withApiErrorHandling(GETImpl);
export const POST = withApiErrorHandling(POSTImpl);
