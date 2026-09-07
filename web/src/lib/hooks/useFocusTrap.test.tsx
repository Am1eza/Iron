import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useFocusTrap } from './useFocusTrap';

/**
 * Regression test for the SkuDrawer/TableGridPicker bug: callers routinely
 * pass an inline `onEscape` (`() => doThing()`), a fresh function identity on
 * every render — including every keystroke in a field inside the trap, since
 * typing sets state and re-renders the caller. This harness reproduces that
 * exact shape (state + inline onEscape) rather than a memoized one, so it
 * only passes if the hook itself is robust to churn, not just well-behaved
 * callers.
 */
function Harness() {
  const [text, setText] = useState('');
  // Deliberately NOT wrapped in useCallback — this is the real-world shape
  // that triggered the bug (SkuDrawer passed `() => void requestClose()`
  // inline at the call site).
  const ref = useFocusTrap<HTMLDivElement>(true, () => {});
  return (
    <div ref={ref}>
      <select data-testid="first-field" aria-label="اول" />
      <input
        data-testid="typed-field"
        aria-label="کارخانه"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  );
}

describe('useFocusTrap', () => {
  it('does not steal focus back to the first field while typing in a later field', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const typedField = screen.getByTestId('typed-field');
    await user.click(typedField);
    expect(typedField).toHaveFocus();

    await user.type(typedField, 'ذوب‌آهن');

    expect(typedField).toHaveFocus();
    expect(typedField).toHaveValue('ذوب‌آهن');
  });
});

function Dialog({
  active,
  onEscape,
  modal = true,
}: {
  active: boolean;
  onEscape: () => void;
  modal?: boolean;
}) {
  const ref = useFocusTrap(active, onEscape, { lockScroll: modal });
  return active ? (
    <div ref={ref} tabIndex={-1}>
      <button>Action</button>
    </div>
  ) : null;
}

describe('nested focus traps', () => {
  it('only dismisses the top dialog on Escape', () => {
    const first = vi.fn();
    const second = vi.fn();
    render(
      <>
        <Dialog active onEscape={first} />
        <Dialog active onEscape={second} />
      </>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('keeps scrolling locked if an underlying modal closes first', () => {
    document.body.style.overflow = 'auto';
    const noop = () => {};
    const { rerender, unmount } = render(
      <>
        <Dialog active onEscape={noop} />
        <Dialog active onEscape={noop} />
      </>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    rerender(
      <>
        <Dialog active={false} onEscape={noop} />
        <Dialog active onEscape={noop} />
      </>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('auto');
    document.body.style.overflow = '';
  });

  it('does not give initial focus to disabled fields', () => {
    function DisabledFirst() {
      const ref = useFocusTrap(true);
      return (
        <div ref={ref}>
          <input disabled data-autofocus />
          <button>Enabled</button>
        </div>
      );
    }
    render(<DisabledFirst />);
    expect(screen.getByRole('button', { name: 'Enabled' })).toHaveFocus();
  });

  it('returns focus to the trigger when the dialog closes', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const { unmount } = render(<Dialog active onEscape={() => {}} />);
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});

it('keeps a nested child on top when parent and child mount together', () => {
  const parentEscape = vi.fn();
  const childEscape = vi.fn();
  function Parent() {
    const ref = useFocusTrap(true, parentEscape);
    return (
      <div ref={ref}>
        <button>Parent</button>
        <Dialog active onEscape={childEscape} />
      </div>
    );
  }
  render(<Parent />);
  expect(screen.getByRole('button', { name: 'Action' })).toHaveFocus();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(childEscape).toHaveBeenCalledTimes(1);
  expect(parentEscape).not.toHaveBeenCalled();
});
