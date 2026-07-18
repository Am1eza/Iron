import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { adminListRedirects, createRedirect, findRedirect, RedirectLoopError } from '@/lib/server/repos/redirectsRepo';

/** GET /api/admin/seo/redirects — every configured redirect. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'content:write');
  if ('response' in auth) return auth.response;
  const redirects = await adminListRedirects();
  return NextResponse.json({ redirects }, { headers: { 'Cache-Control': 'no-store' } });
}

const payload = z.object({
  fromPath: z.string().trim().min(1).max(500),
  toPath: z.string().trim().min(1).max(500),
  permanent: z.boolean().optional(),
});

/** POST /api/admin/seo/redirects — add a redirect (US-14.3). Enforced live
 *  from src/app/not-found.tsx the next time that fromPath is requested. */
async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'content:write');
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;

  if (await findRedirect(v.data.fromPath)) {
    return NextResponse.json(
      { error: 'already_exists', message: 'برای این مسیر قبلاً ریدایرکتی ثبت شده است.' },
      { status: 409 },
    );
  }

  let redirect;
  try {
    redirect = await createRedirect(v.data);
  } catch (err) {
    if (err instanceof RedirectLoopError) {
      return NextResponse.json({ error: 'redirect_loop', message: err.message }, { status: 409 });
    }
    throw err;
  }

  await audit(auth.session.id, 'redirect.create', { type: 'redirect', id: redirect.id }, undefined, redirect);
  return NextResponse.json({ redirect }, { status: 201 });
}

export const GET = withApiErrorHandling(GETImpl);
export const POST = withApiErrorHandling(POSTImpl);
