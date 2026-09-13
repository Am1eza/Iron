/**
 * J-222: defense in depth for RETRIEVED text — article excerpts
 * (`searchGuides`) and curated corrections — before it is handed to the
 * model as context.
 *
 * Both sources are admin-written today, which is why the original audit
 * rated the likelihood low. The blast radius is not low: retrieved text
 * lands in the same conversation the system prompt does, and the model has
 * no structural way to tell "content someone wrote" from "an instruction
 * addressed to me". One compromised admin account — or one admin pasting a
 * block of text copied from somewhere else into an article body — is
 * enough, and nothing between the database and the model looked at it.
 *
 * This is deliberately NEUTRALIZATION, not rejection: a guide that happens
 * to discuss AI instructions is legitimate content and must still be
 * readable. The instruction-shaped SIGNAL is what gets defanged (the role
 * label, the override phrase), never the surrounding prose — the same
 * "content, not instruction" separation an enterprise RAG layer applies to
 * retrieved chunks regardless of how trusted the source is.
 */

/** What a defanged instruction marker is replaced with. Visible on purpose:
 *  an admin reviewing why an article reads oddly in the advisor's context
 *  should be able to find this string, and the model reads it as inert
 *  bracketed text rather than as a directive. */
export const NEUTRALIZED = '[متن بازیابی‌شده]';

/**
 * Chat/instruct control tokens. These are the highest-signal markers: no
 * legitimate Persian steel-market article contains `<|im_start|>` or
 * `[INST]`, and a model that sees one may treat everything after it as a
 * new turn from a privileged role.
 */
const CONTROL_TOKENS = /<\|[^|>]{0,40}\|>|\[\/?INST\]|<\/?s>/gi;

/**
 * A line that OPENS with a role label — `System:`, `Assistant:`, «سیستم:»,
 * «دستیار:». Anchored to the line start (multiline) because that is the
 * shape that reads as a transcript turn; the same word mid-sentence
 * («سیستم قیمت‌گذاری ما») is ordinary prose and must survive untouched.
 */
const ROLE_LABEL_LINE = /^[ \t]*(?:system|assistant|user|ai|سیستم|دستیار|کاربر)[ \t]*[:：]/gim;

/**
 * Override/roleplay phrases, English and Persian. Each is the operative
 * clause of a real injection pattern, not a generic keyword: matching
 * «دستور» alone would eat legitimate text about ordering, so the patterns
 * require the override SHAPE (ignore/forget/disregard + previous/above/all
 * instructions; "you are now"; «از این پس تو ...»).
 */
const OVERRIDE_PHRASES: RegExp[] = [
  /\b(?:ignore|disregard|forget)\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|earlier|system)\s+(?:instructions?|prompts?|rules?|messages?)/gi,
  /\byou\s+are\s+now\s+(?:a|an|the)\b/gi,
  /\b(?:reveal|print|repeat|output|show)\s+(?:your|the)\s+(?:system\s+)?(?:prompt|instructions?|rules?)/gi,
  // «دستورات قبلی را نادیده بگیر» / «تمام دستورهای بالا را فراموش کن»
  /(?:تمام\s+|همهٔ?\s+)?دستور(?:ات|ها|های)?\s*(?:قبلی|بالا|پیشین)?\s*(?:را)?\s*(?:نادیده\s*بگیر|فراموش\s*کن)/g,
  // «از این پس تو یک ... هستی» — role reassignment
  /از\s*این\s*پس\s*تو\s+یک/g,
  // «دستور(ات) سیستم را بگو/بنویس/فاش کن»
  /دستور(?:ات|ها|های)?\s*(?:سیستم|داخلی)\s*(?:ات|خود)?\s*را\s*(?:بگو|بنویس|فاش\s*کن|نشان\s*بده)/g,
];

/**
 * Defang instruction-shaped signals in text retrieved from the database.
 *
 * Applied at the boundary where retrieved text becomes model context, so
 * every current and future retrieval path gets it by construction rather
 * than by each caller remembering to.
 */
export function neutralizeRetrievedText(text: string): string {
  let out = text.replace(CONTROL_TOKENS, NEUTRALIZED);
  out = out.replace(ROLE_LABEL_LINE, `${NEUTRALIZED} `);
  for (const pattern of OVERRIDE_PHRASES) out = out.replace(pattern, NEUTRALIZED);
  return out;
}
