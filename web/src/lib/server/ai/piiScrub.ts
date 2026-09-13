/**
 * J-245 (the remaining half): `errors/scrub.ts#scrubPii` catches a mobile
 * number or email by SHAPE — a free-text name has none, which is why the
 * original J-245 fix (aiCorrectionsRepo.ts/aiEvalCandidatesRepo.ts) honestly
 * disclosed it as uncaught. This closes the highest-likelihood remaining
 * case: a correction/eval-candidate is always sourced from ONE specific,
 * known conversation, and that conversation's owner has a stored account
 * name — so instead of guessing at names in general, redact exactly the
 * name we already know is theirs.
 *
 * This does not catch every name a customer could type (a colleague's name,
 * a delivery recipient different from the account holder) — no regex could
 * either. It reliably catches the account holder's OWN name, which is
 * exactly what J-242 identified as the PII this system already treats as
 * sensitive enough to never send to the AI relay in the first place.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { aiMessages, aiConversations, users } from '@/lib/server/db/schema';

/** Every known name-shaped string for a conversation's owner, longest first
 *  so a full name is redacted before a bare first name could partially eat
 *  into it and leave an orphaned last name behind. Empty for a guest
 *  conversation (`userId` null) or one already gone. */
export async function namesForConversation(conversationId: string): Promise<string[]> {
  try {
    const rows = await getDb()
      .select({ name: users.name, firstName: users.firstName, lastName: users.lastName })
      .from(aiConversations)
      .innerJoin(users, eq(users.id, aiConversations.userId))
      .where(eq(aiConversations.id, conversationId))
      .limit(1);
    const u = rows[0];
    if (!u) return [];
    const full = u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : undefined;
    const candidates = [u.name, full, u.firstName, u.lastName]
      .map((n) => n?.trim())
      .filter((n): n is string => Boolean(n && n.length >= 2));
    return [...new Set(candidates)].sort((a, b) => b.length - a.length);
  } catch {
    return [];
  }
}

/** `sourceMessageId` (createCorrection's only handle on the conversation) is
 *  one join away from it. */
export async function conversationIdForMessage(messageId: string): Promise<string | null> {
  try {
    const rows = await getDb()
      .select({ conversationId: aiMessages.conversationId })
      .from(aiMessages)
      .where(eq(aiMessages.id, messageId))
      .limit(1);
    return rows[0]?.conversationId ?? null;
  } catch {
    return null;
  }
}

// ─── Names the text itself labels as names ───────────────────────────────
// The part `namesForConversation` structurally cannot reach: a name belonging
// to someone who is NOT the account holder. See `scrubIntroducedNames`.

// Persian LETTERS only. The obvious `[؀-ۿ]` is wrong here: that
// block also contains «،» (U+060C), «؛», «؟» and the Persian digits, so
// «آقای عزیز، قیمت را…» parsed as one four-word run and the scrubber
// redacted «عزیز، قیمت». Punctuation must end a word for the stoplist below
// to mean anything.
const PERSIAN_WORD =
  '[\\u0621-\\u063A\\u0641-\\u064A\\u067E\\u0686\\u0698\\u06A9\\u06AF\\u06BE\\u06CC\\u200c]{2,}';
/** Titles that sit BETWEEN the honorific and the name («آقای مهندس رضایی»),
 *  so they are skipped rather than captured as the name. */
const INNER_TITLE = '(?:مهندس|دکتر|حاج|حاجی|سید|سیده|استاد|سرکار)';
/**
 * Words that can directly follow an honorific or a name without being part of
 * it. A capture is trimmed from the right while its last word is in here, so
 * «خانم کریمی صادر شود» redacts the name and not the verb, and «آقای عزیز»
 * redacts nothing at all.
 *
 * Deliberately domain-tuned rather than a general Persian stopword list: the
 * text being scrubbed is always a steel-buying conversation, and the words
 * that actually turn up next to a name here are this shop's vocabulary.
 */
