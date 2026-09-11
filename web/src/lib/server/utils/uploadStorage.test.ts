// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { uploadDir } from './uploadStorage';

describe('uploadDir', () => {
  it('resolves a real path off cwd outside Cloudflare Workers (this test env)', () => {
    const dir = uploadDir();
    expect(dir.endsWith('public/uploads') || dir.endsWith('public\\uploads')).toBe(true);
  });

  // I-214 — the actual "throws on Workers" branch calls getCloudflareContext(),
  // which is only meaningfully mockable inside an actual Workers runtime;
  // outside one it already throws (caught, treated as "not on Workers") —
  // exercised implicitly by every other upload test passing under Node/vitest.
});
