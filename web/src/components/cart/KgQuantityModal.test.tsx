import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KgQuantityModal } from './KgQuantityModal';

describe('KgQuantityModal', () => {
  it('defaults to one branch\'s worth of kg when the branch weight is known', () => {
    render(
      <KgQuantityModal
        open
        onClose={vi.fn()}
        productName="میلگرد ۱۴"
        branchWeightKg={14.5}
        unitPrice={35_000}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getAllByText(/۱۴\.۵/).length).toBeGreaterThan(0);
  });

  it('recomputes the total as the branch count changes, and confirms with that total', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <KgQuantityModal
        open
        onClose={vi.fn()}
        productName="میلگرد ۱۴"
        branchWeightKg={10}
        onConfirm={onConfirm}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'افزایش تعداد شاخه' }));
    await user.click(screen.getByRole('button', { name: 'افزایش تعداد شاخه' }));
    // 3 شاخه × 10kg
    await user.click(screen.getByRole('button', { name: 'افزودن به سبد استعلام' }));
    expect(onConfirm).toHaveBeenCalledWith(30);
  });

  it('switches to a direct weight entry and confirms with the typed value', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <KgQuantityModal
        open
        onClose={vi.fn()}
        productName="میلگرد ۱۴"
        branchWeightKg={10}
        onConfirm={onConfirm}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'وزن مستقیم (کیلوگرم)' }));
    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '250');
    await user.click(screen.getByRole('button', { name: 'افزودن به سبد استعلام' }));
    expect(onConfirm).toHaveBeenCalledWith(250);
  });

  it('has no mode toggle and no default when the branch weight is unknown, and disables confirm until a weight is typed', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <KgQuantityModal open onClose={vi.fn()} productName="محصول ناشناخته" onConfirm={onConfirm} />,
    );
    expect(screen.queryByRole('button', { name: 'تعداد شاخه' })).toBeNull();
    const confirm = screen.getByRole('button', { name: 'افزودن به سبد استعلام' });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByRole('spinbutton'), '100');
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(100);
  });
});
