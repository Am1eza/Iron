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

/* ------------------------------------------------------------------ */
/* Claims about money, filing, and credentials                         */
/* ------------------------------------------------------------------ */

/**
 * The third failure of prompt-only enforcement, and the most expensive one:
 * the advisor describing a checkout, an order status and a login that this
 * site does not have.
 *
 * On a proforma turn on 2026-08-18 a real visitor was told, in one answer
 * (persisted verbatim in `ai_messages`):
 *
 *   «درخواست تو برای پیش‌فاکتور … به ثبت رسیده است.»
 *   «نام کاربری یا رمز عبور را در اینجا ننویسید — …»
 *   «⚠️ نکته مهم: … قبل از پرداخت، قیمت‌ها را دوباره چک کنید.»
 *
 * and on an earlier turn «*نکته: پرداخت و ارسال فاکتور پس از تأیید نهایی
 * انجام خواهد شد.*» and «درخواست شما ثبت شد. شمارهٔ پیگیری: PF-…».
 *
 * All of it is false. Ahantime has **no online payment** — a locked product
 * decision, not a missing feature. `prepareProforma` files nothing: it draws a
 * card, and only the visitor's own tap on «تأیید و ثبت درخواست» files the
 * request. Login is mobile+OTP; there is no password anywhere on this site,
 * so a sentence about passwords teaches a buyer a threat model that does not
 * match the product they are on.
 *
 * Rules 4 and 4-پ already forbid every one of these in plain words. They are
 * still being emitted, on the one turn where the visitor is about to hand over
 * their contact details — the worst possible moment to be wrong about money
 * and account security. So this is the deterministic floor under those rules,
 * the same move the register (informalVoice) and the scratchpad leak
 * (looksLikeLeakedReasoning) already needed.
 *
 * WHY REMOVAL, NOT A RETRY. The leak guard blanks the whole answer because a
 * scratchpad has nothing worth keeping. Here the opposite is true: the answer
 * is a correct proforma summary with one added sentence that is a lie, and
 * that sentence is always ADDITIVE — dropping it leaves a complete answer with
 * its next step intact (verified against all four production samples above).
 * A retry would also cost another relay round trip on precisely the turn that
 * already makes 3-4 of them and is the one most likely to hit the deadline.
 * And the confirmation card is emitted DURING tool execution, i.e. before this
 * text exists, so blanking the answer would leave a card with an outage notice
 * under it. Removal-only, like collapseImmediateRepeat: it can never introduce
 * text, so it cannot move a number past the grounding validator that ran
 * first. If it empties the answer entirely, that is handled upstream exactly
 * as an empty answer already is.
 *
 * The unit is the SENTENCE, so a paragraph keeps everything true in it: «قیمت
 * نهایی … ممکن است تغییر کند.» survives; «قبل از پرداخت، قیمت‌ها را دوباره چک
 * کنید.» next to it does not.
 */

/** Where a payment word stops being a payment word: «پرداخته شده» is «dealt
 *  with» and «پرداختن به» is «to address», both ordinary in a guide answer. */
const PAYMENT_WORD = /پرداخت(?![هن])|واریز|تسویه/gu;

/** Bank details are a payment step no matter who is said to provide them, so
 *  these are not eligible for the کارشناس exemption below. «کارت» alone is
 *  excluded on purpose — the confirmation card is «کارت» in every answer. */
const BANK_DETAILS = /شمارهٔ?[\s‌]*(?:کارت|حساب|شبا)|کارت[\s‌]*به[\s‌]*کارت/u;

/** Phrasings that assert a payment step exists — either by presupposing one in
 *  time («قبل از پرداخت»), by naming its machinery («درگاه پرداخت»), or by
 *  telling the customer to do it. These override the کارشناس exemption:
 *  «بعد از پرداخت، کارشناس تماس می‌گیرد» is still a payment step. */
