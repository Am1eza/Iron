import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { requireUser } from '@/lib/auth/guards';
import { RequestFlow } from '@/components/forms/RequestFlow';
import { RequestPageHeading } from '@/components/forms/RequestPageHeading';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.request');
  return buildMetadata({ title: t('title'), noindex: true });
}

/**
 * ثبت درخواست — auth-gated. Guests are redirected to the OTP login (and come
 * back here). There is no public contact form: the profile already knows the
 * user, so the flow is just "review the inquiry basket, add a note, submit" —
 * the request then lives in /account/requests.
 */
export default async function RequestPage() {
  const user = await requireUser(routes.request());

  return (
    <div className="container" style={{ paddingBlock: 'var(--space-16)', maxInlineSize: 720 }}>
      <RequestPageHeading userLabel={user.name ?? user.mobile} />
      <RequestFlow />
    </div>
  );
}
