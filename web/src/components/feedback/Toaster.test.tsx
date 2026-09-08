import { StrictMode } from 'react';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUiStore } from '@/lib/stores/ui';
import { Toaster } from './Toaster';


beforeEach(() => {
  vi.useFakeTimers();
  useUiStore.setState({ toasts: [] });
  useUiStore
    .getState()
    .addToast({ message: 'Saved', variant: 'success', action: { label: 'Action' } });
});
afterEach(() => {
  vi.useRealTimers();
  useUiStore.setState({ toasts: [] });
});
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe('toast dismissal timers', () => {
  it('dismisses after the timeout under Strict Mode', () => {
    renderWithIntl(
      <StrictMode>
        <Toaster />
      </StrictMode>,
    );
    advance(4000);
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('remains paused after the mouse leaves while keyboard focus is inside', () => {
    renderWithIntl(<Toaster />);
    const toast = screen.getByRole('status');
    advance(1000);
    fireEvent.mouseEnter(toast);
    fireEvent.focus(screen.getByRole('button', { name: 'Action' }));
    fireEvent.mouseLeave(toast);
    advance(8000);
    expect(screen.getByText('Saved')).toBeInTheDocument();
    fireEvent.blur(screen.getByRole('button', { name: 'Action' }), {
      relatedTarget: document.body,
    });
    advance(2999);
    expect(screen.getByText('Saved')).toBeInTheDocument();
    advance(1);
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('does not restart the timer when focus moves between its buttons', () => {
    renderWithIntl(<Toaster />);
    const action = screen.getByRole('button', { name: 'Action' });
    const close = screen.getByRole('button', { name: 'بستن' });
    fireEvent.focus(action);
    fireEvent.blur(action, { relatedTarget: close });
    fireEvent.focus(close);
    advance(8000);
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });
});