const PAYMENT_STEP =
  /(?:قبل|پیش|بعد|پس|هنگام|موقع|زمان|حین)[\s‌]*از[\s‌]*پرداخت|(?:هنگام|موقع|زمان|حین|مرحلهٔ?|روش|شیوهٔ?|درگاه|لینک|صفحهٔ?)[\s‌]*پرداخت|پرداخت[\s‌]*(?:کن|نما|می‌کن|شود|شده)/u;

/**
 * The one payment sentence the prompt REQUIRES, rule 4-پ: «شرایط تسویه هم فقط
 * با همین جمله بیان می‌شود که کارشناس اعلامش می‌کند». An answer that hands the
 * settlement question to the sales expert is correct and must survive.
 */
const DEFERRED_TO_EXPERT = /کارشناس/u;

/** Existence denials, checked in a tight window around each payment/credential
 *  word so a negation elsewhere in the sentence cannot launder a claim. The
 *  list is explicit rather than a general «نمی‌…» because the production
 *  violation itself ends in «ننویسید» — a prohibition, not a denial that the
 *  thing exists. */
const DENIAL_AFTER =
  /^[^.؟!؛\n]{0,30}?(?:ندار|نیست|نداشت|لازم نیست|نمی‌(?:شود|شه|کنیم|گیرد|گیریم|آید|پذیریم|خواهیم|دهیم|ماند))/u;
/** The word boundary is load-bearing: «هزینه» and «ماهانه» END in «نه», so
 *  without it «هزینهٔ پرداخت» would read as a denial of payment. */
const DENIAL_BEFORE = /(?<![\p{L}])(?:بدون|هیچ‌?گونه|هیچ|نه)[\s‌][^.؟!؛\n]{0,18}$/u;

/** «X has already been filed». The request noun has to be RIGHT THERE, because
 *  «ثبت شده» on its own is something rule 2 makes the advisor say about PRICES
 *  several times a day («آخرین قیمت ثبت‌شده …», «قیمتی ثبت نشده»), and those
 *  answers must not lose a sentence. Future and subjunctive forms escape by
 *  construction: Persian puts the auxiliary between («ثبت خواهد شد», «ثبت
 *  می‌شود»), so only the completed form matches. */
const FILED_ALREADY = [
  /به[\s‌]*ثبت[\s‌]*رسید/u,
  // «شد(?:…)?(?!ن)» rather than «شد(?!ن)…»: the infinitive «ثبت شدن درخواست»
  // is a noun, not a claim, but «درخواست‌ها ثبت شدند» is one.
  /(?:درخواست|سفارش|پیش‌?[\s‌]*فاکتور)[^.؟!؛\n]{0,24}?(?:ثبت|صادر|نهایی|ارسال)[\s‌]*(?:شد(?:ه|م|یم|ند)?(?!ن)|گردید|کرد(?:م|یم))(?![\p{L}])/u,
];

/**
 * A tracking code being HANDED OVER — «شمارهٔ پیگیری: PF-…». Only a filed
 * request has one, so a fabricated code is the same false claim wearing a
 * number, and rule 4 bans it in the same breath («هرگز کد پیگیری نساز»). It
 * has to be here rather than left to the grounding validator, which passes an
 * alphanumeric code straight through: dropping «درخواست شما ثبت شد.» while
 * leaving «شمارهٔ پیگیری: PF-14050525-0002-J8CG8H» under it would be worse
 * than either alone.
 *
 * Requiring the code itself — or a back-reference to one, «شمارهٔ پیگیری بالا»,
 * which the same production answer used a paragraph later — is what keeps «هر
 * محصول کد رهگیری یکتا دارد» out of it: a true, guide-sourced fact about mill
 * authenticity that the advisor has answered with in production.
 */
const TRACKING_CODE_GIVEN =
  /(?:کد|شمارهٔ?)[\s‌]*(?:پیگیری|رهگیری)(?:[^\p{L}\n]{0,8}[A-Za-z0-9][A-Za-z0-9۰-۹-]{3,}|[\s‌]*(?:بالا|فوق))/u;

