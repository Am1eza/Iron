/**
 * The catalog screen's job is to tell the truth about what it publishes and to
 * make destroying something harder than saving it. Everything asserted here is
 * a case where it previously did the opposite:
 *
 * - a green «روی سایت» on a product whose page says «تماس بگیرید»;
 * - fifty search results with nothing saying which sub-category each came from;
 * - no way at all to look at the published page;
 * - a permanent, cascading delete behind the same button styling as «ذخیره»;
 * - a failed sub-category request drawn as «this branch is empty — build the
 *   first one», i.e. an invitation to duplicate rows that already exist;
 * - a taxonomy form that threw typed work away on a stray Escape.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdminCategory, AdminSku, AdminSubCategory } from '@/lib/api/resources/admin';
import { CatalogManager } from './CatalogManager';
import { ApiError } from '@/lib/api/errors';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/catalog',
  useSearchParams: () => new URLSearchParams(),
}));

const categories = vi.fn();
const subCategories = vi.fn();
const skus = vi.fn();
const deleteSku = vi.fn();
const deleteCategory = vi.fn();
const deleteSubCategory = vi.fn();
const bulkDeleteSkus = vi.fn();
const skuImpact = vi.fn();
const createCategory = vi.fn();

vi.mock('@/lib/api/resources/admin', () => ({
  adminApi: {
    categories: () => categories(),
    subCategories: () => subCategories(),
    skus: (params: unknown) => skus(params),
    deleteSku: (id: string) => deleteSku(id),
    deleteCategory: (id: string) => deleteCategory(id),
    deleteSubCategory: (id: string) => deleteSubCategory(id),
    bulkDeleteSkus: (ids: string[], opts?: unknown) => bulkDeleteSkus(ids, opts),
    skuImpact: (id: string) => skuImpact(id),
    createCategory: (input: unknown) => createCategory(input),
    updateCategory: vi.fn(),
    createSubCategory: vi.fn(),
    updateSubCategory: vi.fn(),
    createSku: vi.fn(),
    updateSku: vi.fn(),
    catalogSuggestions: () =>
      Promise.resolve({ factories: [], sizes: [], grades: [], standards: [], conditions: [], groupLabels: [] }),
    factoryOrder: () => Promise.resolve({ categoryId: 'c1', factories: [] }),
    setFactoryOrder: vi.fn(),
    uploadImage: vi.fn(),
  },
}));

const CATEGORY: AdminCategory = {
  id: 'c1',
  slug: 'rebar',
  name: 'میلگرد',
  order: 1,
  iconId: 'cat-rebar',
  imageUrl: null,
  seo: null,
  subCount: 1,
  skuCount: 12,
};

const SUB: AdminSubCategory = {
  id: 's1',
  categoryId: 'c1',
  slug: 'deformed',
  name: 'آجدار',
  groupLabel: null,
  order: 1,
  skuCount: 12,
};

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
    theoreticalWeightKg: null,
    unit: 'kg',
    priceBasis: 'kg',
    branchLengthM: null,
    imageUrl: null,
    crossListedCategoryIds: null,
    ...over,
  };
}

type Row = { sku: AdminSku; price: { price: number; updatedAt: string } | null; subName: string };

function rows(list: Row[], total = list.length) {
  skus.mockImplementation((params: { page?: number; perPage?: number } = {}) =>
    Promise.resolve({
      rows: list,
      total,
      page: params.page ?? 1,
      // The route echoes back what it actually served, after clamping.
      perPage: params.perPage ?? 50,
    }),
  );
}

function renderManager() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <CatalogManager />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // Monday 1405/06/08 — two business days after the Saturday used below.
  vi.setSystemTime(new Date('2026-08-31T10:00:00+03:30'));
  categories.mockResolvedValue({ categories: [CATEGORY] });
  subCategories.mockResolvedValue({ subCategories: [SUB] });
  rows([{ sku: sku(), price: null, subName: 'آجدار' }]);
  skuImpact.mockResolvedValue({
    openLeads: 0,
    openOrders: 0,
    activeAlerts: 0,
    favorites: 0,
    hasPrice: false,
  });
  deleteSku.mockResolvedValue({ ok: true });
  deleteCategory.mockResolvedValue({ ok: true });
  bulkDeleteSkus.mockResolvedValue({ ok: true, removedCount: 1, notFoundIds: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('product list', () => {
  it('names the sub-category each row belongs to', async () => {
    renderManager();
    // The API has always sent it; the client used to drop it, so a
    // cross-category search was fifty rows of unattributed names.
    expect(await screen.findByRole('columnheader', { name: 'زیر‌دسته' })).toBeInTheDocument();
    expect(await screen.findByRole('cell', { name: 'آجدار' })).toBeInTheDocument();
  });

  it('separates a price the site shows from one it is withholding', async () => {
    rows([
      {
        sku: sku({ id: 'today', slug: 'rebar-today', name: 'میلگرد امروز' }),
        price: { price: 285000, updatedAt: '2026-08-31T08:00:00+03:30' },
        subName: 'آجدار',
      },
      {
        sku: sku({ id: 'old', slug: 'rebar-old', name: 'میلگرد قدیمی' }),
        price: { price: 284000, updatedAt: '2026-08-29T08:00:00+03:30' },
        subName: 'آجدار',
      },
    ]);
    renderManager();

    const fresh = (await screen.findByText('میلگرد امروز')).closest('tr')!;
    expect(within(fresh).getByText('روی سایت')).toBeInTheDocument();

    // Two business days old: the public page has stopped printing the number
    // and says «تماس بگیرید». A green badge here is the exact lie the column
    // exists to prevent.
    const stale = screen.getByText('میلگرد قدیمی').closest('tr')!;
    expect(within(stale).getByText('تماس بگیرید')).toBeInTheDocument();
    expect(within(stale).queryByText('روی سایت')).toBeNull();
  });

  it('lets the admin widen the page instead of walking fifteen of them', async () => {
    // 748 products, the live catalog size, at the hard-coded 50 a page.
    rows([{ sku: sku(), price: null, subName: 'آجدار' }], 748);
    const user = renderManager();

    await waitFor(() => expect(skus).toHaveBeenCalled());
    expect(skus.mock.calls[0]![0]).toMatchObject({ page: 1, perPage: 50 });
    expect(await screen.findByText('صفحهٔ ۱ از ۱۵')).toBeInTheDocument();

    // Reachable in one move rather than twelve clicks…
    await user.click(screen.getByRole('button', { name: 'آخرین' }));
    await waitFor(() => expect(screen.getByText('صفحهٔ ۱۵ از ۱۵')).toBeInTheDocument());

    // …and the size the server has always accepted is finally askable for.
    await user.selectOptions(screen.getByLabelText('تعداد ردیف در هر صفحه'), '200');
    await waitFor(() =>
      expect(skus).toHaveBeenCalledWith(expect.objectContaining({ perPage: 200 })),
    );
    // Page 15 of 15 means nothing at the new size, so it goes back to the top.
    const last = skus.mock.calls.at(-1)![0];
    expect(last).toMatchObject({ page: 1, perPage: 200 });
    await waitFor(() => expect(screen.getByText('صفحهٔ ۱ از ۴')).toBeInTheDocument());
  });

  it('offers a link to the published page of every row', async () => {
    renderManager();
    const link = await screen.findByRole('link', {
      name: /مشاهدهٔ میلگرد آجدار ۱۴ ذوب آهن در سایت/,
    });
    expect(link).toHaveAttribute('href', '/prices/rebar/deformed/rebar-14-a3-zobahan');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });
});

describe('the taxonomy rail’s row menu', () => {
  /** jsdom lays nothing out, so the trigger's position is the one thing these
   *  two cases have to state for themselves. */
  const placeTriggerAt = (bottom: number) => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom,
      top: bottom - 36,
      left: 0,
      right: 36,
      width: 36,
      height: 36,
      x: 0,
      y: bottom - 36,
      toJSON: () => ({}),
    });
  };

  it('opens upwards when the rail would otherwise clip it out of reach', async () => {
    // The rail is `overflow-y: auto`: a menu hanging below a row this close to
    // the bottom is clipped, and nothing scrolls to it. «حذف دسته» would be
    // unreachable on the last category.
    placeTriggerAt(window.innerHeight - 20);
    const user = renderManager();
    await user.click(await screen.findByRole('button', { name: 'گزینه‌های میلگرد' }));
    const menu = await screen.findByRole('menu', { name: 'گزینه‌های میلگرد' });
    expect(menu.className).toContain('menuUp');
    expect(within(menu).getByRole('menuitem', { name: /حذف دسته/ })).toBeVisible();
  });

  it('opens downwards when there is room', async () => {
    placeTriggerAt(40);
    const user = renderManager();
    await user.click(await screen.findByRole('button', { name: 'گزینه‌های میلگرد' }));
    const menu = await screen.findByRole('menu', { name: 'گزینه‌های میلگرد' });
    expect(menu.className).not.toContain('menuUp');
  });

  it('closes on Escape and hands focus back to the trigger', async () => {
    const user = renderManager();
    const trigger = await screen.findByRole('button', { name: 'گزینه‌های میلگرد' });
    await user.click(trigger);
    expect(await screen.findByRole('menu', { name: 'گزینه‌های میلگرد' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(trigger).toHaveFocus();
  });
});

describe('deleting', () => {
  it('states that the delete is permanent before it happens', async () => {
    const user = renderManager();
    await user.click(await screen.findByRole('button', { name: 'حذف' }));

    expect(await screen.findByText(/این کار برگشت‌پذیر نیست/)).toBeInTheDocument();
    // A single product is not gated behind retyping — the gate is reserved
    // for a whole branch of the catalog.
    await user.click(screen.getByRole('button', { name: /حذف کن/ }));
    await waitFor(() => expect(deleteSku).toHaveBeenCalledWith('k1'));
  });

  it('makes a category delete unavailable until its name is retyped', async () => {
    const user = renderManager();
    await user.click(await screen.findByRole('button', { name: 'گزینه‌های میلگرد' }));
    await user.click(await screen.findByRole('menuitem', { name: /حذف دسته/ }));

    const confirmButton = await screen.findByRole('button', { name: /حذف کن/ });
    // «میلگرد» takes its sub-categories and every product under them.
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText(/نام دسته را بنویسید/), 'میلگرد');
    await waitFor(() => expect(confirmButton).toBeEnabled());
    await user.click(confirmButton);
    await waitFor(() => expect(deleteCategory).toHaveBeenCalledWith('c1'));
  });

  it('does not delete when the dialog is dismissed', async () => {
    const user = renderManager();
    await user.click(await screen.findByRole('button', { name: 'حذف' }));
    await user.click(await screen.findByRole('button', { name: 'انصراف' }));
    expect(deleteSku).not.toHaveBeenCalled();
  });
});

