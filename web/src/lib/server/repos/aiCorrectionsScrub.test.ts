// @vitest-environment node
/**
 * J-245: a correction's free text is sourced from a real flagged customer
 * conversation and later retrieved into a DIFFERENT customer's live chat
 * (aiTools#searchCorrections); an eval candidate's free text can be copied
 * verbatim into committed source (evals.test.ts). Both must never carry a
 * customer's raw mobile/email through to storage.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '@/test/db';
import { createCorrection } from './aiCorrectionsRepo';
import { createEvalCandidate } from './aiEvalCandidatesRepo';

let close: () => Promise<void>;

beforeAll(async () => {
  ({ close } = await createTestDb());
});
afterAll(async () => {
  await close();
});

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
});
