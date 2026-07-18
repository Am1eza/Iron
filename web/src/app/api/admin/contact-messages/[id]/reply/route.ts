import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { getDb } from '@/lib/server/db/client';
import { contactMessages } from '@/lib/server/db/schema';
import { replyToContactMessage } from '@/lib/server/repos/contactMessagesRepo';
import { sendSms } from '@/lib/server/integrations/smsir';

const payload = z.object({ reply: z.string().trim().min(1).max(500) });

/** POST /api/admin/contact-messages/{id}/reply — reply-in-place (US-19.5):
 *  sends the staff member's reply to the sender's mobile via SMS, records
 *  it on the message, and marks the message handled. */
async function POSTImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;

  const existingRows = await getDb().select().from(contactMessages).where(eq(contactMessages.id, id)).limit(1);
  const existing = existingRows[0];
  if (!existing) return NextResponse.json({ error: 'not_found', message: 'پیام یافت نشد.' }, { status: 404 });

  const message = await replyToContactMessage(id, v.data.reply);
  if (!message) return NextResponse.json({ error: 'not_found', message: 'پیام یافت نشد.' }, { status: 404 });

  await sendSms(existing.mobile, `آهن‌تایم: ${v.data.reply}`, 'generic');
  await audit(auth.session.id, 'contact.reply', { type: 'contactMessage', id }, null, { reply: v.data.reply });
  return NextResponse.json({ message });
}

export const POST = withApiErrorHandling(POSTImpl);
