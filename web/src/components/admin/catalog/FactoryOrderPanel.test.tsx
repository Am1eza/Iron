/**
 * The two-zone model IS the point of this panel, so it is tested through the
 * actual clicks rather than as a render smoke test.
 *
 * What each action SENDS matters more than what it draws: the endpoint
 * replaces the category's whole list, so a button that sends a partial array
 * would silently un-order every mill the admin had already placed — a data
 * loss with no error and no visible cause until someone loads the price page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdminFactoryOrderRow } from '@/lib/api/resources/admin';
import { FactoryOrderPanel } from './FactoryOrderPanel';

const factoryOrder = vi.fn();
const setFactoryOrder =
  vi.fn<(categoryId: string, factories: string[]) => Promise<{ ok: true; count: number }>>();

vi.mock('@/lib/api/resources/admin', () => ({
  adminApi: {
    factoryOrder: (categoryId: string) => factoryOrder(categoryId),
    setFactoryOrder: (categoryId: string, factories: string[]) => setFactoryOrder(categoryId, factories),
  },
}));

const ZOB = 'ذوب‌آهن اصفهان';
const NEY = 'نیشابور';
const KAVIR = 'کویر کاشان';

function reply(factories: AdminFactoryOrderRow[]) {
  factoryOrder.mockResolvedValue({ categoryId: 'c1', factories });
}

async function openPanel() {
  const user = userEvent.setup();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <FactoryOrderPanel categoryId="c1" categoryName="میلگرد" />
    </QueryClientProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'چیدن ترتیب' }));
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  setFactoryOrder.mockResolvedValue({ ok: true as const, count: 0 });
});

describe('FactoryOrderPanel', () => {
  it('fetches nothing until the admin opens it', () => {
    reply([]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <FactoryOrderPanel categoryId="c1" categoryName="میلگرد" />
      </QueryClientProvider>,
    );
    // Collapsed by default — this sits above the product index on every
    // category click, and 12 categories' worth of factory lists is a request
    // per click for a panel most visits never open.
    expect(factoryOrder).not.toHaveBeenCalled();
  });

  it('says the site is still price-sorting when nothing is placed', async () => {
    reply([
      { factory: NEY, order: null, skuCount: 10 },
      { factory: ZOB, order: null, skuCount: 9 },
    ]);
    await openPanel();
    expect(await screen.findByText(/هنوز ترتیبی نچیده‌اید/)).toBeInTheDocument();
    // No up/down affordance on an unplaced row — there is no order to move
    // within yet.
    expect(screen.queryByRole('button', { name: `جابه‌جایی ${NEY} به بالا` })).toBeNull();
    expect(screen.getByRole('button', { name: `افزودن ${NEY} به ترتیب` })).toBeInTheDocument();
  });

  it('appends to the END of the arranged block, keeping what was already placed', async () => {
    reply([
      { factory: ZOB, order: 1, skuCount: 9 },
      { factory: NEY, order: null, skuCount: 10 },
    ]);
    const user = await openPanel();
    await user.click(await screen.findByRole('button', { name: `افزودن ${NEY} به ترتیب` }));
    // ZOB must survive the call — this is the whole replace-not-merge hazard.
    await waitFor(() => expect(setFactoryOrder).toHaveBeenCalledWith('c1', [ZOB, NEY]));
  });

  it('swaps with the neighbour on a move, sending the complete new list', async () => {
    reply([
      { factory: ZOB, order: 1, skuCount: 9 },
      { factory: NEY, order: 2, skuCount: 10 },
      { factory: KAVIR, order: 3, skuCount: 12 },
    ]);
    const user = await openPanel();
    await user.click(await screen.findByRole('button', { name: `جابه‌جایی ${KAVIR} به بالا` }));
    await waitFor(() => expect(setFactoryOrder).toHaveBeenCalledWith('c1', [ZOB, KAVIR, NEY]));
  });

  it('disables the moves that would fall off either end', async () => {
    reply([
      { factory: ZOB, order: 1, skuCount: 9 },
      { factory: NEY, order: 2, skuCount: 10 },
    ]);
    await openPanel();
    expect(await screen.findByRole('button', { name: `جابه‌جایی ${ZOB} به بالا` })).toBeDisabled();
    expect(screen.getByRole('button', { name: `جابه‌جایی ${NEY} به پایین` })).toBeDisabled();
    expect(screen.getByRole('button', { name: `جابه‌جایی ${ZOB} به پایین` })).toBeEnabled();
  });

  it('removes one mill without un-ordering the rest', async () => {
    reply([
      { factory: ZOB, order: 1, skuCount: 9 },
      { factory: NEY, order: 2, skuCount: 10 },
      { factory: KAVIR, order: 3, skuCount: 12 },
    ]);
    const user = await openPanel();
    await user.click(await screen.findByRole('button', { name: `برداشتن ${NEY} از ترتیب` }));
    await waitFor(() => expect(setFactoryOrder).toHaveBeenCalledWith('c1', [ZOB, KAVIR]));
  });

  it('names a leftover row rather than hiding it', async () => {
    // Ordered once, every product since renamed or retired. Hidden, it would
    // steer a sort the admin could never find; shown, one click clears it.
    reply([{ factory: 'کارخانهٔ قدیمی', order: 1, skuCount: 0 }]);
    await openPanel();
    const row = (await screen.findByText('کارخانهٔ قدیمی')).closest('div')!;
    expect(within(row).getByText('بدون کالای فعال')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'برداشتن کارخانهٔ قدیمی از ترتیب' })).toBeInTheDocument();
  });

  it('says so plainly when the category has no factories at all', async () => {
    reply([]);
    await openPanel();
    expect(await screen.findByText(/کارخانه‌ای ثبت‌شده ندارد/)).toBeInTheDocument();
  });
});
