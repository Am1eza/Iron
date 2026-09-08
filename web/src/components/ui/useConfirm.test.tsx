import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import faMessages from '../../../messages/fa.json';
import { useConfirm } from './useConfirm';

// `useConfirm` calls `useTranslations` unconditionally (for its footer
// buttons' fallback labels), so — same as any client component since the
// i18n audit wired this hook up — it needs a `NextIntlClientProvider`
// ancestor even though this test never actually renders `dialog`. Mirrors
// `renderWithIntl` (src/test/renderWithIntl.tsx), which wraps a rendered
// element rather than a bare hook, so `renderHook`'s own `wrapper` option is
// used here instead.
const intlWrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="fa" messages={faMessages} timeZone="Asia/Tehran">
    {children}
  </NextIntlClientProvider>
);

const options = { title: 'Confirm', body: 'Continue?' };

describe('useConfirm pending decisions', () => {
  it('cancels the old decision when another prompt replaces it', async () => {
    const { result, unmount } = renderHook(() => useConfirm(), { wrapper: intlWrapper });
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
    const { result, unmount } = renderHook(() => useConfirm(), { wrapper: intlWrapper });
    let decision!: Promise<boolean>;
    act(() => {
      decision = result.current.confirm(options);
    });
    unmount();
    await expect(decision).resolves.toBe(false);
  });
});
