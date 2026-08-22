import { Heading, Text, Stack } from '@/components/ui';
import { PriceSyncPanel } from '@/components/admin/pricing/PriceSyncPanel';
import { requirePermission } from '@/lib/auth/guards';
import { routes } from '@/lib/routes';

/** /admin/pricing/sync — what the automated price mirror did, and the
 *  per-SKU opt-out. Inherits `pricing:write` from the `/admin/pricing`
 *  prefix in ADMIN_PATH_PERMISSIONS; re-checked here as defense in depth. */
export default async function AdminPriceSyncPage() {
  await requirePermission('pricing:write', routes.admin.dashboard());
  return (
    <Stack gap={5}>
      <div>
        <Heading level={1}>به‌روزرسانی خودکار قیمت</Heading>
        <Text color="muted">
          دو بار در روز — ساعت ۸:۰۰ و ۱۲:۰۰ به وقت تهران — قیمت‌های آهن‌آنلاین خوانده و روی کالاهایی که
          کارخانه و سایزشان دقیقاً مطابقت دارد نوشته می‌شود. هر نوشتن و هر رد شدن، با دلیلش، اینجا ثبت
          است. اگر قیمتی اشتباه بود، همین‌جا «دستی نگه‌دار» را بزنید تا از اجرای بعدی کنار گذاشته شود.
        </Text>
      </div>
      <PriceSyncPanel />
    </Stack>
  );
}
