import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container, Section, Stack, Breadcrumbs } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { PageHero } from '@/components/company/PageHero';
import { FeatureGrid, type Feature } from '@/components/company/FeatureGrid';
import {
  TagIcon,
  ClockIcon,
  SparkIcon,
  ChartIcon,
  CheckCircleIcon,
  PhoneIcon,
} from '@/components/primitives/icons';

export const metadata: Metadata = buildMetadata({
  title: 'چرا آهن‌تایم؟',
  description:
    'مزیت‌های آهن‌تایم: ارزان‌تر با حذف واسطه، تحویل ۲۴ ساعته، مشاور هوش مصنوعی، قیمت شفاف و به‌روز، تأمین مستقیم از کارخانه و پشتیبانی واقعی.',
  path: routes.why(),
});

const advantages: Feature[] = [
  {
    title: 'ارزان‌تر، با حذف واسطه',
    desc: 'خرید مستقیم از کارخانه زنجیرهٔ دلال‌ها را کوتاه می‌کند؛ همان کالا، با قیمت منصفانه‌تر.',
    icon: <TagIcon size={22} />,
  },
  {
    title: 'سریع‌تر، تحویل ۲۴ ساعته',
    desc: 'هماهنگی حمل و بارگیری چابک؛ در بیشتر مقاطع پرتقاضا، تحویل در بازهٔ ۲۴ ساعت.',
    icon: <ClockIcon size={22} />,
  },
  {
    title: 'مشاور هوش مصنوعی',
    desc: 'دستیار هوشمند آهن‌تایم پیش از خرید پاسخ می‌دهد؛ انتخاب سایز و گرید، برآورد وزن و هزینه.',
    icon: <SparkIcon size={22} />,
    accent: true,
  },
  {
    title: 'قیمت شفاف و به‌روز',
    desc: 'قیمت‌ها لحظه‌ای به‌روزرسانی می‌شود و نوسان، وزن شاخه و زمان تحویل کنار هر کالا روشن است.',
    icon: <ChartIcon size={22} />,
  },
  {
    title: 'تأمین مستقیم از کارخانه',
    desc: 'اصالت کالا و کیفیت استاندارد را با تأمین مستقیم از تولیدکننده تضمین می‌کنیم.',
    icon: <CheckCircleIcon size={22} />,
  },
  {
    title: 'پشتیبانی واقعی',
    desc: 'کارشناسان ما برای نهایی‌سازی پیش‌فاکتور، موجودی و تحویل با شما تماس می‌گیرند؛ انسان واقعی، نه ربات.',
    icon: <PhoneIcon size={22} />,
  },
];

export default function WhyPage() {
  const crumbs = [
    { label: 'خانه', href: routes.home() },
    { label: 'چرا آهن‌تایم' },
  ];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />

      <Section space={10} aria-labelledby="why-title">
        <Stack gap={10}>
          <Stack gap={6}>
            <Breadcrumbs items={crumbs} />
            <PageHero
              id="why-title"
              eyebrow="چرا آهن‌تایم؟"
              title="خرید فولاد، شفاف و بی‌دردسر"
              lead="ما واسطه را حذف کردیم، قیمت را شفاف کردیم و مشاوره را پیش از خرید در دسترس گذاشتیم تا شما با خیال راحت تصمیم بگیرید."
            />
          </Stack>

          <FeatureGrid items={advantages} />

          <PageHero
            eyebrow="آماده‌اید شروع کنید؟"
            title="قیمت‌ها را ببینید یا با مشاور صحبت کنید"
            lead="چه پیمانکار باشید و چه سازندهٔ شخصی، آهن‌تایم کنار شماست؛ اول مشورت، بعد خرید."
            ctas={[
              { label: 'مشاهدهٔ قیمت روز', href: routes.prices(), variant: 'primary', arrow: true },
              { label: 'مشاور هوشمند', href: routes.ai(), variant: 'secondary' },
            ]}
          />
        </Stack>
      </Section>
    </Container>
  );
}
