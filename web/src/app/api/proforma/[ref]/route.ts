import { NextResponse, type NextRequest } from 'next/server';
import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { findProformaByRef } from '@/lib/server/repos/leadsRepo';
import { rateLimit } from '@/lib/server/utils/rateLimit';

/**
 * GET /api/proforma/{ref} — the issued پیش‌فاکتور (lazy-expires on read).
 * The ref is a bearer capability (unauthenticated lookup) — it carries real
 * entropy (see refs.ts), and this endpoint is throttled as defense in depth.
 */
async function GETImpl(req: NextRequest, ctx: { params: Promise<{ ref: string }> }) {
  const limited = rateLimit(req, 'proforma', { limit: 20, windowMs: 60_000 });
  if (limited) return limited;
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

export const GET = withApiErrorHandling(GETImpl);
