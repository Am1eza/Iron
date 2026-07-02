/**
 * Leads + proformas — the conversion spine's persistence. Lead items snapshot
 * name/price at creation; issued proformas freeze lines as jsonb.
 */
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { leads, leadItems, leadNotes, proformas } from '@/lib/server/db/schema';
import type { LineItem } from '@/lib/types/domain';

export type LeadRow = typeof leads.$inferSelect;
export type LeadItemRow = typeof leadItems.$inferSelect;
export type ProformaRow = typeof proformas.$inferSelect;

export function toLineItem(r: LeadItemRow): LineItem {
  return {
    skuId: r.skuId ?? '',
    name: r.name,
    qty: r.qty,
    unit: r.unit,
    weightKg: r.weightKg ?? undefined,
    unitPrice: r.unitPrice ?? undefined,
    lineTotal: r.lineTotal ?? undefined,
  };
}

export async function insertLead(input: {
  ref: string;
  userId?: string;
  contactName?: string;
  contactMobile: string;
  contactVerified: boolean;
  source: LeadRow['source'];
  cooperationType?: LeadRow['cooperationType'];
  context?: LeadRow['context'];
  channelPref?: LeadRow['channelPref'];
  items: Array<Omit<LineItem, 'skuId'> & { skuId?: string }>;
}): Promise<LeadRow> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(leads)
      .values({
        id: ulid(),
        ref: input.ref,
        userId: input.userId ?? null,
        contactName: input.contactName ?? null,
        contactMobile: input.contactMobile,
        contactVerified: input.contactVerified,
        source: input.source,
        cooperationType: input.cooperationType ?? null,
        context: input.context ?? null,
        channelPref: input.channelPref ?? 'sms',
      })
      .returning();
    const lead = inserted[0]!;
    if (input.items.length > 0) {
      await tx.insert(leadItems).values(
        input.items.map((item, i) => ({
          id: ulid(),
          leadId: lead.id,
          skuId: item.skuId ?? null,
          name: item.name,
          qty: item.qty,
          unit: item.unit,
          weightKg: item.weightKg ?? null,
          unitPrice: item.unitPrice ?? null,
          lineTotal: item.lineTotal ?? null,
          order: i,
        })),
      );
    }
    return lead;
  });
}

export async function leadItemsOf(leadId: string): Promise<LeadItemRow[]> {
  return getDb().select().from(leadItems).where(eq(leadItems.leadId, leadId)).orderBy(leadItems.order);
}

export async function findLead(id: string): Promise<LeadRow | null> {
  const rows = await getDb().select().from(leads).where(eq(leads.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function leadsForUser(userId: string, mobile: string) {
  return getDb()
    .select()
    .from(leads)
    .where(or(eq(leads.userId, userId), eq(leads.contactMobile, mobile)))
    .orderBy(desc(leads.createdAt))
    .limit(100);
}

export async function updateLead(
  id: string,
  patch: Partial<{
    status: LeadRow['status'];
    assigneeId: string | null;
    callbackAt: Date | null;
    contactVerified: boolean;
  }>,
): Promise<LeadRow | null> {
  const rows = await getDb()
    .update(leads)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(leads.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function addLeadNote(leadId: string, authorId: string, text: string) {
  const rows = await getDb()
    .insert(leadNotes)
    .values({ id: ulid(), leadId, authorId, text })
    .returning();
  return rows[0]!;
}

export async function leadNotesOf(leadId: string) {
  return getDb().select().from(leadNotes).where(eq(leadNotes.leadId, leadId)).orderBy(desc(leadNotes.at));
}

export async function adminListLeads(query: {
  status?: LeadRow['status'];
  assigneeId?: string;
  q?: string;
  page?: number;
  perPage?: number;
}) {
  const db = getDb();
  const page = query.page ?? 1;
  const perPage = query.perPage ?? 30;
  const conds = [];
  if (query.status) conds.push(eq(leads.status, query.status));
  if (query.assigneeId) conds.push(eq(leads.assigneeId, query.assigneeId));
  if (query.q) {
    conds.push(
      or(ilike(leads.ref, `%${query.q}%`), ilike(leads.contactMobile, `%${query.q}%`), ilike(leads.contactName, `%${query.q}%`)),
    );
  }
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db
    .select()
    .from(leads)
    .where(where)
    .orderBy(desc(leads.createdAt))
    .limit(perPage)
    .offset((page - 1) * perPage);
  const total = await db.select({ n: sql<number>`count(*)::int` }).from(leads).where(where);
  return { leads: rows, total: total[0]?.n ?? 0 };
}

/* ------------------------------ proformas ------------------------------ */

export async function insertProforma(input: {
  leadId: string;
  ref: string;
  lines: LineItem[];
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  validUntil: Date;
}): Promise<ProformaRow> {
  const rows = await getDb()
    .insert(proformas)
    .values({ id: ulid(), status: 'active', ...input })
    .returning();
  return rows[0]!;
}

export async function findProformaByRef(ref: string): Promise<ProformaRow | null> {
  const rows = await getDb().select().from(proformas).where(eq(proformas.ref, ref)).limit(1);
  const p = rows[0];
  if (!p) return null;
  // Lazy expiry — the job also sweeps, this guarantees read correctness.
  if (p.status === 'active' && p.validUntil.getTime() < Date.now()) {
    await getDb().update(proformas).set({ status: 'expired' }).where(eq(proformas.id, p.id));
    return { ...p, status: 'expired' };
  }
  return p;
}

export async function proformasOfLead(leadId: string): Promise<ProformaRow[]> {
  return getDb().select().from(proformas).where(eq(proformas.leadId, leadId)).orderBy(desc(proformas.createdAt));
}

export async function expireDueProformas(): Promise<number> {
  const rows = await getDb()
    .update(proformas)
    .set({ status: 'expired' })
    .where(and(eq(proformas.status, 'active'), sql`${proformas.validUntil} < now()`))
    .returning({ id: proformas.id });
  return rows.length;
}
