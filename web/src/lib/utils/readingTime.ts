/** Persian-prose reading speed used across the codebase for the read-time
 *  badge — no measured Persian WPM data behind this, 200 is the common
 *  English-prose estimate and the closest available baseline. */
const WORDS_PER_MINUTE = 200;

/** Rounds up so a short piece never reads as "۰ دقیقه". */
export function minutesFromWordCount(words: number): number {
  if (!Number.isFinite(words) || words <= 0) return 1;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}
