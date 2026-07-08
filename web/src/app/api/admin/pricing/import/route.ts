import { NextResponse, type NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { eq } from 'drizzle-orm';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { getDb } from '@/lib/server/db/client';
import { skus, currentPrices } from '@/lib/server/db/schema';
import { normalizeDigits } from '@/lib/utils/format';

export const runtime = 'nodejs';

/** Loose text normalizer for name matching: Persian/Arabic digits → Latin,
 *  Arabic ي/ك → Persian ی/ک, ZWNJ → space, collapse whitespace. */
function norm(s: string): string {
  return normalizeDigits(String(s))
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/‌/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Parse a price cell: accepts numbers, "۱۲٬۵۰۰", "12,500", "12500 تومان". */
function parsePrice(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.round(v);
  const cleaned = normalizeDigits(String(v ?? '')).replace(/[٬,\s]|تومان|ریال/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 && n <= 1e13 ? Math.round(n) : null;
}

interface MatchedRow {
  skuId: string;
  name: string;
  currentPrice: number | null;
  newPrice: number;
}
interface UnmatchedRow {
  row: number;
  name: string;
  reason: string;
}

/**
 * POST /api/admin/pricing/import — parse an uploaded Excel file and match its
 * rows against the SKU catalog. READ-ONLY: returns a preview
 * {matched, unmatched}; the client confirms and saves through the existing
 * bulk PUT /api/admin/pricing (movement + history + audit all reused).
 *
 * Accepted columns (header row required): «کد کالا» (sku id, optional) ·
 * «نام کالا» · «قیمت». Extra columns are ignored. Matching: by کد کالا when
 * present, else exact normalized-name match.
 */
async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'pricing:write');
  if ('response' in auth) return auth.response;

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'no_file', message: 'فایل اکسل ارسال نشده است.' }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'too_large', message: 'حجم فایل حداکثر ۵ مگابایت.' }, { status: 400 });
  }

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    return NextResponse.json(
      { error: 'bad_file', message: 'فایل قابل خواندن نیست — فرمت باید xlsx باشد (قالب را دانلود کنید).' },
      { status: 400 },
    );
  }
  const ws = wb.worksheets[0];
  if (!ws) return NextResponse.json({ error: 'empty', message: 'فایل خالی است.' }, { status: 400 });

  // Header detection: find the columns by header text (row 1).
  const headers = new Map<string, number>();
  ws.getRow(1).eachCell((cell, col) => headers.set(norm(String(cell.value ?? '')), col));
  const idCol = headers.get('کد کالا') ?? headers.get('sku') ?? headers.get('id');
  const nameCol = headers.get('نام کالا') ?? headers.get('نام') ?? headers.get('name');
  const priceCol = headers.get('قیمت') ?? headers.get('قیمت (تومان)') ?? headers.get('price');
  if (!priceCol || (!idCol && !nameCol)) {
    return NextResponse.json(
      { error: 'bad_headers', message: 'ستون‌های لازم پیدا نشد. سطر اول باید «نام کالا» و «قیمت» (و در صورت تمایل «کد کالا») باشد.' },
      { status: 400 },
    );
  }

  // Catalog lookup maps (id → sku, normalized name → sku).
  const db = getDb();
  const all = await db
    .select({ id: skus.id, name: skus.name, isActive: skus.isActive, price: currentPrices.price })
    .from(skus)
    .leftJoin(currentPrices, eq(currentPrices.skuId, skus.id));
  const byId = new Map(all.map((s) => [s.id, s]));
  const byName = new Map(all.map((s) => [norm(s.name), s]));

  const matched: MatchedRow[] = [];
  const unmatched: UnmatchedRow[] = [];
  const seen = new Set<string>();

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const rawName = nameCol ? String(row.getCell(nameCol).value ?? '').trim() : '';
    const rawId = idCol ? String(row.getCell(idCol).value ?? '').trim() : '';
    if (!rawName && !rawId) return; // blank row
    const price = parsePrice(row.getCell(priceCol).value);
    if (price === null) {
      unmatched.push({ row: rowNumber, name: rawName || rawId, reason: 'قیمت نامعتبر' });
      return;
    }
    const sku = (rawId && byId.get(rawId)) || (rawName && byName.get(norm(rawName))) || null;
    if (!sku) {
      unmatched.push({ row: rowNumber, name: rawName || rawId, reason: 'کالا در کاتالوگ پیدا نشد' });
      return;
    }
    if (seen.has(sku.id)) {
      unmatched.push({ row: rowNumber, name: rawName || sku.name, reason: 'ردیف تکراری در فایل' });
      return;
    }
    seen.add(sku.id);
    matched.push({ skuId: sku.id, name: sku.name, currentPrice: sku.price ?? null, newPrice: price });
  });

  return NextResponse.json({ matched, unmatched, total: matched.length + unmatched.length });
}

export const POST = withApiErrorHandling(POSTImpl);
