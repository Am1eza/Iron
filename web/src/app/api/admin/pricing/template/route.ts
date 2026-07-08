import { type NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { asc, eq } from 'drizzle-orm';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { getDb } from '@/lib/server/db/client';
import { skus, currentPrices, subCategories } from '@/lib/server/db/schema';

export const runtime = 'nodejs';

/**
 * GET /api/admin/pricing/template — the Excel pricing template: every active
 * SKU with its current price pre-filled. The admin edits the «قیمت» column and
 * uploads the same file back (POST /api/admin/pricing/import).
 */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'pricing:write');
  if ('response' in auth) return auth.response;

  const rows = await getDb()
    .select({
      id: skus.id,
      name: skus.name,
      factory: skus.factory,
      size: skus.size,
      sub: subCategories.name,
      price: currentPrices.price,
    })
    .from(skus)
    .innerJoin(subCategories, eq(subCategories.id, skus.subCategoryId))
    .leftJoin(currentPrices, eq(currentPrices.skuId, skus.id))
    .where(eq(skus.isActive, true))
    .orderBy(asc(skus.categoryId), asc(skus.subCategoryId), asc(skus.name));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('قیمت‌ها', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'کد کالا', key: 'id', width: 30 },
    { header: 'نام کالا', key: 'name', width: 42 },
    { header: 'دسته', key: 'sub', width: 22 },
    { header: 'کارخانه', key: 'factory', width: 20 },
    { header: 'سایز', key: 'size', width: 12 },
    { header: 'قیمت', key: 'price', width: 16 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    ws.addRow({ id: r.id, name: r.name, sub: r.sub, factory: r.factory ?? '', size: r.size ?? '', price: r.price ?? '' });
  }
  ws.getColumn('price').numFmt = '#,##0';

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="ahantime-prices.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}

export const GET = withApiErrorHandling(GETImpl);
