import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { can } from '@/lib/auth/roles';
import { adminListWarehouse, createWarehouseItem } from '@/lib/server/repos/ordersRepo';
import { updateRequestStatus } from '@/lib/server/repos/requestsRepo';
import { userByMobile, createUser } from '@/lib/auth/store';
import { nextRef } from '@/lib/server/utils/refs';
import { finiteNumber } from '@/lib/validation/utils';
import { WAREHOUSE_STATUSES } from '@/lib/server/db/schema';

/** GET /api/admin/warehouse?page=&status=&q= — consigned stock, with search
 *  (ref/product/customer name/mobile) and status filter (W20 — was a flat
 *  50-row page with no way to reach or find anything past it). */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:read');
  if ('response' in auth) return auth.response;
  const p = req.nextUrl.searchParams;
  const page = Math.max(1, Number(p.get('page') ?? 1) || 1);
  const status = p.get('status');
  const result = await adminListWarehouse({
    page,
    status: status && (WAREHOUSE_STATUSES as readonly string[]).includes(status) ? (status as (typeof WAREHOUSE_STATUSES)[number]) : undefined,
    q: p.get('q') ?? undefined,
    includeDeleted: p.get('includeDeleted') === 'true',
  });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}

const createPayload = z.object({
  mobile: z.string().regex(/^09\d{9}$/, 'شمارهٔ موبایل نامعتبر است.'),
  // W20: if the mobile doesn't resolve to an existing account, `customerName`
  // (when present) registers a new customer on the spot — a walk-in who
  // never signed up used to be simply unrepresentable. Omitted → the old
  // 404 behaviour, so the UI can do a lookup-first, register-on-confirm flow
  // instead of silently creating an account on every typo.
  customerName: z.string().trim().min(1).max(120).optional(),
  product: z.string().trim().min(1).max(160),
  sizeLabel: z.string().trim().max(60).optional(),
  quantityTons: finiteNumber.positive().max(100000),
  // W20: a rate PER TON, not a flat per-item fee (see warehouseSettlementsRepo).
  monthlyFeeToman: finiteNumber.min(0).max(1e9).int().optional(),
  arrivedAt: z.string().datetime().optional(),
  location: z.string().trim().max(120).optional(),
  intakeNote: z.string().trim().max(1000).optional(),
  contractRef: z.string().trim().max(120).optional(),
  insured: z.boolean().optional(),
  leadId: z.string().min(1).optional(),
  requestId: z.string().min(1).optional(),
});

/** POST /api/admin/warehouse — receive a customer's stock (assign by mobile,
 *  or register a new customer inline — see `customerName` above). */
async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:write');
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, createPayload);
  if (!v.ok) return v.response;

  // Same tier as changing an existing item's fee (PATCH [id]/route.ts) —
  // setting the rate at INTAKE is exactly as consequential as editing it
  // later, and was missing this gate entirely (W20 review finding): any
  // leads:write rep could hand out an arbitrary per-ton rate on creation.
  if (v.data.monthlyFeeToman !== undefined && !can(auth.session.role, 'leads:manage')) {
    return NextResponse.json(
      { error: 'fee_forbidden', message: 'تعیین هزینهٔ ماهانه فقط از عهدهٔ مدیر سیستم برمی‌آید.' },
      { status: 403 },
    );
  }

  let owner = await userByMobile(v.data.mobile);
  let registeredNewCustomer = false;
  if (!owner) {
    if (!v.data.customerName) {
      return NextResponse.json(
        { error: 'not_found', message: 'کاربری با این موبایل ثبت‌نام نکرده است. برای ثبت مشتری جدید، نام او را هم وارد کنید.' },
        { status: 404 },
      );
    }
    owner = await createUser({ mobile: v.data.mobile, name: v.data.customerName });
    registeredNewCustomer = true;
  }

  const ref = await nextRef('WH');
  const item = await createWarehouseItem({
    ref,
    userId: owner.id,
    product: v.data.product,
    sizeLabel: v.data.sizeLabel,
    quantityTons: v.data.quantityTons,
    monthlyFeeToman: v.data.monthlyFeeToman,
    arrivedAt: v.data.arrivedAt ? new Date(v.data.arrivedAt) : undefined,
    location: v.data.location,
    receivedBy: auth.session.id,
    intakeNote: v.data.intakeNote,
    contractRef: v.data.contractRef,
    insured: v.data.insured,
    leadId: v.data.leadId,
    requestId: v.data.requestId,
    actorId: auth.session.id,
  });
  // W21: the piece that was missing entirely — a warehouse item created
  // FROM a request (via the admin intake queue) must close the loop on that
  // request, or it sits "submitted" forever even after the goods physically
  // arrived. Best-effort: a bad/stale requestId just no-ops (updateRequestStatus
  // returns null), it must never fail the intake itself.
  if (v.data.requestId) {
    await updateRequestStatus(v.data.requestId, 'fulfilled');
  }
  await audit(auth.session.id, 'warehouse.create', { type: 'warehouseItem', id: item.id }, null, {
    ...v.data,
    customerId: owner.id,
    registeredNewCustomer,
  });
  return NextResponse.json({ item, customer: { id: owner.id, name: owner.name, mobile: owner.mobile }, registeredNewCustomer }, { status: 201 });
}

export const GET = withApiErrorHandling(GETImpl);
export const POST = withApiErrorHandling(POSTImpl);
