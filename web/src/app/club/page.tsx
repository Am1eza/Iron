import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { ClubLanding } from '@/components/club/ClubLanding';

export const metadata: Metadata = buildMetadata({
  title: 'باشگاه مشتریان آهن‌تایم',
  description:
    'با هر استعلام و خرید، سطح خود را در باشگاه مشتریان آهن‌تایم ارتقا دهید: تخفیف پلکانی، اولویت در تأمین، هشدار قیمت اختصاصی و مشاور اختصاصی.',
  path: routes.club(),
});

export default function ClubPage() {
  return <ClubLanding />;
}
