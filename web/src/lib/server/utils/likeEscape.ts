/**
 * LIKE/ILIKE pattern escaping for user-supplied search text.
 *
 * `%`, `_` and `\` are pattern metacharacters, not literals. Interpolating a
 * search box straight into `%${q}%` therefore has two failure modes, and both
 * were live in this codebase:
 *
 *  1. WRONG RESULTS — an admin searching the literal size «40_40» matched
 *     «40x40» (and every other `40?40`); a customer-service search for a `%`
 *     in a note matched every row in the table. The search box silently
 *     answers a different question than the one that was typed.
 *  2. CHEAP DoS — a single `%` (or worse, `%_%_%_%_%_%`) turns a bounded
 *     substring scan into a full table scan that no trigram index can help
 *     with, on endpoints that are reachable before any expensive work is
 *     rate-limited. On the admin list endpoints it is one anonymous-ish query
 *     away from pinning a connection out of a ten-slot pool.
 *
 * Postgres' default LIKE escape character is backslash (no explicit `ESCAPE`
 * clause needed), so escaping `\`, `%` and `_` with a backslash is sufficient
 * and portable across every LIKE/ILIKE call site here. `\` MUST be escaped
 * first — doing it via one character class in a single pass (rather than three
 * sequential `.replace()` calls) is what stops a user-typed `\` from turning
 * into an escape for the metacharacter that follows it.
 */
import { normalizeDigits, toPersianDigits } from '@/lib/utils/format';

/** Escape LIKE/ILIKE metacharacters so `term` matches literally. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * The `%…%` "contains" pattern for a user-supplied term, escaped.
 *
 * Use this instead of hand-writing `` `%${escapeLike(q)}%` `` — the whole
 * class of bug is someone adding a new ILIKE predicate and forgetting the
 * inner call, which no test catches because the happy path still works.
 */
export function likeContains(term: string): string {
  return `%${escapeLike(term)}%`;
}

/**
 * The `%…%` patterns for a search term in BOTH digit spellings, deduped.
 *
 * An admin panel search box is typed on whatever keyboard layout the machine
 * happens to be on. Mobile numbers, order/lead refs and warehouse codes are
 * stored Latin-only, so a rep on a Persian layout typing «۰۹۱۲…» matched
 * nothing at all and concluded the customer wasn't in the system — while
 * product names and sizes are stored the other way round, so normalizing the
 * term to Latin instead would have broken those. Searching both spellings is
 * the only answer that covers a mixed column set with one box.
 *
 * A term with no digits yields exactly one pattern, so the common case costs
 * nothing. `catalogAdminRepo` builds the same set inline for its six-column
 * SKU search; this is that idea, shared.
 */
export function likeContainsDigitVariants(term: string): string[] {
  return [...new Set([term, toPersianDigits(term), normalizeDigits(term)])].map(likeContains);
}
