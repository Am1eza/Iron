import { NextResponse } from 'next/server';
import { requireDb } from '@/lib/server/utils/apiGuard';
import { tableRows } from '@/lib/server/repos/catalogRepo';

/** GET /api/categories/{cat}/{sub} — the price table (Datasheet rows). */
export async function GET(_req: Request, ctx: { params: Promise<{ cat: string; sub: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const { cat, sub } = await ctx.params;
  const rows = await tableRows(decodeURIComponent(cat), decodeURIComponent(sub));
  return NextResponse.json(
    { rows },
    { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } },
  );
}
