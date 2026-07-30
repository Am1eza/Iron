import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiUser, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { insertRequest } from '@/lib/server/repos/requestsRepo';
import { rateLimit } from '@/lib/server/utils/rateLimit';

const importPayload = z.object({
  requests: z
    .array(
      z.object({
        ref: z.string().trim().min(3).max(40),
        type: z.enum(['proforma', 'bulk', 'warehouse']),
        title: z.string().trim().min(1).max(160),
        detail: z.string().trim().max(500).optional(),
        note: z.string().trim().max(1000).optional(),
        createdAt: z.string().datetime().optional(),
        // NOTE: `status` is intentionally NOT accepted from the client. This is
        // a localStorage migration endpoint; letting the caller set
        // 'quoted'/'contacted' would let a user fabricate a favorable status on
        // their own records. All imported rows use the server default.
      }),
    )
    .max(100),
});

/** POST /api/me/requests/import — one-shot localStorage migration (idempotent
 *  by (userId, ref) — W20, was a bare global-unique `ref` the client itself
 *  proposed, so two different customers' independently-minted refs could
 *  collide and the loser vanished with no trace). Rate-limited (W20 — was
 *  the one write-ish route under /api/me/* with none at all, and it accepts
 *  up to 100 client-authored rows per call). */
async function POSTImpl(req: NextRequest) {
  const limited = await rateLimit(req, 'me-requests-import', { limit: 10, windowMs: 60_000 });
  if (limited) return limited;
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, importPayload);
  if (!v.ok) return v.response;

  let imported = 0;
  const skipped: string[] = [];
  for (const r of v.data.requests) {
    const inserted = await insertRequest({
      userId: auth.session.id,
      ref: r.ref,
      type: r.type,
      title: r.title,
      detail: r.detail,
      note: r.note,
      createdAt: r.createdAt ? new Date(r.createdAt) : undefined,
    });
    if (inserted) imported++;
    // W20: a conflict used to be indistinguishable from success — the caller
    // (useRequestsSync) then wiped its local copy on the strength of a blanket
    // {ok:true}, discarding the one row that never actually made it to the
    // server. Naming the skipped ref lets the client keep it instead.
    else skipped.push(r.ref);
  }
  return NextResponse.json({ ok: true, imported, skipped });
}

export const POST = withApiErrorHandling(POSTImpl);
