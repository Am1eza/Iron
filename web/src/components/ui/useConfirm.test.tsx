import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useConfirm } from './useConfirm';

const options = { title: 'Confirm', body: 'Continue?' };

describe('useConfirm pending decisions', () => {
  it('cancels the old decision when another prompt replaces it', async () => {
    const { result, unmount } = renderHook(() => useConfirm());
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.confirm(options);
    });
    act(() => {
      second = result.current.confirm({ ...options, title: 'Replacement' });
    });
    await expect(first).resolves.toBe(false);
    unmount();
    await expect(second).resolves.toBe(false);
  });

  it('resolves an abandoned prompt as cancelled on unmount', async () => {
    const { result, unmount } = renderHook(() => useConfirm());
    let decision!: Promise<boolean>;
    act(() => {
      decision = result.current.confirm(options);
    });
    unmount();
    await expect(decision).resolves.toBe(false);
  });
});
