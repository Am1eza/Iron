// @vitest-environment node
/**
 * J-245: a correction's free text is sourced from a real flagged customer
 * conversation and later retrieved into a DIFFERENT customer's live chat
 * (aiTools#searchCorrections); an eval candidate's free text can be copied
 * verbatim into committed source (evals.test.ts). Both must never carry a
 * customer's raw mobile/email through to storage.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ulid } from 'ulid';
import { createTestDb } from '@/test/db';
import { getDb } from '@/lib/server/db/client';
import * as schema from '@/lib/server/db/schema';
import { createCorrection } from './aiCorrectionsRepo';
import { createEvalCandidate } from './aiEvalCandidatesRepo';

let close: () => Promise<void>;

beforeAll(async () => {
  ({ close } = await createTestDb());
});
afterAll(async () => {
  await close();
});

/** A real user + conversation (+ optionally one message), so
 *  `namesForConversation`/`conversationIdForMessage` (piiScrub.ts) have a
 *  genuine row to resolve — not a mock. */
async function seedConversation(name: string): Promise<{ conversationId: string; messageId: string }> {
  const userId = ulid();
  const conversationId = ulid();
  const messageId = ulid();
  await getDb().insert(schema.users).values({ id: userId, mobile: `0912${String(Math.random()).slice(2, 9)}`, name });
  await getDb().insert(schema.aiConversations).values({ id: conversationId, userId });
  await getDb().insert(schema.aiMessages).values({ id: messageId, conversationId, role: 'assistant', content: 'x' });
  return { conversationId, messageId };
}

describe('createCorrection — PII scrub (J-245)', () => {
  it('scrubs a mobile number out of both question and answer', async () => {
    const row = await createCorrection({
      question: 'من علی هستم، شماره‌ام 09121234567 است، میلگرد ۱۴ چند؟',
      answer: 'سلام علی، برای هماهنگی با 09121234567 تماس می‌گیریم.',
    });
    expect(row.question).not.toContain('09121234567');
    expect(row.answer).not.toContain('09121234567');
    expect(row.question).toContain('[redacted-mobile]');
    expect(row.answer).toContain('[redacted-mobile]');
  });

  it('scrubs an email address', async () => {
    const row = await createCorrection({
      question: 'ایمیلم ali@example.com است.',
      answer: 'باشه، به ali@example.com خبر می‌دهیم.',
    });
    expect(row.question).not.toContain('ali@example.com');
    expect(row.answer).not.toContain('ali@example.com');
  });

  it('leaves ordinary catalog text untouched', async () => {
    const row = await createCorrection({
      question: 'قیمت میلگرد ۱۴ ذوب‌آهن چند است؟',
      answer: 'قیمت میلگرد ۱۴ ذوب‌آهن ۴۲٬۵۰۰ تومان بر کیلوگرم است.',
    });
    expect(row.question).toBe('قیمت میلگرد ۱۴ ذوب‌آهن چند است؟');
    expect(row.answer).toBe('قیمت میلگرد ۱۴ ذوب‌آهن ۴۲٬۵۰۰ تومان بر کیلوگرم است.');
  });

  it('J-245 (name half): redacts the conversation OWNER\'S OWN account name, resolved via sourceMessageId — the exact PII type mobile/email scrubbing cannot catch', async () => {
    const { messageId } = await seedConversation('رضا کریمی');
    const row = await createCorrection({
      question: 'من رضا کریمی هستم، میلگرد ۱۴ چند؟',
      answer: 'سلام رضا کریمی، قیمت ۴۲٬۰۰۰ تومان است.',
      sourceMessageId: messageId,
    });
    expect(row.question).not.toContain('رضا کریمی');
    expect(row.answer).not.toContain('رضا کریمی');
    expect(row.question).toContain('[redacted-name]');
  });

  it('never touches a name that is NOT this conversation\'s own owner', async () => {
    const { messageId } = await seedConversation('رضا کریمی');
    const row = await createCorrection({
      question: 'میلگرد ۱۴ ذوب‌آهن چند است؟', // no name at all in this one
      answer: 'قیمت ۴۲٬۰۰۰ تومان است.',
      sourceMessageId: messageId,
    });
    expect(row.question).toBe('میلگرد ۱۴ ذوب‌آهن چند است؟');
    expect(row.answer).toBe('قیمت ۴۲٬۰۰۰ تومان است.');
  });
});

describe('createEvalCandidate — PII scrub (J-245)', () => {
  it('scrubs a mobile number out of question, badAnswer and note', async () => {
    const row = await createEvalCandidate({
      question: 'شماره‌ام 09121234567 است، پیگیری کن.',
      badAnswer: 'باشه با 09121234567 تماس می‌گیرم.',
      note: 'مشتری شماره 09121234567 را داد.',
    });
    expect(row.question).not.toContain('09121234567');
    expect(row.badAnswer).not.toContain('09121234567');
    expect(row.note).not.toContain('09121234567');
  });

  it('leaves ordinary catalog text untouched', async () => {
    const row = await createEvalCandidate({
      question: 'قیمت میلگرد ۱۴ چند است؟',
      badAnswer: 'حدوداً ۴۵ هزار تومان.',
    });
    expect(row.question).toBe('قیمت میلگرد ۱۴ چند است؟');
    expect(row.badAnswer).toBe('حدوداً ۴۵ هزار تومان.');
  });

  it('J-245 (name half): redacts the conversation owner\'s own account name, resolved via conversationId', async () => {
    const { conversationId } = await seedConversation('سارا احمدی');
    const row = await createEvalCandidate({
      conversationId,
      question: 'من سارا احمدی هستم، پیگیری کن.',
      badAnswer: 'باشه سارا احمدی، بررسی می‌کنیم.',
      note: 'مشتری (سارا احمدی) شکایت داشت.',
    });
    expect(row.question).not.toContain('سارا احمدی');
    expect(row.badAnswer).not.toContain('سارا احمدی');
    expect(row.note).not.toContain('سارا احمدی');
  });
});
