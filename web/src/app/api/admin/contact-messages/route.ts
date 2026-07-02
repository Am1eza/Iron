import { NextResponse, type NextRequest } from 'next/server';
import { desc, eq, sql } from 'drizzle-orm';
import { requireApiPermission, requireDb } from '@/lib/server/utils/apiGuard';
import { getDb } from '@/lib/server/db/client';
import { contactMessages } from '@/lib/server/db/schema';

/** GET /api/admin/contact-messages?status= — the contact-form inbox. */
export async function GET(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:read');
  if ('response' in auth) return auth.response;
  const status = req.nextUrl.searchParams.get('status');
  const where = status === 'new' || status === 'handled' ? eq(contactMessages.status, status) : undefined;
  const db = getDb();
  const rows = await db.select().from(contactMessages).where(where).orderBy(desc(contactMessages.createdAt)).limit(100);
  const total = await db.select({ n: sql<number>`count(*)::int` }).from(contactMessages).where(where);
  return NextResponse.json({ messages: rows, total: total[0]?.n ?? 0 }, { headers: { 'Cache-Control': 'no-store' } });
}
