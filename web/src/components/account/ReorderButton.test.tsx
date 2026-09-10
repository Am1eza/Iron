/** E-108: a line item whose SKU was deleted after the order was placed must
 *  give a clear, visible "no longer orderable" state and must never be
 *  silently reordered as some other/nearest SKU — it is simply skipped, with
 *  the customer told which item(s) that happened to. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '@/test/renderWithIntl';
import type { LineItem } from '@/lib/types/domain';
import { ReorderButton } from './ReorderButton';

afterEach(cleanup);

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const cartAdd = vi.fn();
vi.mock('@/lib/stores/cart', () => ({
  useCartStore: (sel: (s: { add: typeof cartAdd }) => unknown) => sel({ add: cartAdd }),
  inferSnapshotPriceBasis: () => 'kg',
}));

const ORDERABLE: LineItem = { orderItemId: '1', skuId: 'sku-1', skuCode: 'sku-1', orderable: true, name: 'میلگرد ۱۴', qty: 2, unit: 'kg', unitPrice: 60000 };
const DELETED: LineItem = { orderItemId: '2', skuId: '', skuCode: 'sku-2-old', historicalSkuId: 'sku-2', orderable: false, name: 'تیرآهن ۱۸ (حذف‌شده)', qty: 1, unit: 'kg', unitPrice: 90000 };

beforeEach(() => {
  push.mockReset();
  cartAdd.mockReset();
});

describe('ReorderButton (E-108)', () => {
  it('when every line is still orderable, adds all of them and never mentions a missing item', async () => {
    renderWithIntl(<ReorderButton items={[ORDERABLE]} />);
    await userEvent.click(screen.getByRole('button', { name: 'سفارش مجدد' }));
    expect(cartAdd).toHaveBeenCalledTimes(1);
    expect(cartAdd).toHaveBeenCalledWith(expect.objectContaining({ skuId: 'sku-1' }));
    expect(push).toHaveBeenCalledWith('/cart');
  });

  it('a mix of orderable and deleted-SKU lines: adds only the orderable one, names the excluded one, never substitutes another SKU', async () => {
    renderWithIntl(<ReorderButton items={[ORDERABLE, DELETED]} />);

    // The clear, visible "no longer orderable" state — named, not just a
    // generic "some items are missing".
    expect(screen.getByText(/تیرآهن ۱۸ \(حذف‌شده\)/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'سفارش مجدد' }));
    // Exactly the still-orderable line was added — the deleted one was
    // skipped outright, not swapped for any other skuId.
    expect(cartAdd).toHaveBeenCalledTimes(1);
    expect(cartAdd).toHaveBeenCalledWith(expect.objectContaining({ skuId: 'sku-1' }));
    expect(cartAdd).not.toHaveBeenCalledWith(expect.objectContaining({ skuId: 'sku-2' }));
    expect(cartAdd).not.toHaveBeenCalledWith(expect.objectContaining({ skuId: '' }));
  });

  it('when every line\'s SKU was deleted, the button is disabled and nothing is ever added', async () => {
    renderWithIntl(<ReorderButton items={[DELETED]} />);
    expect(screen.getByText('کالاهای این سفارش دیگر قابل سفارش نیستند.')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'سفارش مجدد' });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(cartAdd).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
