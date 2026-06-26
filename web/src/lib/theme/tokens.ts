/**
 * Token bridge for JS/Canvas contexts (charts, dynamic styles) that can't read CSS.
 * These reference the SAME semantic tokens defined in `styles/tokens.css`, so they
 * stay theme-correct. Use `cssVar(name)` in inline styles; use `readToken()` at
 * runtime (client only) when a concrete color string is required (e.g. canvas).
 */

/** Names of the semantic tokens we expose to JS. */
export const TOKEN = {
  accent: '--color-accent',
  accentText: '--color-accent-text',
  accentTint: '--color-accent-tint',
  action: '--color-action',
  gain: '--color-gain',
  loss: '--color-loss',
  textStrong: '--color-text-strong',
  text: '--color-text',
  textMuted: '--color-text-muted',
  hairline: '--color-hairline',
  surface: '--color-surface',
} as const;

export type TokenName = keyof typeof TOKEN;

/** `var(--token)` string for inline styles. */
export function cssVar(name: TokenName): string {
  return `var(${TOKEN[name]})`;
}

/** Resolve a token to its computed color (client-only; needs the DOM). */
export function readToken(name: TokenName): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(TOKEN[name]).trim();
}

/** Chart palette (E7) — resolved at render time so it follows the active theme. */
export function chartColors() {
  return {
    line: readToken('accent'),
    grid: readToken('hairline'),
    gain: readToken('gain'),
    loss: readToken('loss'),
    axis: readToken('textMuted'),
  };
}
