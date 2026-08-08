import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { reviewVerification } from '@/lib/server/repos/verificationRepo';
import { recomputeTier } from '@/lib/server/repos/clubRepo';

const payload = z.object({
  kind: z.enum(['id', 'biz']),
  decision: z.enum(['approved', 'rejected']),
});

/** PATCH /api/admin/verifications/{userId} — approve/reject a KYC/KYB
 *  submission. Approval bumps the derived verification level, which can raise
 *  the club tier (recompute), and is audited. */
async function PATCHImpl(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'users:manage');
  if ('response' in auth) return auth.response;
  const { userId } = await ctx.params;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;

  const profile = await reviewVerification(userId, v.data.kind, v.data.decision);
  if (!profile) return NextResponse.json({ error: 'not_found', message: 'کاربر یافت نشد.' }, { status: 404 });
  // Verification level feeds club points → recompute the tier.
  await recomputeTier(userId).catch(() => {});
  // audit-2026-08-08: qualifiedReferralCount (verificationRepo.ts) counts a
  // referral as "qualified" the MOMENT the referee's verification is
  // approved here — but only the reviewed user's own tier was ever
  // recomputed. The REFERRER's persisted tier (the field that actually
  // gates real perks: alert caps, پولادی-tier letterhead) never advanced
  // from a referral alone; it just happened to look right if the referrer
  // separately did something else that triggered a recompute. Only on
  // approval — a rejection doesn't newly qualify anything.
  if (v.data.decision === 'approved' && profile.referredBy) {
    await recomputeTier(profile.referredBy).catch(() => {});
  }
  await audit(
    auth.session.id,
    'verification.review',
    { type: 'user', id: userId },
    null,
    { kind: v.data.kind, decision: v.data.decision, level: profile.verificationLevel },
  );
  return NextResponse.json({ ok: true, verificationLevel: profile.verificationLevel });
}

export const PATCH = withApiErrorHandling(PATCHImpl);
