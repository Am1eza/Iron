// @vitest-environment node
/**
 * Integration — AI conversation persistence + rolling summary on pglite:
 * conversation rows, per-turn message persistence, the >12-message summary
 * refresh (with an injected fake `complete` — no relay in tests), and the
 * message-builder contract (AI_SYSTEM_PROMPT byte-identical FIRST, summary
 * strictly SECOND, and summary numbers never becoming grounded).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import type { ChatMessage } from '@/lib/server/integrations/deepseek';
import { AI_SYSTEM_PROMPT } from '@/lib/server/services/aiTools';
import { GroundingLedger, sanitizeGrounded } from '@/lib/server/ai/grounding';
import {
  buildChatMessages,
  ensureConversation,
  maybeRefreshSummary,
  persistTurn,
  summarizeMessages,
  SUMMARY_MAX_CHARS,
  SUMMARY_TRIGGER_COUNT,
} from '@/lib/server/ai/conversation';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
}, 120_000);
afterAll(async () => {
  await close();
});

describe('ensureConversation', () => {
  it('creates a new row (anonymous) when no id is supplied', async () => {
    const conv = await ensureConversation(undefined, null);
    expect(conv.id).toBeTruthy();
    expect(conv.summary).toBeNull();
    const [row] = await db
      .select()
      .from(schema.aiConversations)
      .where(eq(schema.aiConversations.id, conv.id));
    expect(row).toBeDefined();
    expect(row!.userId).toBeNull();
    expect(row!.createdAt).toBeInstanceOf(Date);
  });

  it('attaches the session userId when present', async () => {
    const userId = ulid();
    await db.insert(schema.users).values({ id: userId, mobile: `0912${Date.now() % 10_000_000}` });
    const conv = await ensureConversation(undefined, userId);
    const [row] = await db
      .select()
      .from(schema.aiConversations)
      .where(eq(schema.aiConversations.id, conv.id));
    expect(row!.userId).toBe(userId);
  });

  it('returns the existing row (with its summary) for a known id', async () => {
    const id = ulid();
    await db.insert(schema.aiConversations).values({ id, summary: 'خلاصهٔ قبلی' });
    const conv = await ensureConversation(id, null);
    expect(conv).toEqual({ id, summary: 'خلاصهٔ قبلی' });
  });

  it('re-creates a client-echoed id that no longer exists', async () => {
    const id = `ghost-${ulid()}`;
    const conv = await ensureConversation(id, null);
    expect(conv).toEqual({ id, summary: null });
    const rows = await db
      .select()
      .from(schema.aiConversations)
      .where(eq(schema.aiConversations.id, id));
    expect(rows).toHaveLength(1);
  });
});

describe('persistTurn', () => {
  it('stores the user message and the sanitized assistant reply, in order', async () => {
    const { id } = await ensureConversation(undefined, null);
    await persistTurn(id, 'قیمت میلگرد ۱۴ چنده؟', 'قیمت را از جدول قیمت‌ها ببینید.', async () => '');
    const rows = await db
      .select()
      .from(schema.aiMessages)
      .where(eq(schema.aiMessages.conversationId, id))
      .orderBy(asc(schema.aiMessages.createdAt), asc(schema.aiMessages.id));
    expect(rows.map((r) => r.role)).toEqual(['user', 'assistant']);
    expect(rows[0]!.content).toBe('قیمت میلگرد ۱۴ چنده؟');
    expect(rows[1]!.content).toBe('قیمت را از جدول قیمت‌ها ببینید.');
  });

  it('skips empty sides without failing', async () => {
    const { id } = await ensureConversation(undefined, null);
    await persistTurn(id, null, 'فقط پاسخ دستیار.', async () => '');
    await persistTurn(id, '  ', '', async () => '');
    const rows = await db
      .select()
      .from(schema.aiMessages)
      .where(eq(schema.aiMessages.conversationId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.role).toBe('assistant');
  });
});

describe('rolling summary', () => {
  it(`stays null at ≤${SUMMARY_TRIGGER_COUNT} stored messages, refreshes past it (older turns only, ≤${SUMMARY_MAX_CHARS} chars)`, async () => {
    const { id } = await ensureConversation(undefined, null);
    const calls: ChatMessage[][] = [];
    const fakeComplete = async (messages: ChatMessage[]) => {
      calls.push(messages);
      return `کاربر دنبال میلگرد برای ساختمان است. ${'الف'.repeat(500)}`;
    };

    // 6 turns = 12 stored messages — at the threshold, NOT past it.
    for (let i = 1; i <= SUMMARY_TRIGGER_COUNT / 2; i++) {
      await persistTurn(id, `پیام کاربر ${i}`, `پاسخ دستیار ${i}`, fakeComplete);
    }
    expect(calls).toHaveLength(0);
    let [conv] = await db
      .select()
      .from(schema.aiConversations)
      .where(eq(schema.aiConversations.id, id));
    expect(conv!.summary).toBeNull();

    // One more turn crosses the threshold → one summary call, older turns only.
    await persistTurn(id, 'پیام کاربر ۷', 'پاسخ دستیار ۷', fakeComplete);
    expect(calls).toHaveLength(1);
    const summaryInput = calls[0]!;
    // Fixed summarizer system prompt, NOT the advisor prompt (no tools ride along).
    expect(summaryInput[0]!.role).toBe('system');
    expect(summaryInput[0]!.content).not.toBe(AI_SYSTEM_PROMPT);
    // The 6 most recent stored messages stay out of the summarized transcript.
    expect(summaryInput[1]!.content).toContain('پیام کاربر 1');
    expect(summaryInput[1]!.content).not.toContain('پاسخ دستیار ۷');

    [conv] = await db
      .select()
      .from(schema.aiConversations)
      .where(eq(schema.aiConversations.id, id));
    expect(conv!.summary).toBeTruthy();
    expect(conv!.summary!.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);

    // A later refresh folds the previous summary into the relay input.
    await persistTurn(id, 'پیام کاربر ۸', 'پاسخ دستیار ۸', fakeComplete);
    expect(calls).toHaveLength(2);
    expect(calls[1]![1]!.content).toContain('خلاصهٔ قبلی:');
  });

  it('a failing relay call just skips the refresh (summary intact, no throw)', async () => {
    const id = ulid();
    await db.insert(schema.aiConversations).values({ id, summary: 'خلاصهٔ موجود' });
    for (let i = 0; i < SUMMARY_TRIGGER_COUNT + 2; i++) {
      await db.insert(schema.aiMessages).values({
        id: ulid(),
        conversationId: id,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `پیام ${i}`,
        createdAt: new Date(Date.now() - 10_000 + i),
      });
    }
    await expect(
      maybeRefreshSummary(id, async () => {
        throw new Error('relay down');
      }),
    ).resolves.toBeUndefined();
    const [conv] = await db
      .select()
      .from(schema.aiConversations)
      .where(eq(schema.aiConversations.id, id));
    expect(conv!.summary).toBe('خلاصهٔ موجود');
  });

  it('summarizeMessages truncates to the cap and returns null on empty output', async () => {
    const long = await summarizeMessages(
      [{ role: 'user', content: 'میلگرد می‌خواهم' }],
      null,
      async () => 'خلاصه '.repeat(200),
    );
    expect(long!.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);
    const empty = await summarizeMessages(
      [{ role: 'user', content: 'میلگرد می‌خواهم' }],
      null,
      async () => '   ',
    );
    expect(empty).toBeNull();
  });
});

describe('buildChatMessages', () => {
  const turns = [
    { role: 'user' as const, content: 'سلام، میلگرد می‌خواهم' },
    { role: 'assistant' as const, content: 'برای چه کاری؟' },
    { role: 'user' as const, content: 'ساختمان ۲ طبقه' },
  ];

  it('keeps AI_SYSTEM_PROMPT as the byte-identical FIRST message (DeepSeek cache prefix)', () => {
    const withSummary = buildChatMessages(turns, 'کاربر دنبال میلگرد ساختمانی است.');
    const withoutSummary = buildChatMessages(turns, null);
    expect(withSummary[0]).toEqual({ role: 'system', content: AI_SYSTEM_PROMPT });
    expect(withoutSummary[0]).toEqual({ role: 'system', content: AI_SYSTEM_PROMPT });
    expect(withSummary[0]!.content).toBe(withoutSummary[0]!.content);
  });

  it('injects the summary as the SECOND system message, then the turns', () => {
    const messages = buildChatMessages(turns, 'کاربر دنبال میلگرد ساختمانی است.');
    expect(messages[1]).toEqual({
      role: 'system',
      content: 'خلاصهٔ گفتگو تا اینجا: کاربر دنبال میلگرد ساختمانی است.',
    });
    expect(messages.slice(2)).toEqual(turns);
  });

  it('omits the summary message when null/empty', () => {
    expect(buildChatMessages(turns, null)).toHaveLength(turns.length + 1);
    expect(buildChatMessages(turns, '  ')).toHaveLength(turns.length + 1);
    expect(buildChatMessages(turns, null).filter((m) => m.role === 'system')).toHaveLength(1);
  });

  it('GROUNDING: a number that only exists in the summary still gets censored', () => {
    // The route never feeds the summary into the ledger or userNumbers — an
    // aged-out price can't license a new claim; the model must re-call the tool.
    const messages = buildChatMessages(turns, 'قبلاً قیمت ۴۲۰۰۰ تومان مطرح شد.');
    expect(messages[1]!.content).toContain('۴۲۰۰۰');
    const r = sanitizeGrounded('قیمت همان ۴۲۰۰۰ تومان است.', new GroundingLedger(), new Set());
    expect(r.violations).toEqual([42000]);
  });
});
