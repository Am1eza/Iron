/**
 * `generateMetadata` for a sub-category — the page half of the soft-404 fix.
 *
 * The regression: 17 of production's 85 sub-categories (20 %) held zero rows
 * and every one answered HTTP 200 with no `noindex` and a description that
 * read «جدول قیمت روز مش استنلس استیل با نوسان، وزن شاخه، استاندارد و زمان
 * تحویل» — a price table promised on a page that has none. `sitemap.test.ts`
 * pins the other half (they must agree); the rule itself is in
 * `_seo/indexability.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const catalog = vi.hoisted(() => ({
  isLiveCatalog: vi.fn(() => true),
  getCategories: vi.fn(),
  getSubsMap: vi.fn(),
  getSubRows: vi.fn(),
  getRows: vi.fn(async () => []),
  getFactoryOrder: vi.fn(async () => []),
}));

vi.mock('@/lib/server/catalog', () => catalog);

const params = (category: string, sub: string) => ({ params: Promise.resolve({ category, sub }) });

const row = (factory?: string) => ({
  slug: 'steel-mesh-3mm',
  name: 'مش استنلس استیل ۳',
  categoryId: 'steel',
  subCategoryId: 'mesh',
  factory,
  current: { updatedAt: '2026-02-02T00:00:00.000Z' },
});

beforeEach(() => {
  vi.clearAllMocks();
  catalog.isLiveCatalog.mockReturnValue(true);
  catalog.getCategories.mockResolvedValue([{ id: 'c1', slug: 'steel', name: 'استیل', order: 0 }]);
  catalog.getSubsMap.mockResolvedValue({
    steel: [{ slug: 'mesh', name: 'مش استنلس استیل' }],
  });
});

async function metadataFor(category: string, sub: string) {
  vi.resetModules();
  const { generateMetadata } = await import('./page');
  return generateMetadata(params(category, sub));
}

describe('sub-category metadata · zero rows', () => {
  beforeEach(() => {
    catalog.getSubRows.mockResolvedValue([]);
  });

  it('is noindex', async () => {
    const meta = await metadataFor('steel', 'mesh');

    expect(meta.robots).toMatchObject({ index: false, follow: false });
  });

  it('promises no price table in either the title or the description', async () => {
    const meta = await metadataFor('steel', 'mesh');

    expect(meta.title).not.toContain('قیمت روز');
    expect(meta.description).not.toContain('جدول قیمت روز');
    // …and says what is actually true of the page.
    expect(meta.description).toContain('هنوز کالایی');
  });

  it('still points its canonical at itself', async () => {
    // A noindex page whose canonical names a DIFFERENT URL gives Google two
    // contradictory instructions about the same document. Withholding the
    // page is the instruction; moving its identity is not.
    const meta = await metadataFor('steel', 'mesh');

    expect(meta.alternates?.canonical).toBe('https://ahantime.com/prices/steel/mesh');
  });
});

describe('sub-category metadata · with rows', () => {
  it('is indexable and describes the table it really has', async () => {
    catalog.getSubRows.mockResolvedValue([row('کاوه'), row('کاوه'), row()]);

    const meta = await metadataFor('steel', 'mesh');

    expect(meta.robots).toBeUndefined();
    expect(meta.title).toContain('قیمت روز');
    expect(meta.description).toContain('جدول قیمت روز');
    // Three rows, one distinct mill that publishes a name.
    expect(meta.description).toContain('۳ کالا از ۱ کارخانه');
  });

  it('omits the mill count for a family that withholds mill names', async () => {
    catalog.getSubRows.mockResolvedValue([row(), row()]);

    const meta = await metadataFor('steel', 'mesh');

    expect(meta.description).toContain('۲ کالا');
    expect(meta.description).not.toContain('کارخانه');
  });

  it('crosses back the moment the first row is filed', async () => {
    catalog.getSubRows.mockResolvedValue([row()]);

    // The boundary is what makes this self-healing: no deploy is needed to
    // put `/prices/steel/mesh` back in the index once it holds a SKU.
    expect((await metadataFor('steel', 'mesh')).robots).toBeUndefined();
  });
});

describe('sub-category metadata · unknown sub-category', () => {
  it('stays noindex, unchanged by this rule', async () => {
    catalog.getSubRows.mockResolvedValue([]);

    const meta = await metadataFor('steel', 'does-not-exist');

    expect(meta.robots).toMatchObject({ index: false, follow: false });
  });
});