describe('bulk deleting', () => {
  it('sends one transactional request for the whole selection, not one per row', async () => {
    const user = renderManager();
    await user.click(await screen.findByLabelText('انتخاب میلگرد آجدار ۱۴ ذوب آهن'));
    await user.click(await screen.findByRole('button', { name: 'حذف ۱ کالا' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'حذف ۱ کالا' }));
    await waitFor(() => expect(bulkDeleteSkus).toHaveBeenCalledWith(['k1'], undefined));
    // Not the old per-id loop.
    expect(deleteSku).not.toHaveBeenCalled();
  });

  it('asks before forcing a batch that includes a product on an open order', async () => {
    bulkDeleteSkus.mockImplementationOnce(() => {
      throw new ApiError(409, 'سفارش باز', { code: 'open_orders', details: { blockedIds: ['k1'] } });
    });
    const user = renderManager();
    await user.click(await screen.findByLabelText('انتخاب میلگرد آجدار ۱۴ ذوب آهن'));
    await user.click(await screen.findByRole('button', { name: 'حذف ۱ کالا' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'حذف ۱ کالا' }));

    const overrideDialog = await screen.findByRole('dialog', { name: 'سفارش باز روی برخی کالاها' });
    await user.click(within(overrideDialog).getByRole('button', { name: 'حذف اجباری' }));
    await waitFor(() =>
      expect(bulkDeleteSkus).toHaveBeenLastCalledWith(['k1'], { override: true }),
    );
  });
});