const NOT_A_NAME = new Set([
  // politeness / address
  'عزیز',
  'گرامی',
  'محترم',
  'جان',
  'سلام',
  'شما',
  'من',
  'ما',
  'خودم',
  'ایشان',
  'مربوطه',
  // titles, when they trail rather than lead
  'مهندس',
  'دکتر',
  'سرکار',
  // particles and pronouns
  'را',
  'رو',
  'در',
  'از',
  'به',
  'با',
  'که',
  'این',
  'آن',
  'هم',
  'برای',
  'تا',
  'یا',
  'هر',
  'بر',
  'اگر',
  // verbs and auxiliaries
  'است',
  'هست',
  'هستند',
  'هستم',
  'بود',
  'بودند',
  'شد',
  'شود',
  'شوند',
  'دارد',
  'دارند',
  'دارم',
  'کنید',
  'کنند',
  'کرد',
  'کردند',
  'بگیرید',
  'بزنید',
  'گفت',
  'گفتند',
  'فرمودند',
  'بفرمایید',
  'میشود',
  'می‌شود',
  'لطفا',
  'لطفاً',
  // this shop's own vocabulary
  'تماس',
  'فاکتور',
  'صادر',
  'قیمت',
  'سفارش',
  'بار',
  'محصول',
  'انبار',
  'شرکت',
  'هماهنگ',
  'پرداخت',
  'تحویل',
  'خرید',
  'فروش',
  'وزن',
  'تن',
  'کیلو',
  'شاخه',
]);

const HONORIFIC_NAME = new RegExp(
  `(?:جناب\\s+آقای|سرکار\\s+خانم|جناب|آقای|خانم)(?:\\s+${INNER_TITLE})*\\s+(${PERSIAN_WORD}(?:\\s+${PERSIAN_WORD})?)`,
  'g',
);
/** «اسم من علی رضایی است» / «نامم رضا» — the speaker labels it themselves. */
const SELF_INTRODUCED_NAME = new RegExp(
  `(?:اسم|نام)(?:م|\\s*(?:من|بنده))\\s*(?:را|رو)?\\s*(${PERSIAN_WORD}(?:\\s+${PERSIAN_WORD})?)`,
  'g',
);
const ENGLISH_INTRODUCED_NAME = /\b(?:my name is|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g;

/**
 * Redact a name that the surrounding text marks as one — «با آقای رضایی
 * هماهنگ کنید», «فاکتور به نام خانم کریمی», «اسم من …». This is the only
 * handle on a THIRD party's name: unlike the account holder's, there is no
 * record to compare it against, so the label is the whole signal.
 *
 * The honorific itself is left in place. It is not PII, and keeping it makes
 * the redaction legible to whoever reads the correction later.
 *
 * Scope is deliberately narrow, because over-redaction has a real cost here:
 * corrections and eval candidates are this system's training signal, and a
 * greedy heuristic that ate «فولاد مبارکه» out of «فاکتور به نام فولاد
 * مبارکه» would quietly destroy the corpus it was added to protect. So only
 * two constructions are matched, and both stop at a word that cannot be part
 * of a name (`NOT_A_NAME`).
 *
 * «من X هستم» is deliberately NOT matched: «من خریدارم»، «من پیمانکار هستم»
 * are the overwhelmingly more common completions, and no stoplist of
 * occupations would stay correct. A bare name in ordinary prose
 * («رضایی زنگ زد») is likewise out of reach — that residue is stated in the
 * two repos that call this, rather than papered over.
 */
export function scrubIntroducedNames<T extends string>(text: T): T {
  const redactCapture = (whole: string, captured: string) => {
    // A two-word capture whose SECOND word is a non-name («آقای رضایی عزیز»)
    // keeps the first word only — the honorific still marks it as a name.
    const words = captured.split(/\s+/);
    while (words.length > 0 && NOT_A_NAME.has(words[words.length - 1]!)) words.pop();
    if (words.length === 0) return whole;
    const name = words.join(' ');
    // lastIndexOf, not replace(): the name always sits at the END of the
    // match, and a first-position replace could hit an identical substring
    // inside the honorific/lead-in instead.
    const at = whole.lastIndexOf(name);
    if (at < 0) return whole;
    return `${whole.slice(0, at)}[redacted-name]${whole.slice(at + name.length)}`;
  };
  return (text as string)
    .replace(HONORIFIC_NAME, redactCapture)
    .replace(SELF_INTRODUCED_NAME, redactCapture)
    .replace(ENGLISH_INTRODUCED_NAME, redactCapture) as T;
}

/** Redact every literal occurrence of each known name — case-sensitive on
 *  purpose (Persian has no case, and a case-INsensitive Persian match would
 *  need locale-aware folding this doesn't attempt), longest names first so a
 *  full name is consumed whole rather than leaving its second half exposed
 *  after the first half already matched a shorter candidate. */
export function scrubKnownNames<T extends string>(text: T, names: readonly string[]): T {
  if (names.length === 0) return text;
  let out: string = text;
  for (const name of names) {
    if (!name) continue;
    out = out.split(name).join('[redacted-name]');
  }
  return out as T;
}
