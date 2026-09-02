/**
 * Conversation titles.
 *
 * The list query itself is a plain scoped read (and is exercised end to end by
 * the route); the judgement worth pinning is what a conversation gets CALLED,
 * because that is the whole difference between a usable history rail and a
 * column of timestamps.
 */
import { describe, it, expect } from 'vitest';
import { conversationTitle } from './aiConversationsRepo';

describe('conversationTitle', () => {
  it('uses the visitor’s own first message, not the model’s summary', () => {
    // The summary is written as a briefing for the model — accurate, and
    // nothing like what the person typed. People find their own conversation
    // by remembering what they ASKED.
    const title = conversationTitle(
      '۲۰ تن میلگرد می‌خوام',
      'کاربر به دنبال میلگرد آجدار برای اسکلت است و شهر تحویل را مشهد اعلام کرده',
    );
    expect(title).toBe('۲۰ تن میلگرد می‌خوام');
  });

  it('falls back to the summary when the first turn left no user message', () => {
    // An empty answer is deliberately never persisted, so a thread's first
    // stored row can legitimately be assistant-only.
    expect(conversationTitle(null, 'خلاصهٔ گفتگو دربارهٔ ورق سیاه')).toBe(
      'خلاصهٔ گفتگو دربارهٔ ورق سیاه',
    );
  });

  it('never returns an empty title', () => {
    expect(conversationTitle(null, null)).toBe('گفتگوی بدون عنوان');
    expect(conversationTitle('   ', '  ')).toBe('گفتگوی بدون عنوان');
  });

  it('flattens newlines — a pasted cut list is still one row', () => {
    const title = conversationTitle('میلگرد ۱۴: ۳ تن\nمیلگرد ۱۶: ۲ تن\nتحویل مشهد');
    expect(title).not.toContain('\n');
    expect(title).toContain('میلگرد ۱۴');
  });

  it('truncates a long ask with an ellipsis rather than overflowing the rail', () => {
    const long = 'برای یک ساختمان پنج طبقه با زیربنای ۲۰۰۰ متر مربع در شهر مشهد چه مقدار میلگرد و تیرآهن لازم دارم و از کدام کارخانه بخرم';
    const title = conversationTitle(long);
    expect(title.length).toBeLessThanOrEqual(61);
    expect(title.endsWith('…')).toBe(true);
    // Still recognisable: the beginning of what they asked survives.
    expect(title.startsWith('برای یک ساختمان پنج طبقه')).toBe(true);
  });

  it('leaves a title that already fits exactly as typed', () => {
    expect(conversationTitle('قیمت میلگرد ۱۴')).toBe('قیمت میلگرد ۱۴');
  });
});