/** Credentials. «رمز» on its own is deliberately absent: «رمز یکبار مصرف» is a
 *  real and correct name for the OTP this site actually uses. */
const CREDENTIAL = /رمز[\s‌]*عبور|رمزعبور|کلمهٔ?[\s‌]*عبور|گذرواژه|پسورد|نام[\s‌]*کاربری|password|username/iu;

/** True when every occurrence of `word` in `sentence` sits next to a denial —
 *  i.e. the sentence says the thing does NOT exist, which is often exactly
 *  what the advisor is supposed to say. */
function everyOccurrenceIsDenied(sentence: string, word: RegExp): boolean {
  const re = new RegExp(word.source, word.flags.includes('g') ? word.flags : `${word.flags}g`);
  let seen = false;
  for (const m of sentence.matchAll(re)) {
    seen = true;
    const before = sentence.slice(0, m.index);
    const after = sentence.slice(m.index + m[0].length);
    if (!DENIAL_AFTER.test(after) && !DENIAL_BEFORE.test(before)) return false;
  }
  return seen;
}

/** True when this sentence tells the customer something about payment, filing
 *  or credentials that is not true of this product. */
export function statesSomethingUntrue(sentence: string): boolean {
  if (FILED_ALREADY.some((re) => re.test(sentence))) return true;
  if (TRACKING_CODE_GIVEN.test(sentence)) return true;
  if (CREDENTIAL.test(sentence) && !everyOccurrenceIsDenied(sentence, CREDENTIAL)) return true;

  PAYMENT_WORD.lastIndex = 0;
  const mentionsPayment = PAYMENT_WORD.test(sentence) || BANK_DETAILS.test(sentence);
  if (!mentionsPayment) return false;
  // «پرداخت آنلاین نداریم» is the truth, and rule 4-پ has the advisor say it.
  if (everyOccurrenceIsDenied(sentence, PAYMENT_WORD) && !BANK_DETAILS.test(sentence)) return false;
  if (PAYMENT_STEP.test(sentence) || BANK_DETAILS.test(sentence)) return true;
  // Anything else about payment is wrong unless it is the one sentence rule
  // 4-پ allows: the sales expert states the settlement terms.
  return !DEFERRED_TO_EXPERT.test(sentence);
}

/** What is left of a line once a removed sentence takes its bullet or emphasis
 *  markers with it — «*» alone is not an answer. */
const MARKDOWN_NOISE_ONLY = /^[\s*_#>\-–—•·:|]*$/u;

function stripSentencesFromLine(line: string): string {
  if (!line.trim()) return line;
  // Odd indices are the inter-sentence gaps, so a kept sentence keeps its
  // spacing exactly. The split needs whitespace after the terminator, which is
  // what stops it firing inside «۲۹۰.۳۷».
  const parts = line.split(/((?<=[.؟!؛])[ \t]+)/u);
  let out = '';
  let removed = false;
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i] ?? '';
    if (sentence.trim() && statesSomethingUntrue(sentence)) {
      removed = true;
      continue;
    }
    out += sentence + (parts[i + 1] ?? '');
  }
  if (!removed) return line;
  return MARKDOWN_NOISE_ONLY.test(out) ? '' : out.trimEnd();
}

/**
 * Drop every sentence that claims a payment step, an already-filed request or
 * a password exists. Returns `text` unchanged when there is nothing to drop,
 * which is the overwhelmingly common case.
 */
export function stripFalseProcessClaims(text: string): string {
  if (!text.trim()) return text;
  const out = text.split('\n').map(stripSentencesFromLine).join('\n');
  if (out === text) return text;
  // A removed paragraph leaves its blank lines behind; two is a paragraph
  // break, three is a hole where a sentence used to be.
  return out.replace(/\n{3,}/gu, '\n\n').trim();
}
