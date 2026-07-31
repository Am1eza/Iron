import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { updateRedirect, deleteRedirect, RedirectLoopError } from '@/lib/server/repos/redirectsRepo';
import { internalPathSchema } from '@/lib/validation/utils';

const payload = z
  .object({
    toPath: internalPathSchema(500).optional(),
    permanent: z.boolean().optional(),
  })
  .refine((v) => v.toPath !== undefined || v.permanent !== undefined, {
    message: 'حداقل یک فیلد باید ارسال شود.',
  });

/** PATCH /api/admin/seo/redirects/{id} — change the destination or
 *  permanent/temporary flag. `fromPath` is intentionally not editable here —
 *  changing it is really "delete + create" (a different lookup key). */
async function PATCHImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'content:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;

  let redirect;
  try {
    redirect = await updateRedirect(id, v.data);
  } catch (err) {
    if (err instanceof RedirectLoopError) {
      return NextResponse.json({ error: 'redirect_loop', message: err.message }, { status: 409 });
    }
    throw err;
  }
  if (!redirect) return NextResponse.json({ error: 'not_found', message: 'ریدایرکت یافت نشد.' }, { status: 404 });
  await audit(auth.session.id, 'redirect.update', { type: 'redirect', id }, null, v.data);
  return NextResponse.json({ redirect });
}

/** DELETE /api/admin/seo/redirects/{id}. */
async function DELETEImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'content:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  await deleteRedirect(id);
  await audit(auth.session.id, 'redirect.delete', { type: 'redirect', id }, null, null);
  return NextResponse.json({ ok: true });
}

export const PATCH = withApiErrorHandling(PATCHImpl);
export const DELETE = withApiErrorHandling(DELETEImpl);
