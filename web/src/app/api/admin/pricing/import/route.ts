import { readFormBody } from '@/lib/server/utils/requestBody';
import { NextResponse, type NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { eq } from 'drizzle-orm';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { getDb } from '@/lib/server/db/client';
import { skus, currentPrices } from '@/lib/server/db/schema';
import { normalizeDigits } from '@/lib/utils/format';
import { parsePriceToman } from '@/lib/utils/priceValidation';
import { PRICING_TEMPLATE_META_SHEET, PRICING_TEMPLATE_VERSION } from '@/lib/utils/pricingWorkbook';

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

  const form = await readFormBody(req);
  const file = form?.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json(
      { error: 'no_file', message: 'فایل اکسل ارسال نشده است.' },
      { status: 400 },
    );
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json(
      { error: 'too_large', message: 'حجم فایل حداکثر ۵ مگابایت.' },
      { status: 400 },
    );
  }

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    return NextResponse.json(
      {
        error: 'bad_file',
        message: 'فایل قابل خواندن نیست — فرمت باید xlsx باشد (قالب را دانلود کنید).',
      },
      { status: 400 },
    );
  }
  const meta = wb.getWorksheet(PRICING_TEMPLATE_META_SHEET);
  if (meta) {
    const values = new Map<string, string>();
    meta.eachRow((row) => values.set(String(row.getCell(1).value ?? ''), String(row.getCell(2).value ?? '')));
    if (values.get('template') !== 'ahantime-pricing' || values.get('version') !== PRICING_TEMPLATE_VERSION || values.get('currency') !== 'TOMAN') {
      return NextResponse.json({ error: 'unsupported_template', message: 'نسخه یا واحد پول قالب پشتیبانی نمی‌شود؛ قالب تازه را دانلود کنید.' }, { status: 400 });
    }
  }
  const ws = wb.worksheets.find((sheet) => sheet.name !== PRICING_TEMPLATE_META_SHEET);
  if (!ws) return NextResponse.json({ error: 'empty', message: 'فایل خالی است.' }, { status: 400 });

  // Header detection: find the columns by header text (row 1).
  const headers = new Map<string, number>();
  let duplicateHeader = false;
  ws.getRow(1).eachCell((cell, col) => {
    const header = norm(String(cell.value ?? ''));
    if (headers.has(header)) duplicateHeader = true;
    headers.set(header, col);
  });
  const aliases = [['کد کالا', 'sku', 'id'], ['نام کالا', 'نام', 'name'], ['قیمت', 'قیمت (تومان)', 'price']];
  if (duplicateHeader || aliases.some((group) => group.filter((key) => headers.has(key)).length > 1)) {
    return NextResponse.json({ error: 'ambiguous_headers', message: 'ستون تکراری یا چند ستون هم‌معنی وجود دارد؛ از قالب استفاده کنید.' }, { status: 400 });
  }
  const idCol = headers.get('کد کالا') ?? headers.get('sku') ?? headers.get('id');
  const nameCol = headers.get('نام کالا') ?? headers.get('نام') ?? headers.get('name');
  const priceCol = headers.get('قیمت') ?? headers.get('قیمت (تومان)') ?? headers.get('price');
  if (!priceCol || (!idCol && !nameCol)) {
    return NextResponse.json(
      {
        error: 'bad_headers',
        message:
          'ستون‌های لازم پیدا نشد. سطر اول باید «نام کالا» و «قیمت» (و در صورت تمایل «کد کالا») باشد.',
      },
      { status: 400 },
    );
  }

  // Catalog lookup maps (id → sku, normalized name → sku). Every product that
  // exists is on the site, so any match here is a match the grid can also
  // show. The hazard this lookup used to guard against — a deactivated SKU
  // silently re-priced through the import path while invisible in the live
  // grid — needs a hidden state, and the catalog no longer has one.
  const db = getDb();
  const all = await db
    .select({ id: skus.id, name: skus.name, price: currentPrices.price })
    .from(skus)
    .leftJoin(currentPrices, eq(currentPrices.skuId, skus.id));
  const byId = new Map(all.map((s) => [s.id, s]));
  const byName = new Map<string, typeof all>();
  for (const sku of all) {
    const key = norm(sku.name);
    byName.set(key, [...(byName.get(key) ?? []), sku]);
  }

  const matched: MatchedRow[] = [];
  const unmatched: UnmatchedRow[] = [];
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const firstRows = new Map<string, number>();

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const rawName = nameCol ? String(row.getCell(nameCol).value ?? '').trim() : '';
    const rawId = idCol ? String(row.getCell(idCol).value ?? '').trim() : '';
    if (!rawName && !rawId) return; // blank row
    const price = parsePriceToman(row.getCell(priceCol).value);
    if (price === null) {
      unmatched.push({ row: rowNumber, name: rawName || rawId, reason: 'قیمت باید عدد صحیح مثبت به تومان باشد؛ ریال و فرمول پذیرفته نیست.' });
      return;
    }
    const nameMatches = byName.get(norm(rawName)) ?? [];
    if (!rawId && nameMatches.length > 1) {
      unmatched.push({ row: rowNumber, name: rawName, reason: 'نام کالا مشترک است؛ کد دقیق کالا را وارد کنید.' });
      return;
    }
    const sku = rawId ? byId.get(rawId) : nameMatches[0];
    if (!sku) {
      unmatched.push({
        row: rowNumber,
        name: rawName || rawId,
        reason: 'کالا در کاتالوگ پیدا نشد',
      });
      return;
    }
    if (rawId && rawName && norm(sku.name) !== norm(rawName)) {
      unmatched.push({ row: rowNumber, name: rawName, reason: 'کد و نام کالا با هم مطابقت ندارند.' });
      return;
    }
    if (seen.has(sku.id)) {
      duplicates.add(sku.id);
      unmatched.push({ row: rowNumber, name: rawName || sku.name, reason: 'ردیف تکراری در فایل' });
      return;
    }
    seen.add(sku.id);
    firstRows.set(sku.id, rowNumber);
    matched.push({
      skuId: sku.id,
      name: sku.name,
      currentPrice: sku.price ?? null,
      newPrice: price,
    });
  });

  // Neither conflicting occurrence may silently win, including the first.
  const accepted = matched.filter((row) => !duplicates.has(row.skuId));
  for (const row of matched) {
    if (duplicates.has(row.skuId)) unmatched.push({ row: firstRows.get(row.skuId)!, name: row.name, reason: 'ردیف تکراری؛ هیچ‌یک از قیمت‌های این کالا پذیرفته نشد.' });
  }
  unmatched.sort((a, b) => a.row - b.row);
  return NextResponse.json({ matched: accepted, unmatched, total: accepted.length + unmatched.length, templateVersion: meta ? PRICING_TEMPLATE_VERSION : 'legacy' });
}

export const POST = withApiErrorHandling(POSTImpl);
