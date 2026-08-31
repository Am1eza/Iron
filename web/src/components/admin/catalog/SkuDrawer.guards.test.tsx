/**
 * Three ways this drawer used to lose work that nothing on screen reported.
 *
 * 1. The browser's Back button. `beforeunload` is the only guard the form had,
 *    and a Next client navigation never fires it — so Back on a half-edited
 *    product was a silent discard.
 * 2. `crossListedCategoryIds`. The form knows one checkbox («استیل») and sent
 *    the whole column, so saving a SIZE correction deleted every other
 *    cross-listing a script had set and the product disappeared out of lists
 *    it belonged to.
 * 3. Retyping. 186 rows under rebar/deformed differ only in size and mill, and
 *    there was no way to start from one of them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdminCategory, AdminSku, AdminSubCategory } from '@/lib/api/resources/admin';
import { SkuDrawer } from './SkuDrawer';

const updateSku = vi.fn();
const createSku = vi.fn();

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
    createSku: (input: unknown) => createSku(input),
    updateSku: (id: string, patch: unknown) => updateSku(id, patch),
  },
}));

const CATEGORIES = [
  { id: 'c1', slug: 'rebar', name: 'میلگرد' },
  { id: 'c9', slug: 'steel', name: 'استیل' },
  { id: 'c4', slug: 'sheet', name: 'ورق' },
] as AdminCategory[];

const SUBS = [
  { id: 's1', categoryId: 'c1', slug: 'deformed', name: 'آجدار' },
] as AdminSubCategory[];

function sku(over: Partial<AdminSku> = {}): AdminSku {
  return {
    id: 'k1',
    subCategoryId: 's1',
    categoryId: 'c1',
    slug: 'rebar-14-a3-zobahan',
    name: 'میلگرد آجدار ۱۴ ذوب آهن',
    standard: null,
    size: '۱۴',
    grade: 'A3',
    condition: null,
    dimensions: null,
    schedule: null,
    factory: 'ذوب آهن',
    order: 0,
    theoreticalWeightKg: 1.21,
    unit: 'kg',
    priceBasis: 'kg',
    branchLengthM: 12,
    imageUrl: null,
    crossListedCategoryIds: null,
    ...over,
  };
}

function openDrawer(props: Partial<React.ComponentProps<typeof SkuDrawer>> = {}) {
  const onClose = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Rebuilt per render, so `onClose` and `onSaved` arrive with a fresh
  // identity every time — exactly as CatalogManager passes them (inline
  // arrows, re-created on each of its own renders).
  const tree = () => (
    <QueryClientProvider client={qc}>
      <SkuDrawer
        sku={null}
        categories={CATEGORIES}
        subs={SUBS}
        defaultSubId="s1"
        onClose={() => onClose()}
        onSaved={() => {}}
        {...props}
      />
    </QueryClientProvider>
  );
  const { rerender } = render(tree());
  return {
    user: userEvent.setup(),
    onClose,
    /** What one of the parent's re-renders looks like from in here. */
    rerenderParent: () => rerender(tree()),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  updateSku.mockResolvedValue({ sku: sku() });
  createSku.mockResolvedValue({ sku: sku() });
});

