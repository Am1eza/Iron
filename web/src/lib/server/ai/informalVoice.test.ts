// @vitest-environment node
/**
 * toInformalSecondPerson — the register safety net.
 *
 * Every positive case here is a phrase this model actually produced on
 * production, on a turn where the prompt had already told it four separate
 * times to write تو. Every negative case is a word or construction that must
 * survive untouched, because a normalizer that mangles Persian is worse than
 * one that leaves an answer formal.
 */
import { describe, it, expect } from 'vitest';
import { toInformalSecondPerson } from './informalVoice';

describe('toInformalSecondPerson', () => {
  it('rewrites the indicative plural forms the advisor kept slipping into', () => {
    // Observed live, verbatim.
    expect(
      toInformalSecondPerson('در نتیجه‌های قیمت، می‌بینید گریدهای مختلف در دسترس هستند.'),
    ).toContain('می‌بینی گریدهای');
    expect(toInformalSecondPerson('آیا می‌خواهید قیمت را بررسی کنیم؟')).toBe(
      'آیا می‌خواهی قیمت را بررسی کنیم؟',
    );
    expect(toInformalSecondPerson('اگر با نیازهای خاصی هستید بگو.')).toBe(
      'اگر با نیازهای خاصی هستی بگو.',
    );
    expect(toInformalSecondPerson('اگر عجله دارید، همین حالا ثبت کن.')).toBe(
      'اگر عجله داری، همین حالا ثبت کن.',
    );
    expect(toInformalSecondPerson('کارشناس فروش با شما تماس می‌گیرد.')).toBe(
      'کارشناس فروش با تو تماس می‌گیرد.',
    );
  });

  it('works for any verb, because the transformation is morphological', () => {
    for (const [plural, singular] of [
      ['می‌توانید', 'می‌توانی'],
      ['می‌کنید', 'می‌کنی'],
      ['می‌دانید', 'می‌دانی'],
      ['می‌گویید', 'می‌گویی'],
      ['می‌آیید', 'می‌آیی'],
      ['نمی‌خواهید', 'نمی‌خواهی'],
    ]) {
      expect(toInformalSecondPerson(`شما ${plural} ادامه بدهی؟`)).toBe(`تو ${singular} ادامه بدهی؟`);
    }
  });

  it('never touches an ordinary word that merely ends in «ید»', () => {
    // The transformation is anchored on the «می‌» prefix precisely so these
    // are impossible to hit. «تأیید» in particular is the confirm button's
    // own label — mangling it would break the instruction the card gives.
    const text = 'برای تأیید نهایی، خرید جدید را با کلید سفید ثبت کن؛ امید هست تا آخر هفته برسد.';
    expect(toInformalSecondPerson(text)).toBe(text);
  });

  it('never touches «شماره» or a word that merely starts with «شما»', () => {
    const text = 'شمارهٔ پیگیری و شمارش اقلام در پیش‌فاکتور می‌آید.';
    expect(toInformalSecondPerson(text)).toBe(text);
  });

  it('never mangles a third-person verb whose stem ends in ا/آ', () => {
    // «می‌آید» is می + آی + د: the «ی» is the stem, only the «د» is the
    // ending. This is the false positive the first draft of the rule had, and
    // «می‌آید» is one of the most common verbs in a delivery-time answer.
    const text = 'بار روز شنبه می‌آید و کارشناس قیمت را اعلام می‌نماید؛ درِ انبار را می‌گشاید.';
    expect(toInformalSecondPerson(text)).toBe(text);
  });

  it('leaves «می‌شوید» alone — it is also «he washes»', () => {
    // Genuinely ambiguous without the sentence around it, so the safe
    // direction is to leave it formal rather than mangle the other verb.
    const text = 'اگر وارد حساب می‌شوید، ادامه بده.';
    expect(toInformalSecondPerson(text)).toBe(text);
  });

  it('leaves the ambiguous imperative/subjunctive forms to the prompt', () => {
    // «ثبت کنید» is «ثبت کن» as an imperative and «ثبت کنی» as a subjunctive;
    // choosing without the syntax produces broken Persian, so this does not
    // choose. Documented limitation, asserted so it stays deliberate.
    const text = 'لطفاً درخواست را ثبت کنید و دکمهٔ تأیید را بزنید.';
    expect(toInformalSecondPerson(text)).toBe(text);
  });

  it('leaves an already-informal answer exactly as it is, and is idempotent', () => {
    const informal =
      'قیمت امروز میلگرد ۱۶ را برایت آوردم. اگر بخواهی، همین‌جا پیش‌فاکتور را آماده می‌کنم.';
    expect(toInformalSecondPerson(informal)).toBe(informal);
    const once = toInformalSecondPerson('شما می‌توانید ادامه دهید؟');
    expect(toInformalSecondPerson(once)).toBe(once);
  });

  it('leaves numbers, product names and markdown untouched', () => {
    const table =
      '| کارخانه | قیمت هر کیلو |\n| --- | --- |\n| ذوب‌آهن | ۴۲٬۵۰۰ |\n\nگرید `A3` برای اسکلت مناسب است.';
    expect(toInformalSecondPerson(table)).toBe(table);
  });

  it('is a no-op on empty text', () => {
    expect(toInformalSecondPerson('')).toBe('');
  });
});
