/**
 * Web Speech API feature detection — پیمانکار با دست‌های سیمانی تایپ نمی‌کند:
 * the advisor's composer offers voice input where the browser supports it
 * (Chrome/Edge/Safari ship it `webkit`-prefixed) and renders nothing where it
 * doesn't. TypeScript's dom lib has no SpeechRecognition typings, so the
 * minimal shape the composer needs is declared here.
 */

export interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/**
 * The SpeechRecognition constructor (standard name preferred, then the
 * `webkit` prefix) or null when the environment has none — including SSR,
 * where `window` itself is absent. Pure: the host object is injectable so
 * the detection logic is unit-testable without a browser.
 */
export function getSpeechRecognition(
  host: Record<string, unknown> | undefined = typeof window === 'undefined'
    ? undefined
    : (window as unknown as Record<string, unknown>),
): SpeechRecognitionCtor | null {
  if (!host) return null;
  const ctor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
  return typeof ctor === 'function' ? (ctor as SpeechRecognitionCtor) : null;
}
