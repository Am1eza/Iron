import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { audit, requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { withIdempotency } from '@/lib/server/utils/idempotency';
import {
  mergeLeads,
  LeadMergeMissingError,
  LeadMergeMobileMismatchError,
  LeadMergeProformaActiveError,
  LeadMergeSelfError,
} from '@/lib/server/repos/leadsRepo';

const mergePayload = z.object({ loserId: z.string().min(1) });

/**
 * POST /api/admin/leads/{id}/merge — fold `{loserId}` into `{id}`.
 *
 * `leads:manage`, NOT `leads:write`. Day-to-day lead work (call it, price it,
 * quote it, close it) is one thing; a decision about a lead's IDENTITY — which
 * of two records is the real customer and which one stops existing — is a
 * manager's call. Same tier as archiving a lead (DELETE /api/admin/leads/{id}),
 * and this is strictly the more consequential of the two.
 *
 * Wrapped in `withIdempotency` with NO time bucket: unlike proforma issuance,
 * there is no legitimate "do it again in a minute" for a merge, so the claim is
 * permanent for this (winner, loser, actor) triple and a double-click replays
 * the first response instead of running a second merge.
 *
 * Every refusal from `mergeLeads` is thrown, never returned from inside the
 * idempotent block — `withIdempotency` stores whatever the block RETURNS and
 * replays it forever, so returning a 409 «پیش‌فاکتور فعال دارد» in-band would
 * keep replaying that refusal even after the rep cancelled the proforma (the
 * exact failure mode documented on LeadDetail's `newIdempotencyKey`). Throwing
 * releases the claim, so a genuine retry runs.
 */
async function POSTImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:manage');
  if ('response' in auth) return auth.response;
  const { id: winnerId } = await ctx.params;
  const v = await validateBody(req, mergePayload);
  if (!v.ok) return v.response;
  const { loserId } = v.data;

  try {
    return await withIdempotency(req, 'lead.merge', `${winnerId}:${loserId}:${auth.session.id}`, async () => {
      const result = await mergeLeads(winnerId, loserId, auth.session.id);

      // TWO entries, one keyed on each side, so /admin/audit's entity filter
      // finds this merge starting from EITHER lead — a reviewer holding only
      // the archived duplicate's id would otherwise find nothing at all.
      // The `before` payload carries everything needed to reverse the merge by
      // hand: which rows moved, and what the loser looked like before it was
      // archived.
      const before = {
        loserId: result.loser.id,
        loserRef: result.loser.ref,
        loserStatus: result.loser.status,
        loserAssigneeId: result.loser.assigneeId,
        loserCreatedAt: result.loser.createdAt.toISOString(),
        movedItemIds: result.movedItemIds,
        movedNoteIds: result.movedNoteIds,
        movedProformaIds: result.movedProformaIds,
        movedRequestIds: result.movedRequestIds,
      };
      const after = {
        winnerId: result.winner.id,
        winnerRef: result.winner.ref,
        movedItems: result.movedItemIds.length,
        movedNotes: result.movedNoteIds.length,
        movedProformas: result.movedProformaIds.length,
        movedRequests: result.movedRequestIds.length,
      };
      await audit(auth.session.id, 'lead.merge', { type: 'lead', id: result.winner.id }, before, after);
      await audit(auth.session.id, 'lead.merged_into', { type: 'lead', id: result.loser.id }, before, after);

      return {
        status: 200,
        body: {
          winner: { id: result.winner.id, ref: result.winner.ref },
          loser: { id: result.loser.id, ref: result.loser.ref },
          moved: {
            items: result.movedItemIds.length,
            notes: result.movedNoteIds.length,
            proformas: result.movedProformaIds.length,
            requests: result.movedRequestIds.length,
          },
        },
      };
    });
  } catch (err) {
    if (err instanceof LeadMergeSelfError) {
      return NextResponse.json(
        { error: 'merge_self', message: 'نمی‌توان یک سرنخ را در خودش ادغام کرد.' },
        { status: 400 },
      );
    }
    if (err instanceof LeadMergeMissingError) {
      return NextResponse.json(
        {
          error: 'merge_not_found',
          message:
            err.side === 'winner'
              ? 'سرنخ مقصد یافت نشد یا بایگانی شده است.'
              : 'سرنخ تکراری یافت نشد یا پیش‌تر بایگانی شده است. صفحه را تازه کنید.',
        },
        { status: 404 },
      );
    }
    if (err instanceof LeadMergeMobileMismatchError) {
      return NextResponse.json(
        {
          error: 'merge_mobile_mismatch',
          message: 'شمارهٔ تماس این دو سرنخ یکسان نیست و ادغام انجام نشد.',
        },
        { status: 409 },
      );
    }
    if (err instanceof LeadMergeProformaActiveError) {
      return NextResponse.json(
        {
          error: 'merge_proforma_active',
          message: `${err.side === 'winner' ? 'سرنخ مقصد' : 'سرنخ تکراری'} پیش‌فاکتور فعال ${err.proformaRef} دارد. تا وقتی این پیش‌فاکتور باطل یا منقضی نشده، ادغام ممکن نیست — ممکن است همین حالا در دست مشتری باشد.`,
        },
        { status: 409 },
      );
    }
    throw err;
  }
}

export const POST = withApiErrorHandling(POSTImpl);
