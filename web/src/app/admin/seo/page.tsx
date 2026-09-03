import { Suspense } from 'react';
import { Heading, Text, Stack } from '@/components/ui';
import { SeoDashboard } from '@/components/admin/dashboard/SeoDashboard';
import { RedirectsManager } from '@/components/admin/dashboard/RedirectsManager';
import { SearchConsoleConnection } from '@/components/admin/dashboard/SearchConsoleConnection';
import { requirePermission } from '@/lib/auth/guards';
import { routes } from '@/lib/routes';

/** /admin/seo — self-computed content SEO health with actionable fix lists,
 *  real organic-search traffic pulled from Matomo (which landing pages are
 *  actually winning, not just which pass an on-page checklist), catalog
 *  visibility (active SKUs stranded under an inactive sub-category), and
 *  visibility/control over every redirect on the site (US-14.3). Search
 *  Console keyword/impression data is a separate, deeper layer this page
 *  links out to once connected (`SearchConsoleConnection`) — Google is still
 *  the only source for "what did people search before clicking," so this
 *  page complements it rather than replacing it. */
export default async function AdminSeoPage() {
  await requirePermission('content:write', routes.admin.seo());
  return (
    <Stack gap={5}>
      <div>
        <Heading level={1}>سئو</Heading>
        <Text color="muted">
          سلامت سئوی محتوا و کاتالوگ، محاسبه‌شده روی دادهٔ خود سایت، به‌علاوهٔ بازدید واقعی از جست‌وجو (Matomo) — هر
          مورد قرمز، یک کار مشخص است. برای کلمات کلیدی و رتبه در گوگل، Search Console را در پایین همین صفحه وصل کنید.
        </Text>
      </div>
      <SeoDashboard />
      {/* Reads `?searchConsole=…` (the OAuth callback's outcome) via
          `useSearchParams`, which Next requires to sit under a Suspense
          boundary — without one the whole route is forced out of static
          rendering at build time. */}
      <Suspense fallback={null}>
        <SearchConsoleConnection />
      </Suspense>
      <RedirectsManager />
    </Stack>
  );
}