describe('the Back button', () => {
  it('asks before discarding an edit instead of vanishing', async () => {
    const { user, onClose } = openDrawer({ sku: sku() });
    await user.type(screen.getByLabelText(/^سایز/), '۶');

    window.history.back();
    // jsdom dispatches popstate asynchronously.
    await waitFor(() => expect(screen.queryByText(/تغییرات ذخیره‌نشده از بین می‌رود/)).not.toBeNull());
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /بستن و ازدست‌دادن تغییرات/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('closes without a question when there is nothing to lose', async () => {
    const { onClose } = openDrawer({ sku: sku() });
    window.history.back();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByText(/تغییرات ذخیره‌نشده از بین می‌رود/)).toBeNull();
  });

  it('installs its history sentinel once, not on every parent render', async () => {
    // The sentinel belongs to the drawer's LIFETIME: one push on mount, one
    // pop on unmount, nothing in between.
    //
    // It used to depend on `requestClose`, which closes over the `onClose`
    // the parent passes as an inline arrow — a new identity on each of the
    // parent's renders, i.e. on every keystroke in the list's search box and
    // every refetch. So the effect tore down and re-installed constantly, and
    // the teardown's `history.back()` is asynchronous: it landed after the
    // listener had been re-registered, which fired the guard and asked the
    // admin whether to discard the edit they were still typing.
    //
    // Counting the calls is the assertion because the damage is in the churn
    // itself; jsdom settles a queued traversal too politely to show the
    // dialog that a browser would.
    const push = vi.spyOn(window.history, 'pushState');
    const back = vi.spyOn(window.history, 'back');
    const { user, onClose, rerenderParent } = openDrawer({ sku: sku() });
    expect(push).toHaveBeenCalledTimes(1);

    await user.type(screen.getByLabelText(/^سایز/), '۶');
    for (let i = 0; i < 3; i++) rerenderParent();
    await new Promise((r) => setTimeout(r, 50));

    expect(push).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText(/تغییرات ذخیره‌نشده از بین می‌رود/)).toBeNull();

    // Still armed afterwards — the point is one live sentinel, not none.
    push.mockRestore();
    back.mockRestore();
    window.history.back();
    await waitFor(() =>
      expect(screen.queryByText(/تغییرات ذخیره‌نشده از بین می‌رود/)).not.toBeNull(),
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('cross-listings the form cannot see', () => {
  it('keeps the ids it has no control for when saving', async () => {
    // Listed under ورق as well as its own category — set by a script, with no
    // checkbox anywhere in this form.
    const { user } = openDrawer({ sku: sku({ crossListedCategoryIds: ['c4'] }) });
    await user.type(screen.getByLabelText(/^سایز/), '۶');
    await user.click(screen.getByRole('button', { name: 'ذخیره' }));

    await waitFor(() => expect(updateSku).toHaveBeenCalled());
    expect(updateSku.mock.calls[0]![1]).toMatchObject({ crossListedCategoryIds: ['c4'] });
  });

  it('adds «استیل» alongside them rather than replacing them', async () => {
    const { user } = openDrawer({ sku: sku({ crossListedCategoryIds: ['c4'] }) });
    await user.click(screen.getByRole('button', { name: /تنظیمات پیشرفته/ }));
    await user.click(screen.getByRole('checkbox', { name: /از جنس استیل است/ }));
    await user.click(screen.getByRole('button', { name: 'ذخیره' }));

    await waitFor(() => expect(updateSku).toHaveBeenCalled());
    expect(updateSku.mock.calls[0]![1]).toMatchObject({ crossListedCategoryIds: ['c4', 'c9'] });
  });

  it('still clears the column when the product really has no cross-listing', async () => {
    const { user } = openDrawer({ sku: sku({ crossListedCategoryIds: ['c9'] }) });
    await user.click(screen.getByRole('button', { name: /تنظیمات پیشرفته/ }));
    await user.click(screen.getByRole('checkbox', { name: /از جنس استیل است/ }));
    await user.click(screen.getByRole('button', { name: 'ذخیره' }));

    await waitFor(() => expect(updateSku).toHaveBeenCalled());
    expect(updateSku.mock.calls[0]![1]).toMatchObject({ crossListedCategoryIds: null });
  });
});

describe('«تکثیر»', () => {
  it('opens a CREATE seeded from the row, and says so', async () => {
    const { user } = openDrawer({ sku: null, cloneFrom: sku() });

    expect(screen.getByText(/کپی از «میلگرد آجدار ۱۴ ذوب آهن»/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^سایز/)).toHaveValue('۱۴');

    await user.click(screen.getByRole('button', { name: 'ذخیره' }));
    await waitFor(() => expect(createSku).toHaveBeenCalled());
    // A create, never a write onto the row it was copied from.
    expect(updateSku).not.toHaveBeenCalled();
    expect(createSku.mock.calls[0]![0]).toMatchObject({
      subCategoryId: 's1',
      unit: 'kg',
      priceBasis: 'kg',
      branchLengthM: 12,
    });
  });

  it('re-derives the name and URL as soon as a field is changed', async () => {
    const { user } = openDrawer({ sku: null, cloneFrom: sku() });
    const size = screen.getByLabelText(/^سایز/);
    await user.clear(size);
    await user.type(size, '۱۶');

    // Copying a row and changing its size must not leave «…۱۴» in the name
    // or in the URL — that is the duplicate-with-a-wrong-label failure.
    await waitFor(() =>
      expect(screen.getByLabelText(/نام کالا/)).not.toHaveValue('میلگرد آجدار ۱۴ ذوب آهن'),
    );
  });
});
