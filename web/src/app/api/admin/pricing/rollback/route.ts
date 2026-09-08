import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { PriceVersionConflictError, SkuNotFoundError, rollbackPrice } from '@/lib/server/services/pricing.service';
import { safeRevalidatePath } from '@/lib/server/utils/revalidate';

const bodySchema = z.object({
  skuId: z.string().min(1).max(120),
  targetVersion: z.string().min(1).max(120),
  expectedCurrentVersion: z.string().min(1).max(120),
});

async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'pricing:write');
  if ('response' in auth) return auth.response;
  const body = await validateBody(req, bodySchema);
  if (!body.ok) return body.response;
  let result;
  try {
    result = await rollbackPrice(auth.session.id, body.data);
  } catch (error) {
    if (error instanceof PriceVersionConflictError) return NextResponse.json({ error: 'price_conflict', message: 'قیمت در این فاصله تغییر کرده است؛ صفحه را تازه کنید.' }, { status: 409 });
    if (error instanceof SkuNotFoundError) return NextResponse.json({ error: 'history_not_found', message: 'نسخهٔ تاریخی قیمت پیدا نشد.' }, { status: 404 });
    throw error;
  }
  safeRevalidatePath('/prices', 'layout');
  safeRevalidatePath('/', 'page');
  return NextResponse.json(result);
}

export const POST = withApiErrorHandling(POSTImpl);
