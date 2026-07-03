/**
 * Bare-greeting short-circuit for the AI advisor — a conversation that is
 * nothing but «سلام» costs zero relay calls and zero DB reads: the route
 * answers with a canned introduction + the opening purpose chips instead of
 * waking DeepSeek. Pure matcher, unit-tested.
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

/** Canned advisor introduction streamed instead of a model round. */
export const GREETING_REPLY =
  'سلام! من مشاور هوشمند آهن‌تایم هستم. قیمت روز آهن‌آلات، وزن دقیق مقاطع و برآورد مصالح پروژه را از دیتابیس می‌گویم و اگر آماده بودید، درخواست پیش‌فاکتور هم ثبت می‌کنم. بفرمایید برای چه کاری آهن می‌خواهید؟';