describe('when the sub-category list fails to load', () => {
  beforeEach(() => {
    subCategories.mockRejectedValue(new Error('timeout'));
  });

  it('says so instead of drawing an empty catalog', async () => {
    renderManager();
    expect(await screen.findByText(/زیر‌دسته‌ها بارگذاری نشدند/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'تلاش دوباره' }).length).toBeGreaterThan(0);
  });

  it('never invites the admin to rebuild sub-categories that already exist', async () => {
    const user = renderManager();
    await user.click(await screen.findByRole('button', { name: 'باز کردن میلگرد' }));
    // The failure state must replace the create-the-first-one call to action,
    // not sit next to it.
    expect(screen.queryByRole('button', { name: /اولین زیر‌دسته را بسازید/ })).toBeNull();
    expect(
      await screen.findByText(/این دسته ممکن است زیر‌دسته داشته باشد/),
    ).toBeInTheDocument();
  });

  it('blocks «کالای جدید», whose only mandatory field cannot be filled', async () => {
    renderManager();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'کالای جدید' })).toBeDisabled(),
    );
  });
});

describe('category/sub-category form', () => {
  it('asks before throwing typed work away', async () => {
    const user = renderManager();
    await user.click(await screen.findByRole('button', { name: 'دستهٔ جدید' }));
    await user.type(await screen.findByLabelText(/^نام/), 'ورق رنگی');

    await user.keyboard('{Escape}');

    // Still open, with the question asked — the drawer on this same screen
    // has always behaved this way and the two must not disagree.
    const question = await screen.findByText(/هرچه در این فرم نوشته‌اید از بین می‌رود/);
    expect(screen.getByDisplayValue('ورق رنگی')).toBeInTheDocument();

    // The form underneath has an «انصراف» of its own; this is the dialog's.
    const confirmDialog = question.closest('[role="dialog"]') as HTMLElement;
    await user.click(within(confirmDialog).getByRole('button', { name: 'انصراف' }));
    expect(screen.getByDisplayValue('ورق رنگی')).toBeInTheDocument();

    // Asking again and agreeing this time is the only path that discards.
    await user.keyboard('{Escape}');
    await user.click(await screen.findByRole('button', { name: /بستن و ازدست‌دادن تغییرات/ }));
    await waitFor(() => expect(screen.queryByDisplayValue('ورق رنگی')).toBeNull());
  });

  it('closes straight away when nothing has been typed', async () => {
    const user = renderManager();
    await user.click(await screen.findByRole('button', { name: 'دستهٔ جدید' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('previews a sub-category URL under its category, not at the root', async () => {
    const user = renderManager();
    await user.click(await screen.findByRole('button', { name: 'زیر‌دستهٔ جدید در میلگرد' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(await screen.findByLabelText(/^نام/), 'ساده');
    // `/prices/{sub}` is a 404: the real page is under its category, and the
    // admin pastes what this preview shows into articles and chats.
    await waitFor(() =>
      expect(dialog.textContent).toContain('نشانی صفحه: /prices/rebar/'),
    );
  });
});
