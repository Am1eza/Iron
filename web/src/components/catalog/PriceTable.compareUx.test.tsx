import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PriceRow } from '@/lib/types/domain';
import type { SubCat } from '@/lib/data/nav';
import { PriceTable } from './PriceTable';
import { useCartStore } from '@/lib/stores/cart';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/prices/rebar',
  useSearchParams: () => new URLSearchParams(),
}));

// priceBasis defaults to 'kg' — that's what real rebar rows are (see
// PriceTable.tsx's addToCart), and a fixture that leaves it undefined is
// exactly the gap that let the compare CTA's kg-basis bug ship unnoticed
// (audit finding, 2026-08-26): the "adds it to the cart" test below asserted
// a direct add that real rebar data can never actually take.
function row(id: string, factory: string, price: number, weightKg: number, priceBasis: PriceRow['priceBasis'] = 'kg'): PriceRow {
  return {
    id,
    subCategoryId: 'ribbed',
    categoryId: 'rebar',
    slug: id,
    name: id,
    size: '۱۴',
    factory,
    theoreticalWeightKg: weightKg,
    unit: 'kg',
    priceBasis,
    isActive: true,
    current: {
      skuId: id,
      price,
      unit: 'kg',
      deliveryTime: '۲۴ ساعت',
      vatIncluded: false,
      movementDir: 'flat',
      updatedAt: new Date('2026-08-13T09:00:00Z').toISOString(),
      isStale: false,
    },
  } as PriceRow;
}

const SUBS: SubCat[] = [{ slug: 'ribbed', name: 'آجدار', groupLabel: null }];

// Deliberately different price AND weight, same factory — so the price row
// (and weight row) must highlight as differing while the factory row must not.
const CHEAP = row('cheap-14', 'فولاد مبنا', 500_000, 10);
const PRICEY = row('pricey-14', 'فولاد مبنا', 600_000, 12);

function renderTable(rows: PriceRow[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PriceTable rows={rows} subs={SUBS} categoryName="میلگرد" categorySlug="rebar" />
    </QueryClientProvider>,
  );
}

async function checkCompare(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('checkbox', { name: `افزودن ${name} به مقایسه` }));
}

describe('PriceTable — compare selection feedback (US-P0.2)', () => {
  it('explains why the compare button is still disabled with exactly one item picked', async () => {
    const user = userEvent.setup();
    renderTable([CHEAP, PRICEY]);
    expect(screen.queryByRole('status', { name: /مقایسه/ })).toBeNull();

    await checkCompare(user, 'cheap-14');
    expect(screen.getByText('حداقل دو محصول برای مقایسه انتخاب کنید — یک مورد دیگر را هم علامت بزنید.')).toBeInTheDocument();

    await checkCompare(user, 'pricey-14');
    expect(
      screen.queryByText('حداقل دو محصول برای مقایسه انتخاب کنید — یک مورد دیگر را هم علامت بزنید.'),
    ).toBeNull();
  });
});

describe('PriceTable — compare modal diff highlighting + next action (US-P0.3)', () => {
  it('highlights rows that actually differ and leaves matching rows alone', async () => {
    const user = userEvent.setup();
    renderTable([CHEAP, PRICEY]);
    await checkCompare(user, 'cheap-14');
    await checkCompare(user, 'pricey-14');
    await user.click(screen.getByRole('button', { name: /مقایسه \(۲\)/ }));
    const dialog = within(screen.getByRole('dialog', { name: 'مقایسهٔ کالاها' }));

    const priceRow = dialog.getByRole('row', { name: /قیمت \(تومان\)/ });
    expect(priceRow.className).toMatch(/rowDiffers/);

    const weightRow = dialog.getByRole('row', { name: /وزن شاخه/ });
    expect(weightRow.className).toMatch(/rowDiffers/);

    // Both rows share the same mill — the factory row must NOT be flagged.
    const factoryRow = dialog.getByRole('row', { name: /^کارخانه/ });
    expect(factoryRow.className).not.toMatch(/rowDiffers/);
  });

  it('offers the cheaper option as the modal\'s next action — kg-basis (rebar) hands off to the quantity picker, not a silent direct add', async () => {
    // Regression test for the audit finding: CHEAP/PRICEY are kg-basis (real
    // rebar data always is), so a single click can never mean "added" — it
    // has to ask how much first. The label must say so up front, and the
    // handoff must actually reach the cart once a quantity is confirmed.
    useCartStore.setState({ items: [] });
    const user = userEvent.setup();
    renderTable([CHEAP, PRICEY]);
    await checkCompare(user, 'cheap-14');
    await checkCompare(user, 'pricey-14');
    await user.click(screen.getByRole('button', { name: /مقایسه \(۲\)/ }));

    const cta = screen.getByRole('button', { name: /انتخاب مقدار برای گزینهٔ ارزان‌تر \(cheap-14\)/ });
    await user.click(cta);

    // Compare modal closed; the quantity picker opened in its place, titled
    // with the SAME product the CTA named — not an unrelated-looking dialog.
    expect(screen.queryByRole('dialog', { name: 'مقایسهٔ کالاها' })).toBeNull();
    const qtyDialog = within(screen.getByRole('dialog', { name: 'تعداد «cheap-14»' }));
    await user.click(qtyDialog.getByRole('button', { name: 'افزودن به سبد استعلام' }));

    expect(useCartStore.getState().items.map((i) => i.skuId)).toContain('cheap-14');
  });

  it('offers the cheaper option as the modal\'s next action — non-kg basis adds directly to the cart', async () => {
    useCartStore.setState({ items: [] });
    const user = userEvent.setup();
    const cheapSheet = row('cheap-sheet', 'فولاد مبنا', 500_000, 10, 'sheet');
    const priceySheet = row('pricey-sheet', 'فولاد مبنا', 600_000, 12, 'sheet');
    renderTable([cheapSheet, priceySheet]);
    await checkCompare(user, 'cheap-sheet');
    await checkCompare(user, 'pricey-sheet');
    await user.click(screen.getByRole('button', { name: /مقایسه \(۲\)/ }));

    const cta = screen.getByRole('button', { name: /افزودن گزینهٔ ارزان‌تر \(cheap-sheet\) به سبد/ });
    await user.click(cta);

    expect(useCartStore.getState().items.map((i) => i.skuId)).toContain('cheap-sheet');
    // The CTA also closes the modal, same as clicking a product link does.
    expect(screen.queryByRole('dialog', { name: 'مقایسهٔ کالاها' })).toBeNull();
  });

  it('does not offer a "cheaper" action when the selected prices tie', async () => {
    const user = userEvent.setup();
    const tie = row('tie-14', 'فولاد مبنا', 500_000, 10);
    renderTable([CHEAP, tie]);
    await checkCompare(user, 'cheap-14');
    await checkCompare(user, 'tie-14');
    await user.click(screen.getByRole('button', { name: /مقایسه \(۲\)/ }));

    expect(screen.queryByRole('button', { name: /افزودن گزینهٔ ارزان‌تر/ })).toBeNull();
  });
});

describe('PriceTable — compare checkbox touch target (US-P0.7)', () => {
  it('wraps the checkbox in a tap-target label', () => {
    renderTable([CHEAP, PRICEY]);
    const checkbox = screen.getByRole('checkbox', { name: 'افزودن cheap-14 به مقایسه' });
    expect(checkbox.closest('label')?.className).toMatch(/compareCheckboxHit/);
  });
});
