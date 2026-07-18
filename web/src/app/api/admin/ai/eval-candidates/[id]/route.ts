import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { updateEvalCandidateStatus } from '@/lib/server/repos/aiEvalCandidatesRepo';

const payload = z.object({ status: z.enum(['pending', 'promoted', 'dismissed']) });

/** PATCH /api/admin/ai/eval-candidates/{id} — mark promoted (an engineer has
 *  manually added the scripted scenario to evals.test.ts) or dismissed. */
async function PATCHImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'ai:review');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;
  const candidate = await updateEvalCandidateStatus(id, v.data.status);
  if (!candidate) return NextResponse.json({ error: 'not_found', message: 'مورد یافت نشد.' }, { status: 404 });
  await audit(auth.session.id, 'ai.eval_candidate.status', { type: 'ai_eval_candidate', id }, null, v.data);
  return NextResponse.json({ candidate });
}

export const PATCH = withApiErrorHandling(PATCHImpl);
