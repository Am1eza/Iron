import { Heading, Text, Stack } from '@/components/ui';
import { SeoDashboard } from '@/components/admin/dashboard/SeoDashboard';
import { RedirectsManager } from '@/components/admin/dashboard/RedirectsManager';
import { requirePermission } from '@/lib/auth/guards';
import { routes } from '@/lib/routes';

/** /admin/seo — self-computed content SEO health with actionable fix lists,
 *  plus visibility/control over every redirect on the site (US-14.3). This
 *  is deliberately NOT a replacement for Google Search Console or Matomo:
 *  those answer "how is Google/a visitor actually treating the site" from
 *  outside, days-delayed and requiring separate accounts most content
 *  editors don't hold. This page answers a narrower, faster question this
 *  team's own editor is equipped to act on today — "does THIS article
 *  follow basic on-page conventions, and where does the site currently send
 *  visitors on purpose." */
export default async function AdminSeoPage() {
  await requirePermission('content:write', routes.admin.seo());
  return (
    <Stack gap={5}>
      <div>
        <Heading level={1}>سئو</Heading>
        <Text color="muted">
          سلامت سئوی محتوا، محاسبه‌شده روی دادهٔ خود سایت — هر مورد قرمز، یک کار مشخص برای سردبیر است. برای رتبه و
          بازدید واقعی در گوگل، به Search Console و Matomo مراجعه کنید؛ این صفحه مکمل آن‌هاست، نه جایگزینشان.
        </Text>
      </div>
      <SeoDashboard />
      <RedirectsManager />
    </Stack>
  );
}
