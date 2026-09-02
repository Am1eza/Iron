import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { getAuditEntry } from '@/lib/server/repos/auditRepo';
import {
  restoreCategory,
  restoreSku,
  restoreSubCategory,
  type CategorySubtreeSnapshot,
  type SubCategorySubtreeSnapshot,
} from '@/lib/server/repos/catalogAdminRepo';
import { revalidateCatalog } from '@/lib/server/utils/catalogRoute';

const RESTORABLE_ACTIONS = new Set(['catalog.category.delete', 'catalog.sub.delete', 'catalog.sku.delete']);

/**
 * Undo a catalog delete from its own audit entry.
 *
 * There is still no `deletedAt` and no trash bin — `PATCH`/`DELETE` mean
 * exactly what they say everywhere else in this repo — but a category or
 * sub-category delete now snapshots the whole subtree it cascaded away
 * (`_subtree` on the audit `before`, see `catalogAdminRepo.deleteCategory`),
 * so a mistaken delete has something better than "restore the last nightly
 * backup and lose everything since" to recover from. Price history is never
 * restored (never kept, by design); a restored product starts chartless.
 */
async function POSTImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;

  const entry = await getAuditEntry(id);
  if (!entry) return NextResponse.json({ error: 'not_found', message: 'رخداد یافت نشد.' }, { status: 404 });
  if (!RESTORABLE_ACTIONS.has(entry.action)) {
    return NextResponse.json(
      { error: 'not_restorable', message: 'این رخداد قابل بازگردانی نیست.' },
      { status: 400 },
    );
  }
  if (!entry.before || typeof entry.before !== 'object') {
    return NextResponse.json({ error: 'no_snapshot', message: 'برای این حذف اسنپ‌شاتی ثبت نشده.' }, { status: 400 });
  }

  if (entry.action === 'catalog.sku.delete') {
    const restored = await restoreSku(entry.before as never);
    if (!restored) {
      return NextResponse.json(
        { error: 'already_exists', message: 'این کالا از قبل موجود است — چیزی برای بازگردانی نیست.' },
        { status: 409 },
      );
    }
    await audit(auth.session.id, 'catalog.sku.restore', { type: 'sku', id: restored.id }, null, restored);
    await revalidateCatalog('sku');
    return NextResponse.json({ sku: restored });
  }

  if (entry.action === 'catalog.sub.delete') {
    const { _subtree, ...row } = entry.before as { _subtree?: SubCategorySubtreeSnapshot } & Record<string, unknown>;
    const result = await restoreSubCategory(row as never, (_subtree?.skus ?? []) as never);
    if (!result.subCategory) {
      return NextResponse.json(
        { error: 'already_exists', message: 'این زیر‌دسته از قبل موجود است — چیزی برای بازگردانی نیست.' },
        { status: 409 },
      );
    }
    await audit(
      auth.session.id,
      'catalog.sub.restore',
      { type: 'sub', id: result.subCategory.id },
      null,
      { subCategory: result.subCategory, skusRestored: result.skus.length },
    );
    await revalidateCatalog('taxonomy');
    return NextResponse.json({ subCategory: result.subCategory, skusRestored: result.skus.length });
  }

  // catalog.category.delete
  const { _subtree, ...row } = entry.before as { _subtree?: CategorySubtreeSnapshot } & Record<string, unknown>;
  const result = await restoreCategory(
    row as never,
    (_subtree?.subCategories ?? []) as never,
    (_subtree?.skus ?? []) as never,
  );
  if (!result.category) {
    return NextResponse.json(
      { error: 'already_exists', message: 'این دسته از قبل موجود است — چیزی برای بازگردانی نیست.' },
      { status: 409 },
    );
  }
  await audit(
    auth.session.id,
    'catalog.category.restore',
    { type: 'category', id: result.category.id },
    null,
    { category: result.category, subCategoriesRestored: result.subCategories.length, skusRestored: result.skus.length },
  );
  await revalidateCatalog('taxonomy');
  return NextResponse.json({
    category: result.category,
    subCategoriesRestored: result.subCategories.length,
    skusRestored: result.skus.length,
  });
}

export const POST = withApiErrorHandling(POSTImpl);
