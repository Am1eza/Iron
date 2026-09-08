// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { NextRequest } from 'next/server';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
vi.mock('@/lib/server/utils/apiGuard', () => ({
  requireDb: () => null,
  requireApiPermission: async () => ({ session: { id: 'test-admin' } }),
  withApiErrorHandling: (handler: unknown) => handler,
}));
import { POST } from './route';

let close: () => Promise<void>;
beforeAll(async () => {
  const test = await createTestDb();
  close = test.close;
  await test.db.insert(schema.categories).values({ id: 'c', slug: 'c', name: 'میلگرد' });
  await test.db.insert(schema.subCategories).values({ id: 's', categoryId: 'c', slug: 's', name: 'آجدار' });
  await test.db.insert(schema.skus).values([
    { id: 'a', slug: 'a', name: 'میلگرد', size: '14', categoryId: 'c', subCategoryId: 's', unit: 'kg' },
    { id: 'b', slug: 'b', name: 'میلگرد', size: '16', categoryId: 'c', subCategoryId: 's', unit: 'kg' },
  ]);
}, 120000);
afterAll(async () => { await close(); });

async function preview(rows: ExcelJS.CellValue[][], version?: string) {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('prices').addRows(rows);
  if (version) wb.addWorksheet('_ahantime_meta').addRows([['template', 'ahantime-pricing'], ['version', version], ['currency', 'TOMAN']]);
  const bytes = await wb.xlsx.writeBuffer();
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)]), 'prices.xlsx');
  return POST(new NextRequest('http://localhost/api/admin/pricing/import', { method: 'POST', body: form }));
}

describe('Excel import identity and currency safety', () => {
  it('matches reordered columns by exact ID', async () => {
    const response = await preview([['قیمت', 'کد کالا'], ['۱۲٬۵۰۰ تومان', 'a']]);
    expect((await response.json()).matched).toMatchObject([{ skuId: 'a', newPrice: 12500 }]);
  });
  it('never chooses between products sharing a display name', async () => {
    const response = await preview([['نام کالا', 'قیمت'], ['میلگرد', 12500]]);
    const result = await response.json();
    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
  });
  it('never falls back from an invalid ID to a name', async () => {
    const response = await preview([['کد کالا', 'نام کالا', 'قیمت'], ['missing', 'میلگرد', 12500]]);
    expect((await response.json()).matched).toHaveLength(0);
  });
  it('rejects conflicting ID/name and all duplicate SKU occurrences', async () => {
    const response = await preview([['کد کالا', 'نام کالا', 'قیمت'], ['a', 'ورق', 12500], ['b', 'میلگرد', 12500], ['b', 'میلگرد', 13000]]);
    expect((await response.json()).matched).toHaveLength(0);
  });
  it('rejects Rial and cached formula results', async () => {
    const response = await preview([['کد کالا', 'قیمت'], ['a', '12500 ریال'], ['b', { formula: '12500+1', result: 12501 }]]);
    const result = await response.json();
    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(2);
  });
  it('rejects ambiguous price column aliases', async () => {
    const response = await preview([['کد کالا', 'قیمت', 'price'], ['a', 12500, 13000]]);
    expect(response.status).toBe(400);
  });
  it('accepts the current template and rejects an unknown version', async () => {
    expect((await preview([['کد کالا', 'قیمت'], ['a', 12500]], '2')).status).toBe(200);
    expect((await preview([['کد کالا', 'قیمت'], ['a', 12500]], '999')).status).toBe(400);
  });
});
