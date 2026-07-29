/**
 * The gating logic here IS the point of this component (a rep must not be
 * able to submit "بعداً تماس بگیرم" with no time chosen), so it's covered
 * with real interaction, not just a render smoke test.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CallOutcomeModal } from './CallOutcomeModal';

describe('CallOutcomeModal', () => {
  it('keeps submit disabled until an outcome is chosen', () => {
    render(<CallOutcomeModal open leadRef="LD-1" onClose={() => {}} onSubmit={() => {}} />);
    expect(screen.getByRole('button', { name: 'ثبت نتیجه' })).toBeDisabled();
  });

  it('submits a plain outcome with a composed note and no callbackAt', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CallOutcomeModal open leadRef="LD-1" onClose={() => {}} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('radio', { name: /پاسخ داد/ }));
    expect(screen.getByRole('button', { name: 'ثبت نتیجه' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'ثبت نتیجه' }));

    expect(onSubmit).toHaveBeenCalledWith({ outcome: 'answered', note: 'نتیجهٔ تماس: پاسخ داد', callbackAt: undefined });
  });

  it('appends the rep\'s free-text note after the outcome tag', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CallOutcomeModal open leadRef="LD-1" onClose={() => {}} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('radio', { name: /پاسخ نداد/ }));
    await user.type(screen.getByLabelText('توضیح کوتاه (اختیاری)'), 'سه بار زنگ خورد');
    await user.click(screen.getByRole('button', { name: 'ثبت نتیجه' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ note: 'نتیجهٔ تماس: پاسخ نداد — سه بار زنگ خورد' }),
    );
  });

  it('requires a callback time for "بعداً تماس بگیرم" before submit is enabled', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CallOutcomeModal open leadRef="LD-1" onClose={() => {}} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('radio', { name: /بعداً تماس بگیرم/ }));
    expect(screen.getByRole('button', { name: 'ثبت نتیجه' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'فردا ۹:۰۰' }));
    expect(screen.getByRole('button', { name: 'ثبت نتیجه' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'ثبت نتیجه' }));
    const result = onSubmit.mock.calls[0]![0];
    expect(result.outcome).toBe('later');
    expect(result.callbackAt).toEqual(expect.any(String));
    expect(new Date(result.callbackAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('shows the hand-off hint when "علاقه‌مند نبود" is selected', async () => {
    const user = userEvent.setup();
    render(<CallOutcomeModal open leadRef="LD-1" onClose={() => {}} onSubmit={() => {}} />);

    await user.click(screen.getByRole('radio', { name: /علاقه‌مند نبود/ }));
    expect(screen.getByText(/پنجرهٔ «سرنخ ناموفق» باز می‌شود/)).toBeInTheDocument();
  });

  it('resets to a clean slate every time it re-opens', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CallOutcomeModal open leadRef="LD-1" onClose={() => {}} onSubmit={() => {}} />);
    await user.click(screen.getByRole('radio', { name: /پاسخ داد/ }));
    expect(screen.getByRole('radio', { name: /پاسخ داد/ })).toHaveAttribute('aria-checked', 'true');

    rerender(<CallOutcomeModal open={false} leadRef="LD-1" onClose={() => {}} onSubmit={() => {}} />);
    rerender(<CallOutcomeModal open leadRef="LD-2" onClose={() => {}} onSubmit={() => {}} />);

    expect(screen.getByRole('radio', { name: /پاسخ داد/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('button', { name: 'ثبت نتیجه' })).toBeDisabled();
  });

  it('renders nothing when closed', () => {
    render(<CallOutcomeModal open={false} leadRef="LD-1" onClose={() => {}} onSubmit={() => {}} />);
    expect(screen.queryByText('ثبت نتیجهٔ تماس')).not.toBeInTheDocument();
  });
});
