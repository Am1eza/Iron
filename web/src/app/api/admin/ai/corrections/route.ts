import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { createCorrection, listCorrections } from '@/lib/server/repos/aiCorrectionsRepo';

/** GET /api/admin/ai/corrections — the curated correction library. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'ai:review');
  if ('response' in auth) return auth.response;
  return NextResponse.json(
    { corrections: await listCorrections() },
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
