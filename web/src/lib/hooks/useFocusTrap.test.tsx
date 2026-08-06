import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
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
