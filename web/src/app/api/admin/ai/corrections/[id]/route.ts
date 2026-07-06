import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { setCorrectionActive } from '@/lib/server/repos/aiCorrectionsRepo';

const patchPayload = z.object({ isActive: z.boolean() });

/** PATCH /api/admin/ai/corrections/[id] — enable/disable a correction. */
async function PATCHImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'ai:review');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const v = await validateBody(req, patchPayload);
  if (!v.ok) return v.response;
  await setCorrectionActive(id, v.data.isActive);
  await audit(auth.session.id, 'ai.correction.update', { type: 'ai_correction', id }, null, v.data);
  return NextResponse.json({ ok: true });
}

export const PATCH = withApiErrorHandling(PATCHImpl);
