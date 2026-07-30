import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { findLead, leadItemsOf, leadNotesOf, proformasOfLead, softDeleteLead, updateLead } from '@/lib/server/repos/leadsRepo';
import { recomputeTier } from '@/lib/server/repos/clubRepo';
import { getDb } from '@/lib/server/db/client';
import { users, currentPrices } from '@/lib/server/db/schema';
import { ROLES, ROLE_LABEL, can, canChangeLeadAssignee, isStaff } from '@/lib/auth/roles';

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
  return NextResponse.json({ lead, items: itemsWithCurrentPrice, notes, proformas }, { headers: { 'Cache-Control': 'no-store' } });
}

const patchPayload = z.object({
  status: z.enum(['new', 'contacted', 'won', 'lost']).optional(),
  // min(1): the picker sends `null` to unassign, never ''. An empty string was
  // reaching the FK as a literal id and blowing up as a 500.
  assigneeId: z.string().min(1).nullable().optional(),
  callbackAt: z.string().datetime().nullable().optional(),
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
  const lead = await updateLead(id, {
    status: v.data.status,
    assigneeId: v.data.assigneeId === undefined ? undefined : v.data.assigneeId,
    callbackAt: v.data.callbackAt === undefined ? undefined : v.data.callbackAt ? new Date(v.data.callbackAt) : null,
  });
  // assigneeId in the before-state too: re-assignment is the field the guard
  // above protects, so the trail has to show who the lead was taken FROM.
  await audit(
    auth.session.id,
    'lead.update',
    { type: 'lead', id },
    { status: before.status, assigneeId: before.assigneeId },
    v.data,
  );
  // Recompute on any change into OR out of 'won' — recomputeTier derives
  // the tier fresh from the live won-lead count and downgrades correctly
  // when it's lower than stored, so an admin reverting a mis-marked 'won'
  // lead (e.g. back to 'lost') un-advances the tier too, not just upgrades.
  const wonChanged = v.data.status !== undefined && (v.data.status === 'won' || before.status === 'won');
  if (wonChanged && lead?.userId) void recomputeTier(lead.userId).catch(() => {});
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
