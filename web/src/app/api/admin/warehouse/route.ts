import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { adminListWarehouse, createWarehouseItem } from '@/lib/server/repos/ordersRepo';
import { userByMobile } from '@/lib/auth/store';
import { nextRef } from '@/lib/server/utils/refs';
import { finiteNumber } from '@/lib/validation/utils';

/** GET /api/admin/warehouse — all consigned stock. */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:read');
  if ('response' in auth) return auth.response;
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? 1) || 1);
  const result = await adminListWarehouse({ page });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}

const createPayload = z.object({
  mobile: z.string().regex(/^09\d{9}$/, 'شمارهٔ موبایل نامعتبر است.'),
  product: z.string().trim().min(1).max(160),
  sizeLabel: z.string().trim().max(60).optional(),
  quantityTons: finiteNumber.positive().max(100000),
  monthlyFeeToman: finiteNumber.min(0).max(1e12).optional(),
});

/** POST /api/admin/warehouse — receive a customer's stock (assign by mobile). */
async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:write');
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, createPayload);
  if (!v.ok) return v.response;
  const owner = await userByMobile(v.data.mobile);
  if (!owner) {
    return NextResponse.json(
      { error: 'not_found', message: 'کاربری با این موبایل ثبت‌نام نکرده است.' },
      { status: 404 },
    );
  }
  const ref = await nextRef('WH');
  const item = await createWarehouseItem({
    ref,
    userId: owner.id,
    product: v.data.product,
    sizeLabel: v.data.sizeLabel,
    quantityTons: v.data.quantityTons,
    monthlyFeeToman: v.data.monthlyFeeToman,
  });
  await audit(auth.session.id, 'warehouse.create', { type: 'warehouseItem', id: item.id }, null, v.data);
  return NextResponse.json({ item }, { status: 201 });
}

export const GET = withApiErrorHandling(GETImpl);
export const POST = withApiErrorHandling(POSTImpl);
