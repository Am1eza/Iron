import { describe, it, expect } from 'vitest';
import { minutesFromWordCount } from './readingTime';

describe('minutesFromWordCount', () => {
  it('rounds up to the next whole minute', () => {
    expect(minutesFromWordCount(201)).toBe(2);
    expect(minutesFromWordCount(400)).toBe(2);
    expect(minutesFromWordCount(401)).toBe(3);
  });

  it('never reads as zero minutes for a short piece', () => {
    expect(minutesFromWordCount(1)).toBe(1);
    expect(minutesFromWordCount(0)).toBe(1);
  });

  it('treats non-finite or negative input as a 1-minute read', () => {
    expect(minutesFromWordCount(-5)).toBe(1);
    expect(minutesFromWordCount(NaN)).toBe(1);
  });
});
