/**
 * The admin side of the نبشی و ناودانی swap (owner, 1405/06; relabelled
 * «شاخه» → «حالت» 1405/06/08 to match ahanonline.com — see catalogLabels'
 * ANGLE_CHANNEL_BRANCH_SUBS): «مطمئن شو در پنل ادمین هم این تغییرات اعمال
 * شده».
 *
 * The form has to swap WITH the price table, not merely beside it. Two ways
 * this goes wrong and neither shows up on the public page:
 *
 *  1. the «گرید» box stays, so an operator keeps filling a field that these
 *     sub-categories no longer publish anywhere; and
 *  2. both the new «حالت» box and the old «طول شاخه (متر)» box are rendered,
 *     two inputs writing one column, free to disagree.
 *
 * So this asserts the swap in both directions and on both boxes. The label
 * is shared with پروفیل صنعتی/مبلی's own «حالت» field below (`profileCondition`,
 * a separate AttrKey with the identical label — see SkuDrawer.tsx's
 * `branchAttrLabel`), so the admin form now says the same word the public
 * table does for both categories, not the old admin-only «شاخه» term.
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
  { id: 'c3', slug: 'profile', name: 'پروفیل' },
] as AdminCategory[];

/** The live نبشی و ناودانی taxonomy, plus one میلگرد sub as a control. */
const SUBS = [
  { id: 's-nabshi', categoryId: 'c5', slug: 'nabshi', name: 'نبشی' },
  { id: 's-channel', categoryId: 'c5', slug: 'channel-light', name: 'ناودانی سبک' },
  { id: 's-separi', categoryId: 'c5', slug: 'separi', name: 'سپری' },
  { id: 's-valpost', categoryId: 'c5', slug: 'val-post', name: 'وال پست' },
  { id: 's-deformed', categoryId: 'c1', slug: 'deformed', name: 'آجدار A3' },
  { id: 's-industrial', categoryId: 'c3', slug: 'prvfyl-snaty', name: 'پروفیل صنعتی' },
  { id: 's-furniture', categoryId: 'c3', slug: 'profil-mobli', name: 'پروفیل مبلی' },
  {
    id: 's-galvanized',
    categoryId: 'c3',
    slug: 'profil-galvanizeh',
    name: 'پروفیل گالوانیزه',
  },
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

describe('SkuDrawer — نبشی و ناودانی collects «حالت» in place of «گرید»', () => {
  it('shows «حالت» and hides «گرید» on نبشی', () => {
    openDrawer('s-nabshi');
    expect(screen.getByLabelText('حالت')).toBeInTheDocument();
    expect(screen.queryByLabelText('گرید')).toBeNull();
  });

  it('renders exactly ONE input for the branch-length column', () => {
    // The old «طول شاخه (متر)» box edits the same `branchLengthM`; leaving
    // both on screen is how the two silently disagree.
    openDrawer('s-nabshi');
    expect(screen.queryByLabelText('طول شاخه (متر)')).toBeNull();
    expect(screen.getAllByLabelText('حالت')).toHaveLength(1);
  });

  it('offers ۶ and ۱۲ as pickable options, stored as plain numbers', async () => {
    // PickerInput keeps the REAL stored string as the option value and shows
    // the Persian-digit rendering, so the number reaching `branchLengthM`
    // stays parseable by the weight prefill.
    openDrawer('s-nabshi');
    const input = screen.getByLabelText('حالت') as HTMLInputElement;
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
    const input = screen.getByLabelText('حالت') as HTMLInputElement;
    await user.type(input, '12');
    expect(input.value).toBe('12');
  });

  it('does the same on ناودانی سبک', () => {
    openDrawer('s-channel');
    expect(screen.getByLabelText('حالت')).toBeInTheDocument();
    expect(screen.queryByLabelText('گرید')).toBeNull();
  });

  it('gives سپری the generic «طول شاخه (متر)» box instead — same column, own ahanonline label', () => {
    // سپری's public column is «طول شاخه» (its own `branchLength` key, ahanonline's
    // own label for this sub — see catalogLabels' ANGLE_CHANNEL_BRANCH_LENGTH_SUBS),
    // not «حالت» like نبشی/ناودانی/پروفیل صنعتی — so it does not qualify for
    // the shared «حالت» quick-picker (`branchAttrKey` checks `branch` and
    // `profileCondition` only) and instead gets the same generic box every
    // other branchLength-using sub (e.g. لوله) already uses.
    openDrawer('s-separi');
    expect(screen.queryByLabelText('حالت')).toBeNull();
    expect(screen.queryByLabelText('گرید')).toBeNull();
    expect(screen.getByLabelText('طول شاخه (متر)')).toBeInTheDocument();
  });

  it('relabels وال پست’s «گرید» box «ضخامت» — same column, same real data', () => {
    // The one sub whose grade holds real data («ضخامت ۲» on all 8 live
    // rows). 1405/06/08: relabelled to match ahanonline's own «ضخامت»
    // column for وال‌پست — still the same `grade` field/input, not a swap.
    openDrawer('s-valpost');
    expect(screen.getByLabelText('ضخامت')).toBeInTheDocument();
    expect(screen.queryByLabelText('گرید')).toBeNull();
    expect(screen.queryByLabelText('شاخه')).toBeNull();
    expect(screen.getByLabelText('طول شاخه (متر)')).toBeInTheDocument();
  });

  it('changes nothing for another category', () => {
    // میلگرد آجدار's own box was relabelled «استاندارد» 1405/06/09 to match
    // the public column (still `skus.grade` — see catalogLabels'
    // `gradeAsStandard`), so this asserts the نبشی «حالت» swap did not reach
    // it rather than that the word «گرید» survived.
    openDrawer('s-deformed');
    expect(screen.getByLabelText('استاندارد')).toBeInTheDocument();
    expect(screen.queryByLabelText('حالت')).toBeNull();
    expect(screen.queryByLabelText('شاخه')).toBeNull();
    expect(screen.getByLabelText('طول شاخه (متر)')).toBeInTheDocument();
  });

  it('swaps live when the operator re-files the product into وال پست', async () => {
    // The sub picker is in the same form, so the boxes must follow the
    // selection rather than the sub the drawer happened to open on.
    const user = userEvent.setup();
    openDrawer('s-nabshi');
    expect(screen.getByLabelText('حالت')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('زیر‌دسته'), 's-valpost');
    expect(screen.getByLabelText('ضخامت')).toBeInTheDocument();
    expect(screen.queryByLabelText('حالت')).toBeNull();
    expect(screen.queryByLabelText('گرید')).toBeNull();
  });
});

describe('SkuDrawer — profile fields match the public source columns', () => {
  it('collects thickness and «حالت» on industrial and furniture profile', () => {
    for (const sub of ['s-industrial', 's-furniture']) {
      const { unmount } = openDrawer(sub);
      expect(screen.getByLabelText('ضخامت')).toBeInTheDocument();
      expect(screen.getByLabelText('حالت')).toBeInTheDocument();
      expect(screen.queryByLabelText('گرید')).toBeNull();
      expect(screen.queryByLabelText('طول شاخه (متر)')).toBeNull();
      unmount();
    }
  });

  it('collects thickness and «طول» on galvanized profile', () => {
    openDrawer('s-galvanized');
    expect(screen.getByLabelText('ضخامت')).toBeInTheDocument();
    expect(screen.getByLabelText('طول')).toBeInTheDocument();
    expect(screen.queryByLabelText('گرید')).toBeNull();
    expect(screen.queryByLabelText('طول شاخه (متر)')).toBeNull();
  });
});
