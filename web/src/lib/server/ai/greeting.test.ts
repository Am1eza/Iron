import { describe, it, expect } from 'vitest';
import { isBareGreeting, GREETING_REPLY } from './greeting';

describe('isBareGreeting (zero-cost short-circuit)', () => {
  it('matches the bare greeting set, tolerating case/punctuation/emoji/whitespace', () => {
    for (const text of [
      'سلام',
      'درود',
      'سلام خوبی',
      'سلام خوبی؟',
      'سلام وقت بخیر',
      'سلام وقت به‌خیر',
      'hi',
      'Hello',
      'HELLO!',
      '  سلام  ',
      'سلام!!!',
      'سلام 👋',
    ]) {
      expect(isBareGreeting(text), text).toBe(true);
    }
  });

  it('never matches a greeting followed by a real question', () => {
    expect(isBareGreeting('سلام قیمت میلگرد چنده')).toBe(false);
    expect(isBareGreeting('سلام، قیمت تیرآهن ۱۴ چند است؟')).toBe(false);
  });

  it('never matches long text, multi-sentence turns or empty input', () => {
    expect(isBareGreeting('سلام می‌خواستم بدونم برای ساختمان مسکونی چی لازم دارم')).toBe(false);
    expect(isBareGreeting('سلام. من دیروز پیام دادم. جواب نگرفتم.')).toBe(false);
    expect(isBareGreeting('')).toBe(false);
    expect(isBareGreeting('   ')).toBe(false);
  });

  it('does not over-match near-greeting words', () => {
    expect(isBareGreeting('سلامت باشید')).toBe(false);
    expect(isBareGreeting('های وای')).toBe(false);
  });

  it('the canned reply is Persian and mentions the advisor', () => {
    expect(GREETING_REPLY).toContain('مشاور هوشمند');
    expect(GREETING_REPLY).toContain('آهن‌تایم');
  });
});
