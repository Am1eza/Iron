import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { createEvalCandidate, listEvalCandidates, type AiEvalCandidateStatus } from '@/lib/server/repos/aiEvalCandidatesRepo';

const STATUSES = ['pending', 'promoted', 'dismissed'] as const;

/** GET /api/admin/ai/eval-candidates?status=&page=&perPage= — the review queue
 *  (US-05.4). The `candidates` key is kept so pagination stays additive. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'ai:review');
  if ('response' in auth) return auth.response;
  const p = req.nextUrl.searchParams;
  const status = p.get('status');
  const validStatus = (STATUSES as readonly string[]).includes(status ?? '') ? (status as AiEvalCandidateStatus) : undefined;
  const { rows, total, page, perPage } = await listEvalCandidates(validStatus, {
    page: Math.max(1, Number(p.get('page') ?? 1) || 1),
    perPage: p.get('perPage') ? Math.max(1, Number(p.get('perPage')) || 50) : undefined,
  });
  return NextResponse.json(
    { candidates: rows, total, page, perPage },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

const createPayload = z.object({
  conversationId: z.string().max(64).optional(),
  messageId: z.string().max(64).optional(),
  question: z.string().trim().min(3).max(500),
  badAnswer: z.string().trim().min(1).max(2000),
  note: z.string().trim().max(1000).optional(),
});

/** POST /api/admin/ai/eval-candidates — flag a bad conversation for the
 *  eval-authoring queue (US-05.4). This does NOT write to evals.test.ts —
 *  see the schema comment on aiEvalCandidates. */
async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'ai:review');
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, createPayload);
  if (!v.ok) return v.response;
  const candidate = await createEvalCandidate({ ...v.data, createdBy: auth.session.id });
  await audit(auth.session.id, 'ai.eval_candidate.create', { type: 'ai_eval_candidate', id: candidate.id }, null, v.data);
  return NextResponse.json({ candidate }, { status: 201 });
}

export const GET = withApiErrorHandling(GETImpl);
export const POST = withApiErrorHandling(POSTImpl);
