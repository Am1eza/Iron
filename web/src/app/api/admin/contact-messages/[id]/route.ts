import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { getDb } from '@/lib/server/db/client';
import { contactMessages } from '@/lib/server/db/schema';

const payload = z.object({ status: z.enum(['new', 'handled']) });

/** PATCH /api/admin/contact-messages/{id} — mark handled. */
async function PATCHImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;
  const rows = await getDb().update(contactMessages).set({ status: v.data.status }).where(eq(contactMessages.id, id)).returning();
  if (!rows[0]) return NextResponse.json({ error: 'not_found', message: 'پیام یافت نشد.' }, { status: 404 });
  await audit(auth.session.id, 'contact.status', { type: 'contactMessage', id }, null, v.data);
  return NextResponse.json({ message: rows[0] });
}

export const PATCH = withApiErrorHandling(PATCHImpl);
