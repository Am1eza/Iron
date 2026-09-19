import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderWithIntl } from '@/test/renderWithIntl';
import enMessages from '../../../messages/en.json';
import zhMessages from '../../../messages/zh.json';
import faMessages from '../../../messages/fa.json';
import type { PriceRow } from '@/lib/types/domain';
import type { SubCat } from '@/lib/data/nav';
import { PriceTable } from './PriceTable';

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/en/prices/pipe',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  Link: ({
    href,
    children,
    prefetch: _prefetch,
    ...rest
  }: {
    href: string;
    children?: React.ReactNode;
    prefetch?: boolean;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const PERSIAN = /[؀-ۿ]/;
const UNKNOWN_MILL = 'یک کارخانه‌ی جدید';

function row(id: string, over: Partial<PriceRow> = {}): PriceRow {
  return {
    id,
    subCategoryId: 'gas',
    categoryId: 'pipe',
    slug: id,
    name: 'لوله گازی',
    size: '۳ اینچ',
    factory: 'لوله سپاهان',
    grade: 'گالوانیزه',
    unit: 'kg',
    priceBasis: 'kg',
    theoreticalWeightKg: 7.4,
    current: {
      skuId: id,
      price: 1_234_500,
      unit: 'kg',
      deliveryTime: '۲۴ ساعت',
      vatIncluded: false,
      movementDir: 'up',
      movementPct: 1.25,
      updatedAt: new Date('2026-09-17T18:23:00Z').toISOString(),
      isStale: false,
    },
    ...over,
  } as PriceRow;
}

const SUBS: SubCat[] = [
  { slug: 'gas', name: 'لوله گازی', nameEn: 'Gas Pipe', nameZh: '燃气管', nameAr: 'أنبوب غاز' },
];
const CATEGORY = {
  id: 'pipe',
  slug: 'pipe',
  name: 'لوله',
  nameEn: 'Pipe',
  nameZh: '钢管',
  nameAr: 'الأنابيب',
  order: 0,
  iconId: '',
};

function renderIn(locale: 'fa' | 'en' | 'zh', messages: typeof faMessages) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithIntl(
    <QueryClientProvider client={qc}>
      <PriceTable
        rows={[
          row('pipe-gas-1'),
          row('pipe-gas-2', { size: '۴ اینچ', factory: 'خلیج فارس' }),
          row('pipe-gas-3', { size: '۱ اینچ', factory: UNKNOWN_MILL, current: { ...row('x').current, deliveryTime: 'تحویل فوری', movementDir: 'flat', movementPct: 0 } }),
        ]}
        subs={SUBS}
        category={CATEGORY as never}
        categorySlug="pipe"
      />
    </QueryClientProvider>,
    { locale, messages },
  );
}

/** The table's visible copy, including the labels reflowed cards print from `data-label`. */
function visibleText(container: HTMLElement) {
  const labels = [...container.querySelectorAll('[data-label]')].map((e) => e.getAttribute('data-label')).join(' ');
  return `${container.textContent} ${labels}`;
}

describe('PriceTable — a non-Persian page is not a Persian table in an English shell', () => {
  it('en: labels, values, digits, dates and mill names follow the locale', () => {
    const { container } = renderIn('en', enMessages as never);
    const text = visibleText(container);

    // The one mill we hold no Latin name for stays Persian and says so.
    const unknownMill = [...container.querySelectorAll('a')].find((a) => a.textContent === UNKNOWN_MILL);
    expect(unknownMill?.getAttribute('lang')).toBe('fa');
    expect(text.split(UNKNOWN_MILL).join(' ')).not.toMatch(PERSIAN);

    expect(text).toContain('Sepahan'); // «لوله سپاهان» → Latin
    expect(text).toContain('Persian Gulf'); // «خلیج فارس»
    expect(text).toContain('1,234,500'); // Latin digits + comma, not ۱٬۲۳۴٬۵۰۰
    expect(text).toContain('3 in'); // «۳ اینچ»
    expect(text).toContain('24 hours');
    expect(text).toContain('Immediate delivery');
    expect(text).toContain('09/17'); // Gregorian, not the Jalali «۰۶/۲۶»
    expect(text).not.toMatch(/[۰-۹]/);
  });

  it('zh: same rule, Chinese words and Latin digits', () => {
    const { container } = renderIn('zh', zhMessages as never);
    const text = visibleText(container);
    expect(text).toContain('24 小时');
    expect(text).toContain('3 英寸');
    expect(text.split(UNKNOWN_MILL).join(' ')).not.toMatch(PERSIAN);
    expect(text).not.toMatch(/[۰-۹]/);
  });

  it('fa: unchanged — Jalali dates, Persian digits, Persian mill names', () => {
    const { container } = renderIn('fa', faMessages);
    const text = visibleText(container);
    expect(text).toContain('لوله سپاهان');
    expect(text).toContain('۱٬۲۳۴٬۵۰۰');
    expect(text).toContain('۲۴ ساعت');
    expect(text).toMatch(/۰۶\/۲۶/);
  });
});
