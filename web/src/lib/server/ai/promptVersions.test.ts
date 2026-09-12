/**
 * hashPromptText (J-241) — the fingerprint stored alongside `ai_usage` so a
 * future query can tell WHICH exact prompt text generated a given answer,
 * even if an admin later edits a version's text in place under the same
 * `promptVersionId` (PromptVersionsPanel.tsx has no immutability).
 */
import { describe, it, expect } from 'vitest';
import { hashPromptText, resolvePromptText, assignPromptVersion } from './promptVersions';

describe('hashPromptText', () => {
  it('is deterministic for the same text', () => {
    const text = 'تو مشاور هوشمند آهن‌تایم هستی.';
    expect(hashPromptText(text)).toBe(hashPromptText(text));
  });

  it('changes when the text changes by even one character — the whole point', () => {
    const a = hashPromptText('نسخهٔ اول پرامپت.');
    const b = hashPromptText('نسخهٔ اول  پرامپت.'); // one extra space
    expect(a).not.toBe(b);
  });

  it('looks like a sha256 hex digest', () => {
    expect(hashPromptText('x')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is exactly the hash resolvePromptText would produce for a resolved version', () => {
    const versions = [
      { id: 'a', label: 'الف', prompt: 'متن نسخهٔ الف' },
      { id: 'b', label: 'ب', prompt: 'متن نسخهٔ ب' },
    ];
    const resolved = resolvePromptText('a', versions);
    expect(hashPromptText(resolved)).toBe(hashPromptText('متن نسخهٔ الف'));

    // The scenario the audit describes: an admin edits version "a"'s text in
    // place. Same promptVersionId, but the hash now differs — exactly the
    // split promptVersionMetrics() alone cannot make.
    const editedVersions = [{ ...versions[0]!, prompt: 'متن ویرایش‌شدهٔ الف' }, versions[1]!];
    const resolvedAfterEdit = resolvePromptText('a', editedVersions);
    expect(hashPromptText(resolvedAfterEdit)).not.toBe(hashPromptText(resolved));
  });

  it('falls back to the baseline prompt hash for an unassigned/unknown version id, same as resolvePromptText', () => {
    expect(hashPromptText(resolvePromptText(null, []))).toBe(hashPromptText(resolvePromptText(undefined, [])));
    expect(hashPromptText(resolvePromptText('does-not-exist', []))).toBe(hashPromptText(resolvePromptText(null, [])));
  });
});

// Sanity check that assignPromptVersion (used to pick promptVersionId, which
// hashPromptText's callers combine with resolvePromptText) is untouched by
// this change — it stays a pure, deterministic bucket assignment.
describe('assignPromptVersion (unchanged by J-241)', () => {
  it('is off (null) below 2 configured versions', () => {
    expect(assignPromptVersion('conv-1', [])).toBeNull();
    expect(assignPromptVersion('conv-1', [{ id: 'a', label: 'الف', prompt: 'x' }])).toBeNull();
  });
});
