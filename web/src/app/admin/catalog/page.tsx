import { Heading, Text, Stack } from '@/components/ui';
import { CatalogManager } from '@/components/admin/catalog/CatalogManager';
import { requirePermission } from '@/lib/auth/guards';
import { routes } from '@/lib/routes';

/** /admin/catalog — categories, sub-categories and SKUs (soft-delete only). */
export default async function AdminCatalogPage() {
  await requirePermission('catalog:read', routes.admin.dashboard());
  return (
    <Stack gap={5}>
      <div>
        <Heading level={1}>کاتالوگ</Heading>
        <Text color="muted">
          محصولات هر دسته را مدیریت کنید. حذف همیشه نرم است — تاریخچهٔ قیمت هرگز پاک نمی‌شود.
        </Text>
      </div>
      <CatalogManager />
    </Stack>
  );
}
