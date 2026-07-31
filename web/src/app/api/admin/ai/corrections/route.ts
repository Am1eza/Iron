import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { createCorrection, listCorrections } from '@/lib/server/repos/aiCorrectionsRepo';

/** GET /api/admin/ai/corrections?page=&perPage= — the curated correction
 *  library. The `corrections` key is kept (rather than renamed to `rows`) so
 *  adding pagination stays additive for existing clients. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'ai:review');
  if ('response' in auth) return auth.response;
  const p = req.nextUrl.searchParams;
  const { rows, total, page, perPage } = await listCorrections({
    page: Math.max(1, Number(p.get('page') ?? 1) || 1),
    perPage: p.get('perPage') ? Math.max(1, Number(p.get('perPage')) || 50) : undefined,
  });
  return NextResponse.json(
    { corrections: rows, total, page, perPage },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

const createPayload = z.object({
  question: z.string().trim().min(3).max(500),
  answer: z.string().trim().min(3).max(2000),
  sourceMessageId: z.string().max(64).optional(),
});

/** POST /api/admin/ai/corrections — promote a golden answer into the retrieval set. */
async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'ai:review');
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, createPayload);
  if (!v.ok) return v.response;
  const correction = await createCorrection({ ...v.data, createdBy: auth.session.id });
  await audit(auth.session.id, 'ai.correction.create', { type: 'ai_correction', id: correction.id }, null, v.data);
  return NextResponse.json({ correction }, { status: 201 });
}

export const GET = withApiErrorHandling(GETImpl);
export const POST = withApiErrorHandling(POSTImpl);
