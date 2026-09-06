import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InteractionAnalytics } from './InteractionAnalytics';
import { trackGoal } from '@/lib/analytics/track';

vi.mock('@/lib/analytics/track', () => ({ trackGoal: vi.fn() }));

describe('InteractionAnalytics', () => {
  beforeEach(() => vi.mocked(trackGoal).mockClear());

  it('consumes declarative data-event annotations', () => {
    const { getByRole } = render(
      <><InteractionAnalytics /><a href="/search" data-event="search_use" onClick={(e) => e.preventDefault()}>جست‌وجو</a></>,
    );
    fireEvent.click(getByRole('link'));
    expect(trackGoal).toHaveBeenCalledWith('navigation', 'search_use', '/');
  });

  it('tracks phone and WhatsApp hand-offs', () => {
    const { getByText } = render(
      <><InteractionAnalytics /><a href="tel:02100000000" onClick={(e) => e.preventDefault()}>تلفن</a><a href="https://wa.me/989100000000" onClick={(e) => e.preventDefault()}>واتساپ</a></>,
    );
    fireEvent.click(getByText('تلفن'));
    fireEvent.click(getByText('واتساپ'));
    expect(trackGoal).toHaveBeenCalledWith('contact', 'phone-click', '/');
    expect(trackGoal).toHaveBeenCalledWith('contact', 'whatsapp-click', '/');
  });
});
