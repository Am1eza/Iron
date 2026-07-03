/**
 * AI conversation persistence + rolling summary (cost + memory).
 *
 * Every /api/ai/chat turn is stored (user message + the SANITIZED assistant
 * reply) under an `ai_conversations` row. Once a conversation grows past
 * SUMMARY_TRIGGER_COUNT stored messages, the OLDER turns are collapsed into a
 * compact Persian summary (≤SUMMARY_MAX_CHARS) via one cheap relay call with
 * NO tools — later requests inject that summary as a second system message so
 * long chats keep their memory without re-sending every turn.
 *
 * GROUNDING NOTE: the summary is context only. Numbers inside it are NEVER
 * added to the grounding ledger or the user-number whitelist — a price that
 * aged out into the summary cannot license a new claim; the model must call
 * the tool again (AC-D-3 stays intact).
 *
 * CACHE NOTE: AI_SYSTEM_PROMPT must remain the byte-identical FIRST message
 * (it is the DeepSeek prompt-cache prefix); the summary goes AFTER it.
 */
import { asc, eq, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { aiConversations, aiMessages } from '@/lib/server/db/schema';
import { streamCompletion, type ChatMessage } from '@/lib/server/integrations/deepseek';
import { AI_SYSTEM_PROMPT } from '@/lib/server/services/aiTools';

/** Stored-message count past which the older turns collapse into a summary. */
export const SUMMARY_TRIGGER_COUNT = 12;
/** The most recent turns stay verbatim (the client resends them anyway). */
export const SUMMARY_KEEP_RECENT = 6;
export const SUMMARY_MAX_CHARS = 400;

/** Fixed summarizer prompt — one cheap relay call, no tools. It explicitly
 *  forbids prices/amounts: the summary is memory, never a number source. */
const SUMMARY_SYSTEM_PROMPT =
  'تو خلاصه‌ساز گفتگو هستی. پیام‌های زیر بخش قدیمی گفتگوی یک خریدار آهن‌آلات با مشاور آهن‌تایم است. ' +
  'یک خلاصهٔ فارسی بسیار فشرده (حداکثر ۴۰۰ نویسه) از نیاز کاربر، محصول‌ها و سایزهای مطرح‌شده و توافق‌ها بنویس. ' +
  'هیچ قیمت یا مبلغ یا عددی ذکر نکن. فقط متن خلاصه را بنویس، بدون مقدمه.';

export interface ConversationRow {
  id: string;
  summary: string | null;
}

export type StoredMessage = { role: string; content: string };

/** One non-streaming-style completion: messages in, full text out. Injected
 *  into the summarizer so tests can script it without a relay. */
export type CompleteFn = (messages: ChatMessage[]) => Promise<string>;

/** Default CompleteFn — the real relay, no tools, its own short timeout (the
 *  summary refresh runs AFTER the user's answer; never let it linger). */
export const completeViaRelay: CompleteFn = async (messages) => {
  let text = '';
  const signal = AbortSignal.timeout(15_000);
  for await (const ev of streamCompletion(messages, [], signal)) {
    if (ev.type === 'token') text += ev.text;
  }
  return text;
};

/** Resolve an existing conversation or create a new row (userId from the
 *  session when present). A client-echoed id that no longer exists is
 *  re-created under the same id so its later turns still persist. */
export async function ensureConversation(
  id: string | undefined,
  userId: string | null,
): Promise<ConversationRow> {
  const db = getDb();
  if (id) {
    const rows = await db
      .select({ id: aiConversations.id, summary: aiConversations.summary })
      .from(aiConversations)
      .where(eq(aiConversations.id, id))
      .limit(1);
    if (rows[0]) return rows[0];
  }
  const newId = id ?? ulid();
  await db
    .insert(aiConversations)
    .values({ id: newId, userId })
    .onConflictDoNothing();
  return { id: newId, summary: null };
}

/**
 * Build the relay message list for one request. AI_SYSTEM_PROMPT is ALWAYS
 * the byte-identical first message (DeepSeek cache prefix); a non-empty
 * rolling summary rides as a SECOND system message right after it.
 */
export function buildChatMessages(
  clientMessages: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>,
  summary?: string | null,
): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: AI_SYSTEM_PROMPT }];
  if (summary && summary.trim()) {
    messages.push({ role: 'system', content: `خلاصهٔ گفتگو تا اینجا: ${summary.trim()}` });
  }
  for (const m of clientMessages) messages.push({ role: m.role, content: m.content });
  return messages;
}

/** Summarize the OLDER turns (folding in the previous summary) with one
 *  tool-less relay call. Pure over `complete`; null on any failure — the
 *  caller just skips the refresh, never breaks the chat. */
export async function summarizeMessages(
  older: ReadonlyArray<StoredMessage>,
  previousSummary: string | null,
  complete: CompleteFn,
): Promise<string | null> {
  if (older.length === 0) return previousSummary;
  try {
    const transcript = older
      .map((m) => `${m.role === 'user' ? 'کاربر' : 'مشاور'}: ${m.content}`)
      .join('\n');
    const text = await complete([
      { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
      {
        role: 'user',
        content: previousSummary
          ? `خلاصهٔ قبلی: ${previousSummary}\n\nادامهٔ گفتگو:\n${transcript}`
          : transcript,
      },
    ]);
    const trimmed = text.trim().slice(0, SUMMARY_MAX_CHARS);
    return trimmed || null;
  } catch {
    return null; // summary is best-effort — on failure just skip
  }
}

/**
 * Persist one completed turn (user message + sanitized assistant reply) and,
 * when the stored history exceeds SUMMARY_TRIGGER_COUNT, refresh the rolling
 * summary of the older messages. Throws only DB errors from the inserts —
 * callers fire-and-forget with a `.catch`.
 */
export async function persistTurn(
  conversationId: string,
  userText: string | null,
  assistantText: string | null,
  complete: CompleteFn = completeViaRelay,
): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const rows = [
    ...(userText && userText.trim()
      ? [{ id: ulid(), conversationId, role: 'user' as const, content: userText, createdAt: new Date(now) }]
      : []),
    ...(assistantText && assistantText.trim()
      ? [{ id: ulid(), conversationId, role: 'assistant' as const, content: assistantText, createdAt: new Date(now + 1) }]
      : []),
  ];
  if (rows.length === 0) return;
  await db.insert(aiMessages).values(rows);
  await db
    .update(aiConversations)
    .set({ updatedAt: new Date() })
    .where(eq(aiConversations.id, conversationId));
  await maybeRefreshSummary(conversationId, complete);
}

/** Refresh the rolling summary when the stored history is long enough. */
export async function maybeRefreshSummary(
  conversationId: string,
  complete: CompleteFn = completeViaRelay,
): Promise<void> {
  const db = getDb();
  const [{ count }] = (await db
    .select({ count: sql<number>`count(*)::int` })
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))) as [{ count: number }];
  if (count <= SUMMARY_TRIGGER_COUNT) return;

  const all = await db
    .select({ role: aiMessages.role, content: aiMessages.content })
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(asc(aiMessages.createdAt), asc(aiMessages.id));
  const older = all.slice(0, -SUMMARY_KEEP_RECENT);

  const conv = (
    await db
      .select({ summary: aiConversations.summary })
      .from(aiConversations)
      .where(eq(aiConversations.id, conversationId))
      .limit(1)
  )[0];

  const next = await summarizeMessages(older, conv?.summary ?? null, complete);
  if (!next || next === conv?.summary) return;
  await db
    .update(aiConversations)
    .set({ summary: next, updatedAt: new Date() })
    .where(eq(aiConversations.id, conversationId));
}
