import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoginForm } from './LoginForm';

const nextParam = vi.hoisted(() => ({ current: null as string | null }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nextParam.current ? { next: nextParam.current } : {}),
}));

// Renders the key itself — this test only cares whether `requestFlowNote`
// appears, not its exact wording (see messages.test.ts for translation
// coverage/parity).
vi.mock('next-intl', () => ({
  useLocale: () => 'fa',
  useTranslations: () => (key: string) => key,
}));

describe('LoginForm — reassurance when arriving from the checkout flow (US-P0.4)', () => {
  it('reassures the visitor their cart is preserved when next=/request', () => {
    nextParam.current = '/request';
    render(<LoginForm />);
    expect(screen.getByText('requestFlowNote')).toBeInTheDocument();
  });

  it('says nothing extra for an ordinary login (no next, or an unrelated next)', () => {
    nextParam.current = null;
    render(<LoginForm />);
    expect(screen.queryByText('requestFlowNote')).toBeNull();
  });

  it('stays quiet even with a next param, if it does not point at the request flow', () => {
    nextParam.current = '/account';
    render(<LoginForm />);
    expect(screen.queryByText('requestFlowNote')).toBeNull();
  });
});
