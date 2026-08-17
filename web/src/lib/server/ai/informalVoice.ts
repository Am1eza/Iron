/**
 * The register safety net: formal second-person-plural → informal singular, on
 * the forms where that transformation is mechanical and always correct.
 *
 * The prompt asks for تو in three places (persona line, rule 17, rule 21-22)
 * and a reminder is injected next to the conversation, and across live runs
 * this model still holds the register for three turns and then answers
 * «می‌بینید گریدهای … اگر … هستید … آیا می‌خواهید قیمت را بررسی کنیم؟». A
 * prompt cannot make a 30B model consistent; this can, for the part of the
 * problem that is pure morphology.
 *
 * SCOPE, deliberately narrow. Persian present-indicative second person plural
 * is the singular plus a final «د»: می‌کنید→می‌کنی, می‌بینید→می‌بینی,
 * می‌خواهید→می‌خواهی. Dropping it is correct for EVERY verb, with no syntax
 * needed. The same is true of هستید→هستی, نیستید→نیستی, دارید→داری, and of the
 * bare pronoun شما→تو.
 *
 * What this deliberately does NOT touch: bare subjunctive/imperative forms
 * («ثبت کنید», «بزنید», «ببینید», «بگیرید», «بفرمایید»). Those map to «کن» as
 * an imperative but «کنی» as a subjunctive, and telling the two apart needs
 * the surrounding syntax — a wrong guess produces Persian that reads broken,
 * which is worse than Persian that reads formal. Those stay the prompt's job.
 *
 * This changes grammar, never content: no number, name, claim or ordering is
 * touched, so it cannot affect grounding (it runs after sanitizeGrounded).
 */

/**
 * `می‌` + stem + `ید` at a word boundary → the same verb, singular.
 *
 * The ZWNJ-joined `می‌` prefix is what makes this safe: it guarantees a
 * present-tense verb, so nouns that merely end in «ید» (تأیید، خرید، کلید،
 * جدید، امید، سفید) can never match.
 *
 * The `[^\sاآو]` before «ید» is the second guard, and it is load-bearing: a
 * stem ending in ا/آ takes «ید» in the THIRD person singular («می‌آید»,
 * «می‌فرماید», «می‌گشاید», «می‌نماید»), where the «ی» belongs to the stem and
 * only the «د» is the ending. Stripping «د» there would produce «می‌آی».
 * Those same verbs form the second person plural with «یید» («می‌آیید»),
 * whose preceding character is «ی», so they still convert correctly.
 * «و» is excluded for a different reason: «می‌شوید» is both «you (pl) become»
 * and «he washes», and no rule can tell them apart without the sentence, so
 * the safe direction is to leave it formal rather than mangle the other verb.
 */
const INDICATIVE_PLURAL = /می‌(\S*?[^\sاآو])ید(?![\p{L}])/gu;

/** The irregulars and the pronoun, each anchored at a word boundary so
 *  «شماره», «شمارش», «دارید» inside a longer word are untouched. */
const WORD_SUBSTITUTIONS: Array<[RegExp, string]> = [
  [/(?<![\p{L}])هستید(?![\p{L}])/gu, 'هستی'],
  [/(?<![\p{L}])نیستید(?![\p{L}])/gu, 'نیستی'],
  [/(?<![\p{L}])دارید(?![\p{L}])/gu, 'داری'],
  [/(?<![\p{L}])ندارید(?![\p{L}])/gu, 'نداری'],
  [/(?<![\p{L}])شما(?![\p{L}])/gu, 'تو'],
];

/**
 * Rewrite the mechanical formal forms in `text` to their informal singular.
 * Idempotent, and a no-op on text that is already informal.
 */
export function toInformalSecondPerson(text: string): string {
  if (!text) return text;
  let out = text.replace(INDICATIVE_PLURAL, 'می‌$1ی');
  for (const [pattern, replacement] of WORD_SUBSTITUTIONS) out = out.replace(pattern, replacement);
  return out;
}
