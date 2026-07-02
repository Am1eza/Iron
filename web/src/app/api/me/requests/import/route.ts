import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiUser, requireDb } from '@/lib/server/utils/apiGuard';
import { insertRequest } from '@/lib/server/repos/requestsRepo';

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
        status: z.enum(['submitted', 'reviewing', 'contacted', 'quoted']).optional(),
      }),
    )
    .max(100),
});

/** POST /api/me/requests/import — one-shot localStorage migration (idempotent by ref). */
export async function POST(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req);
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, importPayload);
  if (!v.ok) return v.response;

  let imported = 0;
  for (const r of v.data.requests) {
    const inserted = await insertRequest({
      userId: auth.session.id,
      ref: r.ref,
      type: r.type,
      title: r.title,
      detail: r.detail,
      note: r.note,
      createdAt: r.createdAt ? new Date(r.createdAt) : undefined,
      status: r.status,
    });
    if (inserted) imported++;
  }
  return NextResponse.json({ ok: true, imported });
}
