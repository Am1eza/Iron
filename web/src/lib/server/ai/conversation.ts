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
 * (it is the relay's prompt-cache prefix); the summary goes AFTER it.
 */
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { aiConversations, aiMessages } from '@/lib/server/db/schema';
import { streamCompletion, type ChatMessage } from '@/lib/server/integrations/aiRelay';
import { AI_SYSTEM_PROMPT, AI_VOICE_REMINDER } from '@/lib/server/services/aiTools';
import { assignPromptVersion, type PromptVersion } from '@/lib/server/ai/promptVersions';

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
  /** US-05.5 — the A/B-assigned system-prompt version, null when A/B is off
   *  or this conversation predates the feature. */
  promptVersionId: string | null;
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
 *  re-created under the same id so its later turns still persist.
 *  `versions` (US-05.5) is only consulted for a NEW row — an existing
 *  conversation keeps whatever version it was already assigned, forever. */
export async function ensureConversation(
  id: string | undefined,
  userId: string | null,
  versions: PromptVersion[] = [],
): Promise<ConversationRow> {
  const db = getDb();
  if (id) {
    // Scope by owner. `id` arrives straight from the request body, and the
    // row's `summary` is injected into the model context as «خلاصهٔ گفتگو تا
    // اینجا…» — so resolving it unscoped let anyone holding another user's
    // conversation id (it is echoed to the client, persists in the browser,
    // and survives on shared devices) prompt the model to read back that
    // buyer's requirements, and write their own turns into the victim's row.
    // An anonymous caller may only attach to a row that is itself anonymous.
    const rows = await db
      .select({ id: aiConversations.id, summary: aiConversations.summary, promptVersionId: aiConversations.promptVersionId })
      .from(aiConversations)
      .where(
        and(
          eq(aiConversations.id, id),
          userId ? eq(aiConversations.userId, userId) : isNull(aiConversations.userId),
        ),
      )
      .limit(1);
    // A miss falls through to the insert below, which is `onConflictDoNothing`
    // — so a mismatched id neither leaks the row nor clobbers it; the caller
    // simply continues without summary continuity.
    if (rows[0]) return rows[0];
  }
  const newId = id ?? ulid();
  const promptVersionId = assignPromptVersion(newId, versions);
  await db
    .insert(aiConversations)
    .values({ id: newId, userId, promptVersionId })
    .onConflictDoNothing();
  return { id: newId, summary: null, promptVersionId };
}

/**
 * Build the relay message list for one request. The (possibly A/B-resolved,
 * US-05.5) system prompt is ALWAYS the byte-identical first message for a
 * given version (the relay's prompt-cache prefix); a non-empty rolling summary rides
 * as a SECOND system message right after it. `systemPrompt` defaults to the
 * baseline AI_SYSTEM_PROMPT — every existing caller (evals.test.ts included)
 * that doesn't pass it keeps behaving exactly as before.
 */
export function buildChatMessages(
  clientMessages: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>,
  summary?: string | null,
  domainFacts?: string | null,
  systemPrompt: string = AI_SYSTEM_PROMPT,
  /** Who the visitor is, when signed in — see identityFact(). */
  identity?: string | null,
): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];
  // Stable, NON-NUMERIC catalog overview — sits right after the byte-identical
  // prompt so it EXTENDS the relay's cache prefix (it barely changes), letting
  // the model answer "what do you sell?" without a tool round. Numbers still
  // come only from tools (grounding). Absent in unit tests → summary stays at [1].
  if (domainFacts && domainFacts.trim()) {
    messages.push({ role: 'system', content: domainFacts.trim() });
  }
  if (summary && summary.trim()) {
    messages.push({ role: 'system', content: `خلاصهٔ گفتگو تا اینجا: ${summary.trim()}` });
  }
  // Signed-in visitor: the advisor used to ask a logged-in customer for the
  // name and mobile the site already had on file. It is told them here, and
  // told not to ask (and not to read the number back — the digits are not in
  // the grounding ledger, so echoing them would be censored anyway).
  if (identity && identity.trim()) {
    messages.push({ role: 'system', content: identity.trim() });
  }
  // Register, restated LAST — right before the visitor's own turns. The rule
  // itself is in AI_SYSTEM_PROMPT (21-22), but that is the far end of a
  // 22-rule prompt: live testing showed the model keeping تو for a clause and
  // then closing with «لطفاً درخواست را ثبت کنید». This costs ~60 tokens, sits
  // after the cache-prefix messages, and is a reminder, not a second rulebook.
  messages.push({ role: 'system', content: AI_VOICE_REMINDER });
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
  // Deterministic id for the assistant row, generated by the route BEFORE the
  // stream's `done` frame so the client can attach feedback to this exact
  // answer. Falls back to a fresh ulid when not supplied.
  assistantMessageId?: string,
): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const rows = [
    ...(userText && userText.trim()
      ? [{ id: ulid(), conversationId, role: 'user' as const, content: userText, createdAt: new Date(now) }]
      : []),
    ...(assistantText && assistantText.trim()
      ? [{ id: assistantMessageId ?? ulid(), conversationId, role: 'assistant' as const, content: assistantText, createdAt: new Date(now + 1) }]
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

/** The signed-in visitor, as a system fact for the advisor. Null for guests —
 *  their path is the login button on the confirmation card, not a question. */
export function identityFact(user: { name?: string; mobile: string } | null): string | null {
  if (!user) return null;
  const who = user.name?.trim();
  return (
    `کاربر وارد حساب کاربری شده است${who ? ` و نامش «${who}» است` : ''}؛ شمارهٔ موبایلش هم در حساب او ثبت است. ` +
    'هرگز نام یا شمارهٔ موبایل را از او نپرس و شماره را در متن پاسخ ننویس؛ هنگام ثبت درخواست، این اطلاعات خودکار از حسابش برداشته می‌شود.'
  );
}

/** Longest chat a rep will ever be handed verbatim (oldest turns drop first);
 *  anything older is already folded into the rolling `summary`. */
const SALES_TRANSCRIPT_MAX_MESSAGES = 30;
const SALES_TRANSCRIPT_MAX_CHARS = 1000;

/**
 * The advisor conversation as the SALES rep should read it: the rolling
 * summary (the older turns, already condensed by the model) plus the stored
 * turns verbatim. Read from the DB rather than from what the client happened
 * to resend, so the rep gets the WHOLE chat — the client only ever ships the
 * last 10 turns, which is why an AI lead's saved context used to start
 * mid-negotiation. Never throws: sales context must not fail a lead.
 */
export async function conversationForSales(
  conversationId: string,
): Promise<{ summary: string | null; transcript: StoredMessage[] }> {
  try {
    const db = getDb();
    const [conv, rows] = await Promise.all([
      db
        .select({ summary: aiConversations.summary })
        .from(aiConversations)
        .where(eq(aiConversations.id, conversationId))
        .limit(1),
      db
        .select({ role: aiMessages.role, content: aiMessages.content })
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, conversationId))
        .orderBy(asc(aiMessages.createdAt), asc(aiMessages.id)),
    ]);
    return {
      summary: conv[0]?.summary ?? null,
      transcript: rows
        .slice(-SALES_TRANSCRIPT_MAX_MESSAGES)
        .map((m) => ({ role: m.role, content: m.content.slice(0, SALES_TRANSCRIPT_MAX_CHARS) })),
    };
  } catch {
    return { summary: null, transcript: [] };
  }
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
