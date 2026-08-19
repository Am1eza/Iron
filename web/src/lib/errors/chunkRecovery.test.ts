import { describe, it, expect } from 'vitest';
import { isReloadableError } from './chunkRecovery';

/** The classification is the load-bearing part: getting it wrong in one
 *  direction leaves a user stuck on an unrecoverable page (the original bug),
 *  and in the other direction reloads the page on errors a reload can't fix. */
describe('isReloadableError', () => {
  it('matches webpack ChunkLoadError by name, whatever the message says', () => {
    const err = new Error('Loading chunk app/layout failed.');
    err.name = 'ChunkLoadError';
    expect(isReloadableError(err)).toBe(true);
  });

  it('matches a ChunkLoadError-named error even with an unhelpful message', () => {
    const err = new Error('');
    err.name = 'ChunkLoadError';
    expect(isReloadableError(err)).toBe(true);
  });

  it('matches the loading-chunk wording without the special name', () => {
    expect(isReloadableError(new Error('Loading chunk 42 failed. (error: /_next/…)'))).toBe(true);
  });

  it.each([
    ['Chrome', 'Failed to fetch'],
    ['Safari', 'Load failed'],
    ['Firefox', 'NetworkError when attempting to fetch resource.'],
  ])('matches the %s wording for a failed fetch', (_browser, message) => {
    expect(isReloadableError(new Error(message))).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isReloadableError(new Error('FAILED TO FETCH'))).toBe(true);
  });

  it.each([
    ['a Postgres pool timeout — the blog/news boundary case', 'connection timeout expired'],
    ['a plain render bug', "Cannot read properties of undefined (reading 'price')"],
    ['a 500 from an API route', 'Request failed with status code 500'],
  ])('does not match %s', (_case, message) => {
    expect(isReloadableError(new Error(message))).toBe(false);
  });
});
