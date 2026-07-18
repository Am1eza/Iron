/** The contact-form inbox («تماس با ما» / homepage contact widget) — admin-only reads. */
import { desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { contactMessages } from '@/lib/server/db/schema';

export type ContactMessageRow = typeof contactMessages.$inferSelect;

/** Paginated (was a flat `limit(100)` with no `page`/`offset` at all — the
 *  101st message was silently invisible). Same count(*)+limit+offset
 *  convention as adminListLeads/adminListRequests/adminListOrders. */
export async function adminListContactMessages(query: {
  status?: ContactMessageRow['status'];
  page?: number;
  perPage?: number;
}): Promise<{ messages: ContactMessageRow[]; total: number }> {
  const db = getDb();
  const page = query.page ?? 1;
  const perPage = query.perPage ?? 50;
  const where = query.status ? eq(contactMessages.status, query.status) : undefined;
  const [rows, total] = await Promise.all([
    db
      .select()
      .from(contactMessages)
      .where(where)
      .orderBy(desc(contactMessages.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ n: sql<number>`count(*)::int` }).from(contactMessages).where(where),
  ]);
  return { messages: rows, total: total[0]?.n ?? 0 };
}

/** Records a reply and marks the message handled (US-19.5) — the actual SMS
 *  send happens in the route handler (keeps this repo free of the sms
 *  integration import, same separation as leads.service.ts). */
export async function replyToContactMessage(id: string, reply: string): Promise<ContactMessageRow | null> {
  const rows = await getDb()
    .update(contactMessages)
    .set({ reply, repliedAt: new Date(), status: 'handled' })
    .where(eq(contactMessages.id, id))
    .returning();
  return rows[0] ?? null;
}
