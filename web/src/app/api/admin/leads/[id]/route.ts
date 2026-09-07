import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { addLeadNote, findLead, leadItemsOf, leadNotesOf, proformasOfLead, softDeleteLead, updateLead } from '@/lib/server/repos/leadsRepo';
import { checkLeadStatusChange, LEAD_STATUS_LABEL } from '@/lib/server/utils/leadStatusFlow';
import { recomputeTier } from '@/lib/server/repos/clubRepo';
import { getDb } from '@/lib/server/db/client';
import { users, currentPrices } from '@/lib/server/db/schema';
import { ROLES, ROLE_LABEL, can, canChangeLeadAssignee, canActOnAssignedRecord, isStaff } from '@/lib/auth/roles';

/** GET /api/admin/leads/{id} — full lead: items, notes, proformas. */
async function GETImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:read');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const lead = await findLead(id);
  if (!lead) return NextResponse.json({ error: 'not_found', message: 'سرنخ یافت نشد.' }, { status: 404 });
  const [items, notes, proformas] = await Promise.all([leadItemsOf(id), leadNotesOf(id), proformasOfLead(id)]);
  // W23 review fix: a lead's items are priced ONCE at creation
  // (leads.service.ts's priceItems, called only from createLead) and
  // issueProforma never re-prices them — it explicitly quotes whatever is
  // already stored. If the catalog price moved since, a rep issuing the
  // proforma today has no way to notice without leaving this screen.
  // Surfacing the current live price alongside each item lets the existing
  // item-edit flow (US-19.4) double as the "catch it before issuing" step.
  const skuIds = [...new Set(items.map((it) => it.skuId).filter((x): x is string => Boolean(x)))];
  const priceRows =
    skuIds.length > 0
      ? await getDb().select({ skuId: currentPrices.skuId, price: currentPrices.price }).from(currentPrices).where(inArray(currentPrices.skuId, skuIds))
      : [];
  const currentPriceBySku = new Map(priceRows.map((r) => [r.skuId, r.price]));
  const itemsWithCurrentPrice = items.map((it) => ({
    ...it,
    currentPrice: it.skuId ? (currentPriceBySku.get(it.skuId) ?? null) : null,
  }));
  // The signed-in customer behind the lead, when there is one (guest leads
  // have a null userId). Only the two fields the rep needs to know they are
  // talking to an ADMIN-APPROVED business: whether it is verified, and the
  // company it was verified as. Nothing here changes pricing or priority —
  // it is context for the call and for issuing a company invoice.
  const customer = lead.userId ? await businessCustomerOf(lead.userId) : null;
  return NextResponse.json(
    { lead, items: itemsWithCurrentPrice, notes, proformas, customer },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

/** `{ companyName, bizVerified }` for a lead's owner — null when the account
 *  has no approved business verification, so the badge is opt-in by data. */
async function businessCustomerOf(userId: string) {
  const rows = await getDb()
    .select({ companyName: users.companyName, bizVerifyStatus: users.bizVerifyStatus })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const u = rows[0];
  if (!u || u.bizVerifyStatus !== 'approved') return null;
  return { companyName: u.companyName ?? null, bizVerified: true as const };
}

const patchPayload = z.object({
  status: z.enum(['new', 'contacted', 'won', 'lost']).optional(),
  // min(1): the picker sends `null` to unassign, never ''. An empty string was
  // reaching the FK as a literal id and blowing up as a 500.
  assigneeId: z.string().min(1).nullable().optional(),
  callbackAt: z.string().datetime().nullable().optional(),
  // Why a lead is being pulled back out of a terminal status. Only read when
  // `checkLeadStatusChange` demands it (today: leaving 'won'); ignored
  // otherwise, so every existing caller keeps working unchanged.
  statusReason: z.string().trim().max(500).optional(),
});

/** Roles that may hold a lead — derived, so a permission-table change can't
 *  leave this check (or its Persian message) behind. */
const ASSIGNABLE_ROLES = ROLES.filter((r) => isStaff(r) && can(r, 'leads:read'));

/**
 * `leads.assigneeId` is only FK-constrained, so any existing user id used to
 * pass: a rep could assign a lead to a CUSTOMER's id and the lead dropped out
 * of every staff view while still rendering as "assigned", while a stale id
 * surfaced as an FK-violation 500 instead of a 400. Mirrors the candidate set
 * of GET /api/admin/staff (active + staff role), tightened to the roles that
 * actually hold 'leads:read' — an assignee who can't open /admin/leads is the
 * same silent black hole as a customer.
 */
async function rejectUnassignable(assigneeId: string): Promise<NextResponse | null> {
  const rows = await getDb()
    .select({ role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, assigneeId))
    .limit(1);
  const target = rows[0];
  if (!target) {
    return NextResponse.json(
      { error: 'assignee_not_found', message: 'کاربر انتخاب‌شده برای واگذاری یافت نشد.' },
      { status: 400 },
    );
  }
  if (!ASSIGNABLE_ROLES.includes(target.role)) {
    return NextResponse.json(
      {
        error: 'assignee_not_staff',
        message: `سرنخ فقط به ${ASSIGNABLE_ROLES.map((r) => `«${ROLE_LABEL[r]}»`).join(' یا ')} واگذار می‌شود.`,
      },
      { status: 409 },
    );
  }
  if (!target.isActive) {
    return NextResponse.json(
      { error: 'assignee_inactive', message: 'این کاربر غیرفعال است و نمی‌توان سرنخ را به او واگذار کرد.' },
      { status: 409 },
    );
  }
  return null;
}

/** PATCH /api/admin/leads/{id} — status / assignee / callback. */
async function PATCHImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const v = await validateBody(req, patchPayload);
  if (!v.ok) return v.response;

  const before = await findLead(id);
  if (!before) return NextResponse.json({ error: 'not_found', message: 'سرنخ یافت نشد.' }, { status: 404 });
  if (v.data.assigneeId !== undefined) {
    // 403, not the route-level 404: this caller legitimately holds leads:write
    // and belongs on this endpoint — they are being refused ONE field, and a
    // «یافت نشد» here would read as a broken panel rather than a rule.
    if (!canChangeLeadAssignee(auth.session, before.assigneeId, v.data.assigneeId)) {
      return NextResponse.json(
        {
          error: 'assign_forbidden',
          message: 'واگذاری سرنخ به کارشناس دیگر فقط از عهدهٔ مدیر سیستم برمی‌آید. شما می‌توانید سرنخ بدون کارشناس را برای خودتان بردارید یا سرنخ خودتان را رها کنید.',
        },
        { status: 403 },
      );
    }
    if (v.data.assigneeId) {
      const bad = await rejectUnassignable(v.data.assigneeId);
      if (bad) return bad;
    }
  }
  // Re-assignment has its own guard above; status/callbackAt did not — a
  // `leads:write`-only rep could mark a colleague's lead won/lost or set its
  // callback with no ownership check at all. Scoped to the lead's owner
  // BEFORE this request, so claiming an unassigned lead and setting its
  // status in the same PATCH still works (canActOnAssignedRecord allows
  // assigneeId===null).
  if (
    (v.data.status !== undefined || v.data.callbackAt !== undefined) &&
    !canActOnAssignedRecord(auth.session, before.assigneeId)
  ) {
    return NextResponse.json(
      { error: 'lead_forbidden', message: 'این سرنخ به کارشناس دیگری واگذار شده؛ فقط او یا مدیر سیستم می‌تواند وضعیت یا زمان تماس آن را تغییر دهد.' },
      { status: 403 },
    );
  }
  // Legal-move check BEFORE the write: without it the raw API accepted every
  // status from every other one, including back to 'new' (see
  // leadStatusFlow.ts). Skipped entirely when the body carries no `status`, so
  // an assignee-only or callback-only PATCH is untouched.
  if (v.data.status !== undefined) {
    const rejection = checkLeadStatusChange({
      from: before.status,
      to: v.data.status,
      reason: v.data.statusReason,
    });
    if (rejection) {
      return NextResponse.json(
        { error: rejection.error, message: rejection.message },
        { status: rejection.httpStatus },
      );
    }
  }
  // Compare-and-swap on the owner this request was AUTHORIZED against, so the
  // window between `findLead` above and this write cannot be used to silently
  // overwrite someone else's claim (see updateLead's doc comment).
  //
  // Applied when — and only when — the decision above actually depended on
  // current ownership: any assignee change (a rep's right to claim IS
  // «before === null», and a manager reassigning must not silently erase a
  // claim made a second ago), and any status/callback write let through by
  // canActOnAssignedRecord rather than by leads:manage. A manager editing
  // only status is not ownership-gated, so it is not guarded here and cannot
  // get a spurious conflict.
  const ownershipGated =
    v.data.assigneeId !== undefined ||
    ((v.data.status !== undefined || v.data.callbackAt !== undefined) &&
      !can(auth.session.role, 'leads:manage'));
  const lead = await updateLead(
    id,
    {
      status: v.data.status,
      assigneeId: v.data.assigneeId === undefined ? undefined : v.data.assigneeId,
      callbackAt: v.data.callbackAt === undefined ? undefined : v.data.callbackAt ? new Date(v.data.callbackAt) : null,
    },
    ownershipGated ? { ifAssigneeId: before.assigneeId } : {},
  );
  if (!lead) {
    // The guard matched nothing. Re-read to report WHICH of the two it was
    // rather than guessing: the row can also have been archived concurrently,
    // and calling that «کس دیگری برداشت» would send the rep hunting for a
    // colleague who does not exist.
    const now = await findLead(id);
    if (!now) return NextResponse.json({ error: 'not_found', message: 'سرنخ یافت نشد.' }, { status: 404 });
    return NextResponse.json(
      {
        error: 'assignee_conflict',
        message:
          'این سرنخ همین الان توسط شخص دیگری برداشته یا واگذار شد. صفحه را تازه کنید و دوباره تلاش کنید.',
        assigneeId: now.assigneeId,
      },
      { status: 409 },
    );
  }
  // assigneeId in the before-state too: re-assignment is the field the guard
  // above protects, so the trail has to show who the lead was taken FROM.
  await audit(
    auth.session.id,
    'lead.update',
    { type: 'lead', id },
    { status: before.status, assigneeId: before.assigneeId },
    v.data,
  );
  // The reason also lands in the notes timeline, next to the lost-reason notes
  // the UI already writes: an audit row answers "who did this" for an admin
  // digging through logs, but the rep who opens this lead tomorrow only ever
  // sees the timeline. Best-effort — a failed note must not undo a status
  // change that already committed.
  const statusReason = v.data.statusReason?.trim();
  if (statusReason && v.data.status !== undefined && v.data.status !== before.status) {
    await addLeadNote(id, auth.session.id, `دلیل تغییر وضعیت از «${LEAD_STATUS_LABEL[before.status]}» به «${LEAD_STATUS_LABEL[v.data.status]}»: ${statusReason}`).catch(
      () => {},
    );
  }
  // Recompute on any change into OR out of 'won' — recomputeTier derives
  // the tier fresh from the live won-lead count and downgrades correctly
  // when it's lower than stored, so an admin reverting a mis-marked 'won'
  // lead (e.g. back to 'lost') un-advances the tier too, not just upgrades.
  const wonChanged = v.data.status !== undefined && (v.data.status === 'won' || before.status === 'won');
  if (wonChanged && lead.userId) void recomputeTier(lead.userId).catch(() => {});
  return NextResponse.json({ lead });
}

