/**
 * The admin half of the 1405/06/09 «عرض / ضخامت / بال» pass.
 *
 * All three are the SAME stored column (`skus.dimensions`), offered under a
 * different name per sub-category. That is what makes the form the half that
 * can break silently: a public table can rename a header and stay correct
 * while the box an operator types into still asks for the old fact — «عرض×طول
 * ورق» above a field the page now publishes as a bare «عرض», or «مثلاً
 * ۱۰۰۰×۲۰۰۰» under a «بال». The label, the helper and the placeholder must all
 * resolve from the one `dimensionsLabel` the public page uses.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  { id: 'c4', slug: 'sheet', name: 'ورق' },
  { id: 'c5', slug: 'angle-channel', name: 'نبشی و ناودانی' },
  { id: 'c6', slug: 'pipe', name: 'لوله' },
] as AdminCategory[];

/** Live slugs, read from the production catalog API (2026-08-31). */
const SUBS = [
  { id: 's-black', categoryId: 'c4', slug: 'black', name: 'ورق سیاه' },
  { id: 's-oiled', categoryId: 'c4', slug: 'oiled', name: 'ورق روغنی' },
  { id: 's-pickled', categoryId: 'c4', slug: 'pickled', name: 'ورق اسیدشویی' },
  { id: 's-nabshi', categoryId: 'c5', slug: 'nabshi', name: 'نبشی' },
  { id: 's-valpost', categoryId: 'c5', slug: 'val-post', name: 'وال پست' },
  { id: 's-scaffold', categoryId: 'c6', slug: 'scaffold', name: 'داربستی' },
  { id: 's-seamless', categoryId: 'c6', slug: 'seamless-internal', name: 'لوله مانیسمان داخلی' },
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

/** The one shared `skus.dimensions` input, whatever it is called here.
 *  `PickerInput` names only its datalist from the `id` prop, so the `list`
 *  attribute is what identifies which stored column a box writes. */
function dimensionsBox(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>('input[list="sku-dimensions-options"]');
}

describe('SkuDrawer — the shared dimensions box asks for the fact it is named after', () => {
  it.each([
    ['s-oiled', 'عرض', 'مثلاً ۱۲۵۰'],
    ['s-pickled', 'سایز', 'مثلاً ۱۲۵۰'],
    ['s-black', 'سایز', 'مثلاً ۱۲۵۰ یا ۱۰۰۰×۲۰۰۰'],
    ['s-valpost', 'بال', 'مثلاً ۷'],
    ['s-nabshi', 'ضخامت', 'مثلاً ۴'],
    ['s-scaffold', 'ضخامت', 'مثلاً ۴'],
  ])('labels %s’s box «%s» and prompts «%s»', (subId, label, placeholder) => {
    openDrawer(subId);
    const box = screen.getByLabelText(label);
    expect(box).toBe(dimensionsBox());
    expect(box.getAttribute('placeholder')).toBe(placeholder);
  });

  it('asks ورق روغنی for a width, not for the «عرض×طول» its سیاه sibling stores', () => {
    // The regression a category-keyed hint produced: one parent, two meanings.
    openDrawer('s-oiled');
    expect(dimensionsBox()!.getAttribute('placeholder')).not.toContain('×');
    expect(document.body.textContent).toContain('عرض ورق به میلی‌متر');
    expect(document.body.textContent).not.toContain('عرض×طول ورق');
  });

  it('asks وال‌پست for a flange, not for the ضخامت its نبشی siblings store', () => {
    openDrawer('s-valpost');
    expect(document.body.textContent).toContain('پهنای بال به میلی‌متر');
    expect(document.body.textContent).not.toContain('ضخامت مقطع به میلی‌متر');
    // …and وال‌پست's own thickness stays where it lives, in `grade`
    expect(screen.getByLabelText('ضخامت').getAttribute('list')).toBe('sku-grade-options');
  });

  it('offers no box at all where the source publishes no such column', () => {
    // لوله مانیسمان is priced on «رده»; a rendered-but-permanently-empty
    // field is the thing this allow-list exists to prevent.
    openDrawer('s-seamless');
    expect(dimensionsBox()).toBeNull();
    expect(screen.queryByLabelText('ضخامت')).toBeNull();
    expect(screen.queryByLabelText('ابعاد')).toBeNull();
  });
});
