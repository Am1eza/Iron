/**
 * The last gate before an answer reaches a customer: is this an ANSWER, or is
 * it the model thinking out loud?
 *
 * Observed in production on 2026-08-17, verbatim, in the chat bubble a real
 * visitor would have read:
 *
 *   «We need to respond to user. The user wants to proceed with a proforma
 *   for ۳ tons of ۱۶mm rebar, but the system says product not found … Also we
 *   must follow style: use "تو" etc. Also we must not reveal internal tool
 *   calls.»
 *
 * This is a REASONING model (nemotron). Its private deliberation normally
 * never reaches `delta.content`, but when it does, the relay has no way to
 * tell it apart from an answer, and what the visitor gets is English, meta,
 * and a recital of the advisor's own internal instructions.
 *
 * Rule 20 of the system prompt already says «پاسخ فقط و فقط فارسی باشد»; this
 * is the enforcement. It is deliberately a HIGH bar rather than a general
 * English-detector: the answer's own vocabulary legitimately includes short
 * Latin grade codes (`A3`, `ST37`, `IPE14`, `LC`), so those must never trip
 * it. What no Persian answer ever contains is eight English words.
 */

/** Latin words of 3+ letters. `A3`/`ST37`/`IPE14` are 1-2 letters + digits and
 *  do not match; «mm» and «kg» are 2 letters and do not match either. */
const LATIN_WORD = /(?<![\p{L}\d])[A-Za-z]{3,}(?![\p{L}])/gu;

/** How many such words an answer may contain before it stops being Persian.
 *  Measured against the leak above (60+) and against every eval scenario's
 *  legitimate text (0). Eight leaves room for a product name a mill genuinely
 *  writes in Latin without licensing a paragraph of English. */
const MAX_LATIN_WORDS = 8;

/** Phrases the model uses about ITSELF, never to a customer. One of these
 *  plus any English at all is already the leak. */
const REASONING_MARKERS =
  /\b(we need to|we must|we should|the user (wants|asks|said)|let'?s craft|let me (think|craft)|i should respond|the rule says|so we can|thus we can)\b/i;

/**
 * True when `text` reads as internal deliberation rather than an answer.
 *
 * The caller's move on `true` is to ask once more and then, failing that, to
 * show nothing at all: the advisor's own failure notice («دستیار هوشمند
 * موقتاً در دسترس نیست … دوباره امتحان کن») with its retry is a far better
 * thing to put in front of a buyer than the model's scratchpad.
 */
export function looksLikeLeakedReasoning(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const latinWords = trimmed.match(LATIN_WORD)?.length ?? 0;
  if (latinWords >= MAX_LATIN_WORDS) return true;
  // A marker alone is not enough — «the rule says» could conceivably appear
  // inside a quoted standard name — but a marker next to English prose is.
  return latinWords >= 3 && REASONING_MARKERS.test(trimmed);
}

/* ------------------------------------------------------------------ */
/* The stutter                                                        */
/* ------------------------------------------------------------------ */

/**
 * The OTHER way this model's output stops reading like a person wrote it: a
 * clause emitted twice, back to back. Reported from a live turn on
 * 2026-08-18 as «… بگو چه گریدی از آهن‌ چه گریدی از آهن می‌خواهی …».
 *
 * Two mechanisms can produce it and this collapses both:
 *   1. the model stutters on its own (a known small-reasoning-model artifact,
 *      same family as the «پیش‌فاکetur» / «آبتن» garbles already logged);
 *   2. the continuation stitch — when the relay hits max_tokens mid-answer the
 *      pipeline asks for the rest and CONCATENATES two generations
 *      (`continueTruncatedAnswer`). A model that restarts the cut clause
 *      instead of resuming it writes that clause twice, and this is the only
 *      place in our own code where two generations are joined.
 *
 * Deliberately narrow, because the cost of a false positive is a deleted
 * clause in a real answer:
 *   - the two copies must be IMMEDIATELY adjacent, separated by nothing but
 *     whitespace (a repeat with any word between them is normal emphasis);
 *   - at least MIN_REPEAT_WORDS words and MIN_REPEAT_CHARS characters long
 *     («خیلی خیلی» and «۱۲ ۱۲» stay untouched);
 *   - it must contain a letter, so a run of numbers or bullets is never eaten;
 *   - markdown table rows are skipped wholesale — a table legitimately repeats
 *     the same cell values across a row, and that is the one place in this
 *     advisor's output where it does.
 *
 * The FIRST copy is dropped, not the second: in the truncation case the first
 * copy is the one that was cut (the live report's «آهن‌» carried a trailing
 * ZWNJ from mid-word), so the second is the clean one. Comparison ignores
 * ZWNJ for exactly that reason.
 *
 * Removal-only: it can never introduce text, so it cannot move a number past
 * the grounding validator that runs before it.
 */
const MIN_REPEAT_WORDS = 3;
const MIN_REPEAT_CHARS = 8;
/** Longer than a clause; a repeat this big is a paragraph, not a stutter. */
const MAX_REPEAT_WORDS = 12;
const ZWNJ_RE = /‌/g;
const HAS_LETTER = /\p{L}/u;

function collapseLine(line: string): string {
  // A markdown table row repeats cell values by design — leave it alone.
  if (line.trimStart().startsWith('|')) return line;
  // Odd indices are the whitespace runs, so joining restores the line exactly.
  const parts = line.split(/(\s+)/);
  const wordAt = (i: number) => parts[i * 2] ?? '';
  const words = parts.filter((_, i) => i % 2 === 0);
  const key = (i: number) => wordAt(i).replace(ZWNJ_RE, '');

  for (let i = 0; i < words.length; i++) {
    for (let k = Math.min(MAX_REPEAT_WORDS, Math.floor((words.length - i) / 2)); k >= MIN_REPEAT_WORDS; k--) {
      let same = true;
      for (let j = 0; j < k && same; j++) same = key(i + j) === key(i + k + j) && key(i + j) !== '';
      if (!same) continue;
      const phrase = words.slice(i, i + k).join(' ');
      if (phrase.replace(ZWNJ_RE, '').length < MIN_REPEAT_CHARS || !HAS_LETTER.test(phrase)) continue;
      // Drop the first copy AND the whitespace run that followed it.
      parts.splice(i * 2, k * 2);
      return collapseLine(parts.join(''));
    }
  }
  return line;
}

export function collapseImmediateRepeat(text: string): string {
  if (!text.includes(' ')) return text;
  return text.split('\n').map(collapseLine).join('\n');
}
