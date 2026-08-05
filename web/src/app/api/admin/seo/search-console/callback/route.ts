/**
 * Google's OAuth redirect target (US-14.4).
 *
 * This is the one route here Google itself sends a browser to, which shapes
 * three decisions:
 *
 *  - It answers with a REDIRECT to `/admin/seo`, not JSON. The person looking
 *    at it is an admin in a browser tab, not a fetch call, and a raw
 *    `{"ok":true}` is a dead end.
 *  - It still requires `settings:write`. The redirect lands on the panel host
 *    with the session cookie attached, so the same admin who started the flow
 *    is the one who finishes it; without this check, anyone who could reach
 *    the URL could complete a consent.
 *  - CSRF is the `state` nonce (`consumeOAuthState`), which is single-use and
 *    expires — a GET cannot use the same-origin assertion the mutating
 *    routes get from `requireApiUser`, because the referrer here is Google.
 *
 * Google's own `error=access_denied` (the admin clicked "Cancel") is a normal
 * outcome, not a failure to report.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { SearchConsoleNotConfiguredError, finishConnect } from '@/lib/server/services/searchConsole.service';
import { routes } from '@/lib/routes';

/** `/admin/seo?searchConsole=<outcome>` — the panel reads this and shows a
 *  Persian message; the outcome vocabulary is closed and matched there. */
function back(req: NextRequest, outcome: string): NextResponse {
  const url = new URL(routes.admin.seo(), req.nextUrl.origin);
  url.searchParams.set('searchConsole', outcome);
  return NextResponse.redirect(url);
}

async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'settings:write');
  if ('response' in auth) return auth.response;

  const params = req.nextUrl.searchParams;
  if (params.get('error')) return back(req, 'denied');

  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) return back(req, 'invalid');

  let result;
  try {
    result = await finishConnect(code, state);
  } catch (err) {
    if (err instanceof SearchConsoleNotConfiguredError) return back(req, 'not_configured');
    throw err;
  }
  if (!result.ok) return back(req, result.reason === 'state' ? 'invalid' : result.reason);

  await audit(auth.session.id, 'seo.searchConsole.connect', { type: 'setting', id: 'search-console' });
  return back(req, 'connected');
}

export const GET = withApiErrorHandling(GETImpl);
