/**
 * J-245 (the remaining half): `errors/scrub.ts#scrubPii` catches a mobile
 * number or email by SHAPE — a free-text name has none, which is why the
 * original J-245 fix (aiCorrectionsRepo.ts/aiEvalCandidatesRepo.ts) honestly
 * disclosed it as uncaught. This closes the highest-likelihood remaining
 * case: a correction/eval-candidate is always sourced from ONE specific,
 * known conversation, and that conversation's owner has a stored account
 * name — so instead of guessing at names in general, redact exactly the
 * name we already know is theirs.
 *
 * This does not catch every name a customer could type (a colleague's name,
 * a delivery recipient different from the account holder) — no regex could
 * either. It reliably catches the account holder's OWN name, which is
 * exactly what J-242 identified as the PII this system already treats as
 * sensitive enough to never send to the AI relay in the first place.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { aiMessages, aiConversations, users } from '@/lib/server/db/schema';

/** Every known name-shaped string for a conversation's owner, longest first
 *  so a full name is redacted before a bare first name could partially eat
 *  into it and leave an orphaned last name behind. Empty for a guest
 *  conversation (`userId` null) or one already gone. */
export async function namesForConversation(conversationId: string): Promise<string[]> {
  try {
    const rows = await getDb()
      .select({ name: users.name, firstName: users.firstName, lastName: users.lastName })
      .from(aiConversations)
      .innerJoin(users, eq(users.id, aiConversations.userId))
      .where(eq(aiConversations.id, conversationId))
      .limit(1);
    const u = rows[0];
    if (!u) return [];
    const full = u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : undefined;
    const candidates = [u.name, full, u.firstName, u.lastName]
      .map((n) => n?.trim())
      .filter((n): n is string => Boolean(n && n.length >= 2));
    return [...new Set(candidates)].sort((a, b) => b.length - a.length);
  } catch {
    return [];
  }
}

/** `sourceMessageId` (createCorrection's only handle on the conversation) is
 *  one join away from it. */
export async function conversationIdForMessage(messageId: string): Promise<string | null> {
  try {
    const rows = await getDb()
      .select({ conversationId: aiMessages.conversationId })
      .from(aiMessages)
      .where(eq(aiMessages.id, messageId))
      .limit(1);
    return rows[0]?.conversationId ?? null;
  } catch {
    return null;
  }
}

/** Redact every literal occurrence of each known name — case-sensitive on
 *  purpose (Persian has no case, and a case-INsensitive Persian match would
 *  need locale-aware folding this doesn't attempt), longest names first so a
 *  full name is consumed whole rather than leaving its second half exposed
 *  after the first half already matched a shorter candidate. */
export function scrubKnownNames<T extends string>(text: T, names: readonly string[]): T {
  if (names.length === 0) return text;
  let out: string = text;
  for (const name of names) {
    if (!name) continue;
    out = out.split(name).join('[redacted-name]');
  }
  return out as T;
}
