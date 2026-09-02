import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import type { PriceRow } from '@/lib/types/domain';
import { PriceTable } from './PriceTable';

// Nothing under test navigates; the toolbar only reads the search params to
// pre-select a sub-category on a deep link.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/prices/rebar',
  useSearchParams: () => new URLSearchParams(),
}));

function row(id: string, size: string, grade: string, factory: string): PriceRow {
  return {
    id,
    subCategoryId: 'mylgrd-sadh',
    categoryId: 'rebar',
    slug: id,
    name: id,
    size,
    grade,
    factory,
    unit: 'kg',
    current: {
      skuId: id,
      price: 500_000,
      unit: 'kg',
      deliveryTime: '۲۴ ساعت',
      vatIncluded: false,
      movementDir: 'flat',
      updatedAt: new Date('2026-08-13T09:00:00Z').toISOString(),
      isStale: false,
    },
  } as PriceRow;
}

/** «سایز ۱۴/استاندارد A2», «سایز ۱۴/استاندارد A3», «سایز ۱۶/استاندارد A2»,
 *  «سایز ۱۶/استاندارد A3» — two independent facet columns, so an AND across
 *  them (size AND grade) narrows further than either alone. */
const ROWS: PriceRow[] = [
  row('r-14-a2', '14', 'A2', 'F1'),
  row('r-14-a3', '14', 'A3', 'F1'),
  row('r-16-a2', '16', 'A2', 'F2'),
  row('r-16-a3', '16', 'A3', 'F2'),
];

function renderTable() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PriceTable rows={ROWS} subs={[]} categoryName="میلگرد" categorySlug="rebar" />
    </QueryClientProvider>,
  );
}

// Values live inside a closed-by-default popover now (the whole point of the
// dropdown redesign — see SpecFilterDropdown), so every test that wants to
// check/click one must open its facet's trigger first.
async function openFacet(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole('button', { name: new RegExp(`^${label}`) }));
}

describe('PriceTable — spec filter bar (owner request 1405/06/02)', () => {
  it('renders a compact trigger per filterable column; values stay hidden until opened', () => {
    renderTable();
    const bar = screen.getByRole('group', { name: 'فیلتر مشخصات' });
    expect(within(bar).getByRole('button', { name: /^سایز/ })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: /^استاندارد/ })).toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: '۱۴' })).not.toBeInTheDocument();
  });

  it('opening a trigger reveals every distinct value for that column', async () => {
    const user = userEvent.setup();
    renderTable();
    await openFacet(user, 'سایز');

    const popover = screen.getByRole('group', { name: 'سایز' });
    expect(within(popover).getByRole('button', { name: '۱۴' })).toBeInTheDocument();
    expect(within(popover).getByRole('button', { name: '۱۶' })).toBeInTheDocument();
  });

  it('narrows to exactly the rows matching one selected value (single column)', async () => {
    const user = userEvent.setup();
    renderTable();
    await openFacet(user, 'سایز');
    await user.click(screen.getByRole('button', { name: '۱۴' }));

    expect(screen.getByText('r-14-a2')).toBeInTheDocument();
    expect(screen.getByText('r-14-a3')).toBeInTheDocument();
    expect(screen.queryByText('r-16-a2')).not.toBeInTheDocument();
    expect(screen.queryByText('r-16-a3')).not.toBeInTheDocument();
    // The count confirms the filter narrowed something, not just that two
    // rows happen to be on screen.
    expect(screen.getByText(/۲ از ۴ کالا/)).toBeInTheDocument();
    // The trigger itself now advertises the selection count. `expanded: true`
    // disambiguates it from the active-filter chip below, which also starts
    // with «سایز» but (unlike the trigger) carries no aria-expanded.
    expect(screen.getByRole('button', { name: /^سایز/, expanded: true })).toHaveTextContent('1');
  });

  it('ANDs two different columns: size ۱۴ AND grade A2 leaves exactly one row', async () => {
    const user = userEvent.setup();
    renderTable();
    await openFacet(user, 'سایز');
    await user.click(screen.getByRole('button', { name: '۱۴' }));
    await openFacet(user, 'استاندارد');
    await user.click(screen.getByRole('button', { name: 'A۲' }));

    expect(screen.getByText('r-14-a2')).toBeInTheDocument();
    expect(screen.queryByText('r-14-a3')).not.toBeInTheDocument();
    expect(screen.queryByText('r-16-a2')).not.toBeInTheDocument();
    expect(screen.queryByText('r-16-a3')).not.toBeInTheDocument();
  });

  it('ORs two values checked within the SAME column', async () => {
    const user = userEvent.setup();
    renderTable();
    await openFacet(user, 'استاندارد');
    await user.click(screen.getByRole('button', { name: 'A۲' }));
    await user.click(screen.getByRole('button', { name: 'A۳' }));

    // Both grades checked → every row matches this column again.
    for (const name of ['r-14-a2', 'r-14-a3', 'r-16-a2', 'r-16-a3']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it('shows the active selections as removable chips below the trigger row', async () => {
    const user = userEvent.setup();
    renderTable();
    await openFacet(user, 'سایز');
    await user.click(screen.getByRole('button', { name: '۱۴' }));

    const active = screen.getByRole('group', { name: 'فیلترهای فعال' });
    const removeChip = within(active).getByRole('button', { name: /سایز.*۱۴/ });
    expect(removeChip).toBeInTheDocument();

    // Removing via the active chip clears it the same way unchecking would.
    await user.click(removeChip);
    expect(screen.queryByRole('group', { name: 'فیلترهای فعال' })).not.toBeInTheDocument();
    expect(screen.getByText('r-16-a2')).toBeInTheDocument();
  });

  it('shows the empty state and a working clear-filters action when a combination matches nothing', async () => {
    const user = userEvent.setup();
    renderTable();
    // Fixture pairs size ۱۴ with factory F1 only (never F2) — so size ۱۶ AND
    // factory F1 is a real, reachable AND-across-columns dead end.
    await openFacet(user, 'سایز');
    await user.click(screen.getByRole('button', { name: '۱۶' }));
    await openFacet(user, 'کارخانه');
    await user.click(screen.getByRole('button', { name: 'F۱' }));

    expect(screen.getByText(/کالایی پیدا نشد/)).toBeInTheDocument();
    for (const name of ['r-14-a2', 'r-14-a3', 'r-16-a2', 'r-16-a3']) {
      expect(screen.queryByText(name)).not.toBeInTheDocument();
    }

    // The empty state's own clear button restores every row.
    await user.click(within(screen.getByRole('status')).getByRole('button', { name: 'پاک کردن فیلترها' }));
    for (const name of ['r-14-a2', 'r-14-a3', 'r-16-a2', 'r-16-a3']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it('clearing filters restores every row', async () => {
    const user = userEvent.setup();
    renderTable();
    await openFacet(user, 'سایز');
    await user.click(screen.getByRole('button', { name: '۱۴' }));
    expect(screen.queryByText('r-16-a2')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /پاک کردن فیلترها/ }));

    for (const name of ['r-14-a2', 'r-14-a3', 'r-16-a2', 'r-16-a3']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });
});
