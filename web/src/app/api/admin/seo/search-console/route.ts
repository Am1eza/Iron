/**
 * Search Console connection state (US-14.4).
 *
 * GET is `content:write` — a writer needs to know whether the panel in their
 * editor has data behind it, and the response carries no secret (never the
 * refresh token, never the access token; `searchConsoleStatus` selects the
 * displayable fields only).
 *
 * DELETE is `settings:write`: disconnecting is an account-level action that
 * revokes a Google grant for the whole site, not a content edit.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { disconnect, searchConsoleStatus } from '@/lib/server/services/searchConsole.service';

async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'content:write');
  if ('response' in auth) return auth.response;
  const status = await searchConsoleStatus();
  return NextResponse.json({ status }, { headers: { 'Cache-Control': 'no-store' } });
}

async function DELETEImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'settings:write');
  if ('response' in auth) return auth.response;
  await disconnect();
  await audit(auth.session.id, 'seo.searchConsole.disconnect', { type: 'setting', id: 'search-console' });
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withApiErrorHandling(GETImpl);
export const DELETE = withApiErrorHandling(DELETEImpl);
