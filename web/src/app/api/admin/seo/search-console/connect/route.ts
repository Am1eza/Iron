/**
 * Begin the Search Console OAuth consent (US-14.4).
 *
 * POST, not GET, and `settings:write`, not `content:write`: this mints a
 * single-use CSRF nonce and hands back a URL that binds a Google account to
 * this installation. POST also means `requireApiUser`'s same-origin assertion
 * runs, so the nonce cannot be minted by a cross-site request.
 *
 * The route returns the URL instead of redirecting — the panel opens it in a
 * new tab, so the admin does not lose an in-progress article to a full-page
 * navigation.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { SearchConsoleNotConfiguredError, startConnect } from '@/lib/server/services/searchConsole.service';

async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'settings:write');
  if ('response' in auth) return auth.response;

  let authUrl: string;
  try {
    authUrl = await startConnect();
  } catch (err) {
    if (err instanceof SearchConsoleNotConfiguredError) {
      return NextResponse.json(
        {
          error: 'not_configured',
          message: 'اتصال به سرچ کنسول هنوز پیکربندی نشده است — کلید Google Cloud در تنظیمات سرور ثبت نشده.',
        },
        { status: 409 },
      );
    }
    throw err;
  }
  await audit(auth.session.id, 'seo.searchConsole.connectStart', { type: 'setting', id: 'search-console' });
  return NextResponse.json({ authUrl }, { headers: { 'Cache-Control': 'no-store' } });
}

export const POST = withApiErrorHandling(POSTImpl);
