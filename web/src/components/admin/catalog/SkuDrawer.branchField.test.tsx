/**
 * The admin side of the نبشی و ناودانی «شاخه» swap (owner, 1405/06):
 * «مطمئن شو در پنل ادمین هم این تغییرات اعمال شده».
 *
 * The form has to swap WITH the price table, not merely beside it. Two ways
 * this goes wrong and neither shows up on the public page:
 *
 *  1. the «گرید» box stays, so an operator keeps filling a field that these
 *     sub-categories no longer publish anywhere; and
 *  2. both the new «شاخه» box and the old «طول شاخه (متر)» box are rendered,
 *     two inputs writing one column, free to disagree.
 *
 * So this asserts the swap in both directions and on both boxes.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdminCategory, AdminSubCategory } from '@/lib/api/resources/admin';
import { SkuDrawer } from './SkuDrawer';

vi.mock('@/lib/api/resources/admin', () => ({
  adminApi: {
    catalogSuggestions: () =>
      Promise.resolve({
        factories: [],
        sizes: [],
        grades: [],
        dimensions: [],
        schedules: [],
        standards: [],
        groupLabels: [],
      }),
    createSku: vi.fn(),
    updateSku: vi.fn(),
  },
}));

const CATEGORIES = [
  { id: 'c5', slug: 'angle-channel', name: 'نبشی و ناودانی' },
  { id: 'c1', slug: 'rebar', name: 'میلگرد' },
] as AdminCategory[];

/** The live نبشی و ناودانی taxonomy, plus one میلگرد sub as a control. */
const SUBS = [
  { id: 's-nabshi', categoryId: 'c5', slug: 'nabshi', name: 'نبشی' },
  { id: 's-channel', categoryId: 'c5', slug: 'channel-light', name: 'ناودانی سبک' },
  { id: 's-separi', categoryId: 'c5', slug: 'separi', name: 'سپری' },
  { id: 's-valpost', categoryId: 'c5', slug: 'val-post', name: 'وال پست' },
  { id: 's-deformed', categoryId: 'c1', slug: 'deformed', name: 'آجدار A3' },
] as AdminSubCategory[];

function openDrawer(defaultSubId: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SkuDrawer
        sku={null}
        categories={CATEGORIES}
        subs={SUBS}
        defaultSubId={defaultSubId}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe('SkuDrawer — نبشی و ناودانی collects «شاخه» in place of «گرید»', () => {
  it('shows «شاخه» and hides «گرید» on نبشی', () => {
    openDrawer('s-nabshi');
    expect(screen.getByLabelText('شاخه')).toBeInTheDocument();
    expect(screen.queryByLabelText('گرید')).toBeNull();
  });

  it('renders exactly ONE input for the branch-length column', () => {
    // The old «طول شاخه (متر)» box edits the same `branchLengthM`; leaving
    // both on screen is how the two silently disagree.
    openDrawer('s-nabshi');
    expect(screen.queryByLabelText('طول شاخه (متر)')).toBeNull();
    expect(screen.getAllByLabelText(/شاخه/)).toHaveLength(1);
  });

  it('offers ۶ and ۱۲ as pickable options, stored as plain numbers', async () => {
    // PickerInput keeps the REAL stored string as the option value and shows
    // the Persian-digit rendering, so the number reaching `branchLengthM`
    // stays parseable by the weight prefill.
    openDrawer('s-nabshi');
    const input = screen.getByLabelText('شاخه') as HTMLInputElement;
    const list = document.getElementById(input.getAttribute('list')!)!;
    expect([...list.querySelectorAll('option')].map((o) => o.getAttribute('value'))).toEqual([
      '6',
      '12',
    ]);
    expect([...list.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['۶', '۱۲']);
  });

  it('accepts a typed length', async () => {
    const user = userEvent.setup();
    openDrawer('s-nabshi');
    const input = screen.getByLabelText('شاخه') as HTMLInputElement;
    await user.type(input, '12');
    expect(input.value).toBe('12');
  });

  it('does the same on ناودانی سبک and سپری', () => {
    for (const sub of ['s-channel', 's-separi']) {
      const { unmount } = openDrawer(sub);
      expect(screen.getByLabelText('شاخه')).toBeInTheDocument();
      expect(screen.queryByLabelText('گرید')).toBeNull();
      unmount();
    }
  });

  it('keeps «گرید» — and the original length box — on وال پست', () => {
    // The one sub whose grade holds real data («ضخامت ۲» on all 8 live rows).
    openDrawer('s-valpost');
    expect(screen.getByLabelText('گرید')).toBeInTheDocument();
    expect(screen.queryByLabelText('شاخه')).toBeNull();
    expect(screen.getByLabelText('طول شاخه (متر)')).toBeInTheDocument();
  });

  it('changes nothing for another category', () => {
    openDrawer('s-deformed');
    expect(screen.getByLabelText('گرید')).toBeInTheDocument();
    expect(screen.queryByLabelText('شاخه')).toBeNull();
    expect(screen.getByLabelText('طول شاخه (متر)')).toBeInTheDocument();
  });

  it('swaps live when the operator re-files the product into وال پست', async () => {
    // The sub picker is in the same form, so the boxes must follow the
    // selection rather than the sub the drawer happened to open on.
    const user = userEvent.setup();
    openDrawer('s-nabshi');
    expect(screen.getByLabelText('شاخه')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('زیر‌دسته'), 's-valpost');
    expect(screen.getByLabelText('گرید')).toBeInTheDocument();
    expect(screen.queryByLabelText('شاخه')).toBeNull();
  });
});
