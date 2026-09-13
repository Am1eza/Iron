/**
 * Pending price-alert drafts from the AI advisor (J-223).
 *
 * `setPriceAlert` used to be the ONE model tool that wrote a real row to the
 * database with no confirmation step: asking the advisor a question could
 * arm a real SMS alert on the visitor's account, and the visitor might never
 * realise "just asking" had signed them up for messages. Every other write
 * path in this advisor already goes through an explicit human confirmation
 * (see leadDraft.ts + /api/ai/lead/confirm) — this is the same handoff, for
 * the same reason, in the same shape.
 *
 * Storage mirrors `leadDraft.ts` exactly: Redis when configured
 * (multi-instance safe), an in-process Map as the fallback/fast path. A lost
 * draft costs the visitor one extra tap and nothing else.
 */
import { ulid } from 'ulid';
import { cacheGetJson, cacheSetJson, cacheDel } from '@/lib/server/redis';

/** Same window as a lead draft: long enough for a login round trip, short
 *  enough that an alert is never armed against an hours-old price snapshot. */
export const ALERT_DRAFT_TTL_SECONDS = 30 * 60;

export interface AlertDraft {
  id: string;
  skuId: string;
  /** Shown on the card so the visitor confirms a PRODUCT, not an opaque id. */
  productName: string;
  op: 'below' | 'above';
  threshold: number;
  /** Owner at prepare time. `setPriceAlert` already refuses to draft for an
   *  anonymous visitor (an alert is an SMS promise and needs an account), so
   *  unlike a lead draft this is always set — and the confirm route still
   *  re-checks it against the live session rather than trusting it. */
  userId: string;
  conversationId?: string;
  createdAt: number;
}

const key = (id: string) => `ai-alert-draft:${id}`;

const memory = new Map<string, { draft: AlertDraft; expiresAt: number }>();

function memoryGet(id: string): AlertDraft | null {
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

export async function putAlertDraft(draft: Omit<AlertDraft, 'id' | 'createdAt'>): Promise<AlertDraft> {
  const full: AlertDraft = { ...draft, id: ulid(), createdAt: Date.now() };
  sweepMemory();
  memory.set(full.id, { draft: full, expiresAt: Date.now() + ALERT_DRAFT_TTL_SECONDS * 1000 });
  await cacheSetJson(key(full.id), full, ALERT_DRAFT_TTL_SECONDS).catch(() => {
    /* memory copy still serves this instance */
  });
  return full;
}

export async function getAlertDraft(id: string): Promise<AlertDraft | null> {
  return memoryGet(id) ?? (await cacheGetJson<AlertDraft>(key(id)).catch(() => null));
}

/** Single-use, for the same reason a lead draft is: a confirmed alert is a
 *  real row that will send real SMS, and a replayed confirmation must not be
 *  able to arm it twice. */
export async function consumeAlertDraft(id: string): Promise<AlertDraft | null> {
  const draft = await getAlertDraft(id);
  if (!draft) return null;
  memory.delete(id);
  await cacheDel(key(id)).catch(() => {
    /* best effort */
  });
  return draft;
}
