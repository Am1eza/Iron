/**
 * The editable پیش‌فاکتور card.
 *
 * This is the money path, so the tests are about the invariant rather than the
 * interaction: the card may CHANGE an order, and it may never PRICE one. Every
 * figure it shows arrives from the server, an edit sends only what changed,
 * and the confirm button remains the single thing that files anything.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/errors';

vi.mock('@/lib/api', () => ({
  API_MODE: 'live',
  api: { ai: { updateDraft: vi.fn(), confirmLead: vi.fn() } },
  isApiError: (e: unknown) => e instanceof ApiError,
}));
vi.mock('@/lib/analytics/track', () => ({ trackGoal: vi.fn() }));
vi.mock('@/lib/stores/auth', () => ({
  useAuthStore: (sel: (s: { status: string }) => unknown) => sel({ status: 'authenticated' }),
}));

const cartAdd = vi.fn();
vi.mock('@/lib/stores/cart', () => ({
  useCartStore: (sel: (s: { add: typeof cartAdd }) => unknown) => sel({ add: cartAdd }),
}));

import { api } from '@/lib/api';
import { ProformaCard, type LeadDraftView } from './ProformaCard';

const updateDraft = api.ai.updateDraft as unknown as ReturnType<typeof vi.fn>;
const confirmLead = api.ai.confirmLead as unknown as ReturnType<typeof vi.fn>;

const DRAFT: LeadDraftView = {
  draftId: 'd1',
  items: [
    { skuId: 'sku-1', name: 'میلگرد ۱۴ ذوب‌آهن', qty: 3000, unit: 'kg', unitPrice: 42_000, lineTotal: 126_000_000, weightKg: 1 },
  ],
  totalWeightKg: 3000,
  total: 126_000_000,
  allPriced: true,
  signedIn: true,
};

beforeEach(() => {
  updateDraft.mockReset();
  confirmLead.mockReset();
  cartAdd.mockReset();
});

describe('ProformaCard — editing', () => {
  it('sends only WHAT changed, never a price', async () => {
    updateDraft.mockResolvedValue({ ...DRAFT, items: [{ ...DRAFT.items[0]!, qty: 5000, lineTotal: 210_000_000 }] });
    const onChanged = vi.fn();
    render(<ProformaCard draft={DRAFT} onConfirmed={vi.fn()} onChanged={onChanged} />);

    const qty = screen.getByLabelText(/مقدار میلگرد/);
    await userEvent.clear(qty);
    await userEvent.type(qty, '۵۰۰۰'); // as an Iranian keyboard actually types
    await userEvent.tab(); // commit on blur, not per keystroke

    await waitFor(() => expect(updateDraft).toHaveBeenCalledTimes(1));
    const sent = updateDraft.mock.calls[0]![0] as { items: Record<string, unknown>[] };
    expect(sent.items[0]).toEqual({ skuId: 'sku-1', qty: 5000, unit: 'kg' });
    // The invariant: no money crosses the wire on the way IN. A total the
    // customer keeps must never be a number their own browser computed.
    expect(JSON.stringify(sent)).not.toContain('42000');
    expect(JSON.stringify(sent)).not.toContain('lineTotal');
  });

  it('adopts the server’s repriced card rather than recomputing locally', async () => {
    updateDraft.mockResolvedValue({
      draftId: 'd1',
      items: [{ ...DRAFT.items[0]!, qty: 5000, lineTotal: 210_000_000 }],
      totalWeightKg: 5000,
      total: 210_000_000,
      allPriced: true,
    });
    const onChanged = vi.fn();
    render(<ProformaCard draft={DRAFT} onConfirmed={vi.fn()} onChanged={onChanged} />);

    const qty = screen.getByLabelText(/مقدار میلگرد/);
    await userEvent.clear(qty);
    await userEvent.type(qty, '5000'); // …and Latin digits work too
    await userEvent.tab();

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(onChanged.mock.calls[0]![0]).toMatchObject({ total: 210_000_000, totalWeightKg: 5000 });
  });

  it('shows the quantity in Persian digits, like every other figure on the site', () => {
    render(<ProformaCard draft={DRAFT} onConfirmed={vi.fn()} onChanged={vi.fn()} />);
    const qty = screen.getByLabelText(/مقدار میلگرد/) as HTMLInputElement;
    // `type="number"` cannot hold this, which is why the field is a text
    // input with a numeric inputMode.
    expect(qty.value).toBe('۳,۰۰۰');
    expect(qty).toHaveAttribute('inputmode', 'numeric');
  });

  it('does not call the server when the quantity did not actually change', async () => {
    render(<ProformaCard draft={DRAFT} onConfirmed={vi.fn()} onChanged={vi.fn()} />);
    const qty = screen.getByLabelText(/مقدار میلگرد/);
    await userEvent.click(qty);
    await userEvent.tab();
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it('restores the last good value when the typed one is not a quantity', async () => {
    render(<ProformaCard draft={DRAFT} onConfirmed={vi.fn()} onChanged={vi.fn()} />);
    const qty = screen.getByLabelText(/مقدار میلگرد/) as HTMLInputElement;
    await userEvent.clear(qty);
    await userEvent.tab();
    expect(updateDraft).not.toHaveBeenCalled();
    // Restored in the same Persian-digit, grouped form it was shown in.
    expect(qty.value).toBe('۳,۰۰۰');
  });

  it('opts every field out of browser autofill', () => {
    // Observed in a real browser: Chrome read the city `<select>` as an
    // address field and autofilled it, changing «مشهد» to «کرمانشاه» on its
    // own — and autofill dispatches a real change event, so it fired an edit.
    // The customer would have confirmed a پیش‌فاکتور destined somewhere they
    // never chose, with no visible moment where they changed it.
    render(<ProformaCard draft={{ ...DRAFT, city: 'مشهد' }} onConfirmed={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByLabelText('شهر تحویل')).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText(/مقدار میلگرد/)).toHaveAttribute('autocomplete', 'off');
  });

  it('sends the delivery city as a real change of its own', async () => {
    updateDraft.mockResolvedValue({ ...DRAFT, city: 'مشهد' });
    render(<ProformaCard draft={DRAFT} onConfirmed={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText('شهر تحویل'), 'مشهد');
    await waitFor(() => expect(updateDraft).toHaveBeenCalled());
    expect(updateDraft.mock.calls[0]![0]).toMatchObject({ city: 'مشهد' });
  });

  it('says so, without losing the card, when an edit fails', async () => {
    updateDraft.mockRejectedValue(new ApiError(410, 'این خلاصه منقضی شده است.'));
    render(<ProformaCard draft={DRAFT} onConfirmed={vi.fn()} onChanged={vi.fn()} />);
    const qty = screen.getByLabelText(/مقدار میلگرد/);
    await userEvent.clear(qty);
    await userEvent.type(qty, '4000');
    await userEvent.tab();
    expect(await screen.findByRole('alert')).toHaveTextContent('این خلاصه منقضی شده است.');
    // The confirm control survives: the visitor can still file what they have.
    expect(screen.getByRole('button', { name: 'تأیید و ثبت درخواست' })).toBeInTheDocument();
  });
});

describe('ProformaCard — actions', () => {
  it('files nothing until the confirm button is pressed', async () => {
    updateDraft.mockResolvedValue(DRAFT);
    render(<ProformaCard draft={DRAFT} onConfirmed={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText('شهر تحویل'), 'تهران');
    await waitFor(() => expect(updateDraft).toHaveBeenCalled());
    // Editing is not ordering.
    expect(confirmLead).not.toHaveBeenCalled();
  });

  it('confirms with the draft id and reports the reference back', async () => {
    confirmLead.mockResolvedValue({ ref: 'AH-1404', proformaRef: 'PF-9', total: 126_000_000 });
    const onConfirmed = vi.fn();
    render(<ProformaCard draft={DRAFT} onConfirmed={onConfirmed} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'تأیید و ثبت درخواست' }));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalled());
    expect(confirmLead).toHaveBeenCalledWith('d1');
    expect(onConfirmed.mock.calls[0]![0]).toMatchObject({ confirmedRef: 'AH-1404' });
  });

  it('pushes every line into the cart with its server-priced figures', async () => {
    render(<ProformaCard draft={DRAFT} onConfirmed={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'افزودن به سبد' }));
    expect(cartAdd).toHaveBeenCalledWith(
      expect.objectContaining({ skuId: 'sku-1', qty: 3000, unit: 'kg', unitPrice: 42_000 }),
    );
    expect(await screen.findByRole('button', { name: 'به سبد اضافه شد' })).toBeInTheDocument();
  });

  it('hands the same list to WhatsApp that is on the card', () => {
    render(<ProformaCard draft={{ ...DRAFT, city: 'مشهد' }} onConfirmed={vi.fn()} onChanged={vi.fn()} />);
    const link = screen.getByRole('link', { name: /واتساپ/ });
    const text = decodeURIComponent(link.getAttribute('href')!.split('text=')[1]!);
    expect(text).toContain('میلگرد ۱۴ ذوب‌آهن');
    expect(text).toContain('مشهد');
  });

  it('offers a way to a human on the card people hesitate over', () => {
    render(<ProformaCard draft={DRAFT} onConfirmed={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByRole('link', { name: /۰۹۱۲/ })).toHaveAttribute('href', 'tel:09121395954');
  });

  it('stops being editable once it has been confirmed', () => {
    render(
      <ProformaCard
        draft={{ ...DRAFT, confirmedRef: 'AH-1404', proformaRef: 'PF-9' }}
        onConfirmed={vi.fn()}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/مقدار میلگرد/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /دانلود پیش‌فاکتور/ })).toHaveAttribute('href', '/proforma/PF-9');
  });
});
