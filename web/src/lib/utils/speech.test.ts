// @vitest-environment node
/**
 * Feature detection for the composer's voice input: the mic button renders
 * ONLY when a real SpeechRecognition constructor exists — SSR (no window),
 * unsupported browsers and bogus non-constructor globals must all yield null.
 */
import { describe, it, expect } from 'vitest';
import { getSpeechRecognition } from './speech';

class FakeRecognition {}
class FakeWebkitRecognition {}

describe('getSpeechRecognition', () => {
  it('returns the standard constructor when present', () => {
    expect(getSpeechRecognition({ SpeechRecognition: FakeRecognition })).toBe(FakeRecognition);
  });

  it('falls back to the webkit-prefixed constructor (Chrome/Safari ship it this way)', () => {
    expect(getSpeechRecognition({ webkitSpeechRecognition: FakeWebkitRecognition })).toBe(
      FakeWebkitRecognition,
    );
  });

  it('prefers the standard name over the webkit prefix when both exist', () => {
    expect(
      getSpeechRecognition({
        SpeechRecognition: FakeRecognition,
        webkitSpeechRecognition: FakeWebkitRecognition,
      }),
    ).toBe(FakeRecognition);
  });

  it('returns null when the browser has neither', () => {
    expect(getSpeechRecognition({})).toBeNull();
  });

  it('returns null for a non-constructor value (never crashes on a polluted global)', () => {
    expect(getSpeechRecognition({ SpeechRecognition: true })).toBeNull();
    expect(getSpeechRecognition({ webkitSpeechRecognition: 'yes' })).toBeNull();
  });

  it('returns null during SSR, where window is absent (this file runs in node)', () => {
    expect(getSpeechRecognition()).toBeNull();
  });
});
