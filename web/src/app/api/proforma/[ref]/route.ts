import { NextResponse } from 'next/server';
import { requireDb } from '@/lib/server/utils/apiGuard';
import { findProformaByRef } from '@/lib/server/repos/leadsRepo';

/** GET /api/proforma/{ref} — the issued پیش‌فاکتور (lazy-expires on read). */
export async function GET(_req: Request, ctx: { params: Promise<{ ref: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const { ref } = await ctx.params;
  const p = await findProformaByRef(decodeURIComponent(ref).toUpperCase());
  if (!p) {
    return NextResponse.json({ error: 'not_found', message: 'پیش‌فاکتور یافت نشد.' }, { status: 404 });
  }
  return NextResponse.json(
    {
      proforma: {
        ref: p.ref,
        lines: p.lines,
        subtotal: p.subtotal,
        vatRate: p.vatRate,
        vatAmount: p.vatAmount,
        total: p.total,
        validUntil: p.validUntil.toISOString(),
        status: p.status,
        createdAt: p.createdAt.toISOString(),
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