/** DELETE /api/admin/leads/{id} — archive (soft-delete) a spam/duplicate/test
 *  lead. Preserves the row (and its audit trail) for compliance — see the
 *  `deletedAt` column comment in the schema; it just drops out of the normal
 *  admin working set.
 *
 *  `leads:manage`, not `leads:write`: this makes a deal vanish from every
 *  working view and from the team's numbers. It has no UI at all, so until now
 *  the only thing standing between a rep and quietly burying a lead they had
 *  mishandled was not knowing the endpoint existed. */
async function DELETEImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:manage');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const lead = await softDeleteLead(id);
  if (!lead) return NextResponse.json({ error: 'not_found', message: 'سرنخ یافت نشد.' }, { status: 404 });
  // A bare null/null row couldn't answer "which deal was archived?" — the ref
  // and status are the only handles a reviewer has once it leaves admin views.
  await audit(
    auth.session.id,
    'lead.delete',
    { type: 'lead', id },
    { ref: lead.ref, status: lead.status, assigneeId: lead.assigneeId },
    null,
  );
  return NextResponse.json({ ok: true });
}

export const GET = withApiErrorHandling(GETImpl);
export const PATCH = withApiErrorHandling(PATCHImpl);
export const DELETE = withApiErrorHandling(DELETEImpl);
