import { Heading, Text, Stack } from '@/components/ui';
import { CatalogManager } from '@/components/admin/catalog/CatalogManager';
import { requirePermission } from '@/lib/auth/guards';
import { routes } from '@/lib/routes';

/**
 * /admin/catalog — categories, sub-categories and SKUs.
 *
 * Deletion here is PERMANENT and cascading (see the DELETE handlers under
 * api/admin/catalog): the row, everything filed under it and their price
 * history all go, and nothing brings them back. This page used to promise the
 * opposite in its own subtitle, which is worse than saying nothing — an admin
 * reassured by the header reads straight past the one warning that is true,
 * the confirm dialog.
 */
export default async function AdminCatalogPage() {
  await requirePermission('catalog:read', routes.admin.dashboard());
  return (
    <Stack gap={5}>
      <div>
        <Heading level={1}>کاتالوگ</Heading>
        <Text color="muted">
          محصولات هر دسته را مدیریت کنید. حذف در این صفحه دائمی است — کالا و هر چیزی که زیرش است،
          به‌همراه تاریخچهٔ قیمتشان، برای همیشه پاک می‌شوند و راه بازگرداندن ندارند.
        </Text>
      </div>
      <CatalogManager />
    </Stack>
  );
}
