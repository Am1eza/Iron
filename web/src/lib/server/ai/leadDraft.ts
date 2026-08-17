/**
 * Pending پیش‌فاکتور drafts from the AI advisor.
 *
 * The advisor never files a lead on its own any more: it PREPARES a priced
 * draft, the client renders it as a summary card, and the visitor presses
 * «تأیید و ثبت درخواست» (POST /api/ai/lead/confirm) to actually create the
 * lead + fire the SMS. This module is the short-lived handoff between the two
 * requests — the confirm route must not trust a client-sent item list, so the
 * items are stored server-side and the client only ever holds an opaque id.
 *
 * Storage is Redis when configured (multi-instance safe) with an in-process
 * Map as the fallback/fast path — the Docker deploy is one long-lived Node
 * process, and a lost draft only costs the visitor one extra tap.
 */
import { ulid } from 'ulid';
import { cacheGetJson, cacheSetJson, cacheDel } from '@/lib/server/redis';

/** Long enough for a login round trip, short enough that a stale price
 *  snapshot is never confirmed hours later (the lead re-prices on confirm). */
export const DRAFT_TTL_SECONDS = 30 * 60;

export interface DraftItem {
  skuId: string;
  qty: number;
  unit: 'kg' | 'branch' | 'sheet' | 'meter';
}

export interface LeadDraft {
  id: string;
  items: DraftItem[];
  conversationId?: string;
  /** The chat that produced this draft — persisted into the lead for sales. */
  transcript?: Array<{ role: string; content: string }>;
  /** Owner at prepare time, when the visitor was already signed in. A draft
   *  prepared anonymously is confirmable by whoever signs in from that chat
   *  (that IS the login-then-continue flow); one prepared while signed in
   *  may only be confirmed by the same account. */
  userId?: string;
  createdAt: number;
}

const key = (id: string) => `ai-lead-draft:${id}`;

const memory = new Map<string, { draft: LeadDraft; expiresAt: number }>();

function memoryGet(id: string): LeadDraft | null {
  const hit = memory.get(id);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    memory.delete(id);
    return null;
  }
  return hit.draft;
}

/** Keep the fallback Map from growing without bound on a long-lived process. */
function sweepMemory(): void {
  const now = Date.now();
  for (const [id, hit] of memory) if (hit.expiresAt < now) memory.delete(id);
}

export async function putDraft(draft: Omit<LeadDraft, 'id' | 'createdAt'>): Promise<LeadDraft> {
  const full: LeadDraft = { ...draft, id: ulid(), createdAt: Date.now() };
  sweepMemory();
  memory.set(full.id, { draft: full, expiresAt: Date.now() + DRAFT_TTL_SECONDS * 1000 });
  await cacheSetJson(key(full.id), full, DRAFT_TTL_SECONDS).catch(() => {
    /* memory copy still serves this instance */
  });
  return full;
}

export async function getDraft(id: string): Promise<LeadDraft | null> {
  return memoryGet(id) ?? (await cacheGetJson<LeadDraft>(key(id)).catch(() => null));
}

/** Single-use: a confirmed draft must not be replayable into a second lead
 *  (each one sends a real SMS and lands on a rep's desk). */
export async function consumeDraft(id: string): Promise<LeadDraft | null> {
  const draft = await getDraft(id);
  if (!draft) return null;
  memory.delete(id);
  await cacheDel(key(id)).catch(() => {
    /* best effort */
  });
  return draft;
}
