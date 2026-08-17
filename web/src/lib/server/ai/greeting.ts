/**
 * Bare-greeting short-circuit for the AI advisor — a conversation that is
 * nothing but «سلام» costs zero relay calls and zero DB reads: the route
 * answers with a canned introduction + the opening purpose chips instead of
 * waking the relay. Pure matcher, unit-tested.
 */
import { normalizeDigits } from '@/lib/utils/format';

/** Everything a greeting may be wrapped in: punctuation (Persian + Latin),
 *  emoji/symbols/pictographs, and ZWNJ — stripped before matching. */
const STRIP = /[!?.،؛؟,:;()«»"'\-–—_~*٫٬‌\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{FE00}-\u{FE0F}]/gu;

/** The exact greetings worth short-circuiting — anything longer/more specific
 *  («سلام قیمت میلگرد چنده») must reach the model. */
const GREETINGS = new Set([
  'سلام',
  'درود',
  'سلام خوبی',
  'سلام وقت بخیر',
  'سلام وقت به خیر',
  'hi',
  'hello',
]);

const MAX_GREETING_LEN = 25;

/** True when `text` is ONLY a greeting (after digit-normalizing, stripping
 *  punctuation/emoji and collapsing whitespace) — never for real questions. */
export function isBareGreeting(text: string): boolean {
  if (text.length > MAX_GREETING_LEN) return false;
  const cleaned = normalizeDigits(text)
    .replace(STRIP, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return GREETINGS.has(cleaned);
}

/** Canned advisor introduction streamed instead of a model round. Written in
 *  the SAME تو-voice the model is instructed to use (AI_SYSTEM_PROMPT rule 21)
 *  and that GREETING_TEXT in the UI already used — this reply is the first
 *  thing a visitor who types «سلام» ever reads, so it sets the register for
 *  the whole conversation. */
export const GREETING_REPLY =
  'سلام! من مشاور هوشمند آهن‌تایمم. قیمت روز آهن‌آلات، وزن دقیق مقاطع و برآورد مصالح پروژه را از دیتابیس می‌گویم و اگر آماده بودی، درخواست پیش‌فاکتور را هم همین‌جا ثبت می‌کنم. بگو آهن را برای چه کاری می‌خواهی؟';
